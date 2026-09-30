// KEREK vevo-data Edge Function (v2.55.0 — C1 biztonság)
// A vevő SAJÁT adatainak proxyja, aláírt vevő-tokennel. Minden kérés a token vevőjére szűkül,
// a rendelési határidőt / lezárt napokat a SZERVER is ellenőrzi (nem csak a böngésző).
//
// body: { token, table, method, query?, body? }  vagy  { token, action:'audit', details }
// Táblák: orders, order_status, messages, standing_orders, push_subscriptions

import {
  CORS, json, admin, rateLimit, clientIp, verifyToken, dayEditable, deadlinePassed, defaultDeadline,
} from '../_shared/vevo.ts'

const ALLOWED: Record<string, string[]> = {
  orders: ['GET', 'POST', 'DELETE'],
  order_status: ['GET', 'POST'],
  messages: ['GET', 'POST', 'DELETE'],
  standing_orders: ['GET', 'POST'],
  push_subscriptions: ['POST', 'DELETE'],
}
const CONFLICT: Record<string, string> = {
  orders: 'client_id,year,month,day,product_id',
  order_status: 'client_id,year,month,day',
  standing_orders: 'client_id,product_id,year,month',
  push_subscriptions: 'client_id,endpoint',
}
const ADMIN_PREFIX = /^\s*(📨\s*Admin:|📢)/u
const int = (v: unknown) => Number.isInteger(Number(v)) ? Number(v) : NaN
const dayKey = (y: number, m: number, d: number) => `${y}-${m}-${d}`

// GET query-string szűrése: csak egyszerű select (beágyazás nélkül), + kötelező client_id szűrő
function safeQuery(q: string, cid: string): string | null {
  const p = new URLSearchParams(q || '')
  const out = new URLSearchParams()
  for (const [k, v] of p.entries()) {
    if (k === 'select') { if (!/^[a-z_,*]+$/.test(v)) return null; out.append(k, v); continue }
    if (k === 'client_id') continue                       // a kliens által küldött szűrőt eldobjuk
    if (!/^[a-z_]+$/.test(k)) return null
    if (/[()]/.test(v) && !/^(in|not\.in)\.\([^()]*\)$/.test(v)) return null   // or()/and()/beágyazás tiltva
    out.append(k, v)
  }
  out.append('client_id', `eq.${cid}`)
  return out.toString()
}

async function pg(method: string, path: string, body?: unknown, prefer?: string) {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const headers: Record<string, string> = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  if (prefer) headers['Prefer'] = prefer
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/${path}`, { method, headers, body: body == null ? undefined : JSON.stringify(body) })
  const text = await r.text()
  if (!r.ok) throw Object.assign(new Error(text || r.statusText), { status: r.status })
  return text ? JSON.parse(text) : null
}

// A vevő érintett napjainak státusz-sorai (határidő + állapot)
async function statusMap(cid: string, days: Array<[number, number, number]>) {
  const map = new Map<string, any>()
  const months = [...new Set(days.map(([y, m]) => `${y}-${m}`))]
  for (const ym of months) {
    const [y, m] = ym.split('-').map(Number)
    const rows = await pg('GET', `order_status?select=year,month,day,status,deadline,admin_note&client_id=eq.${encodeURIComponent(cid)}&year=eq.${y}&month=eq.${m}`)
    ;(rows || []).forEach((r: any) => map.set(dayKey(r.year, r.month, r.day), r))
  }
  return map
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const ip = clientIp(req)
  try {
    if (!rateLimit('vd:' + ip, 180)) return json({ error: 'rate_limit' }, 429)
    const b = await req.json().catch(() => ({}))
    const s = await verifyToken(b?.token)
    if (!s) return json({ error: 'invalid_token' }, 401)
    const cid = s.cid, isAdmin = !!s.client.is_admin
    const enc = encodeURIComponent(cid)

    // --- műveleti napló (a vevő saját eseményei) ---
    if (b.action === 'audit') {
      if (s.ro) return json({ data: true })
      const action = String(b.log_action || '').slice(0, 40).replace(/[^a-z_]/g, '')
      if (!['order_save', 'order_clear', 'message_send', 'standing_change', 'logout'].includes(action)) return json({ error: 'forbidden' }, 403)
      await pg('POST', 'audit_log', { action, entity_name: String(s.client.name || '').replace(/^\[\w+\]\s*/, ''), details: String(b.details || '').slice(0, 200) })
      return json({ data: true })
    }

    const table = String(b.table || ''), method = String(b.method || '').toUpperCase()
    if (!ALLOWED[table]?.includes(method)) return json({ error: 'forbidden', detail: `${table}:${method}` }, 403)
    if (s.ro && method !== 'GET') return json({ error: 'readonly', detail: 'Előnézetben nem menthető.' }, 403)

    // ---------------- GET ----------------
    if (method === 'GET') {
      const q = safeQuery(String(b.query || ''), cid)
      if (q == null) return json({ error: 'bad_query' }, 400)
      return json({ data: await pg('GET', `${table}?${q}`) })
    }

    // ---------------- POST (insert / upsert) ----------------
    if (method === 'POST') {
      const rows: any[] = (Array.isArray(b.body) ? b.body : [b.body]).filter(Boolean)
      if (!rows.length || rows.length > 400) return json({ error: 'bad_body' }, 400)

      if (table === 'orders') {
        const clean = rows.map(r => ({ client_id: cid, year: int(r.year), month: int(r.month), day: int(r.day), product_id: int(r.product_id), quantity: int(r.quantity) }))
        if (clean.some(r => [r.year, r.month, r.day, r.product_id, r.quantity].some(isNaN) || r.quantity < 1 || r.quantity > 999 || r.month < 0 || r.month > 11)) return json({ error: 'bad_body' }, 400)
        const st = await statusMap(cid, clean.map(r => [r.year, r.month, r.day]))
        // a lezárt (múltbeli / határidőn túli / kisütött) napok sorait KIHAGYJUK — nem módosíthatók
        const ok = clean.filter(r => dayEditable(r.year, r.month, r.day, st.get(dayKey(r.year, r.month, r.day)), isAdmin))
        const skipped = [...new Set(clean.filter(r => !ok.includes(r)).map(r => r.day))]
        const data = ok.length ? await pg('POST', `orders?on_conflict=${CONFLICT.orders}`, ok, 'resolution=merge-duplicates,return=representation') : []
        return json({ data, skipped_days: skipped })
      }

      if (table === 'order_status') {
        const clean = rows.map(r => ({ year: int(r.year), month: int(r.month), day: int(r.day), status: String(r.status || '') }))
        if (clean.some(r => [r.year, r.month, r.day].some(isNaN))) return json({ error: 'bad_body' }, 400)
        const st = await statusMap(cid, clean.map(r => [r.year, r.month, r.day]))
        const out: any[] = []
        for (const r of clean) {
          const cur = st.get(dayKey(r.year, r.month, r.day))
          // a határidőt a SZERVER számolja (a meglévőt megtartja), a kliens értékét figyelmen kívül hagyja
          const deadline = cur?.deadline || defaultDeadline(r.year, r.month, r.day).toISOString()
          if (r.status === 'pending') {
            if (cur?.status === 'pending') continue
            if (!dayEditable(r.year, r.month, r.day, cur, isAdmin)) continue          // lezárt napot nem nyithat újra
            out.push({ client_id: cid, year: r.year, month: r.month, day: r.day, status: 'pending', deadline })
          } else if (r.status === 'confirmed') {
            // jóváhagyás: az admin módosításának elfogadása, VAGY a határidő lejárta után (auto-zárás)
            const okModified = cur?.status === 'modified'
            const okExpired = deadlinePassed(r.year, r.month, r.day, cur) && !['confirmed', 'cancelled', 'fulfilled'].includes(cur?.status)
            if (!okModified && !okExpired) continue
            out.push({ client_id: cid, year: r.year, month: r.month, day: r.day, status: 'confirmed', confirmed_at: new Date().toISOString(), deadline })
          }
          // más állapotot (modified / cancelled / fulfilled) a vevő nem állíthat — csendben kihagyjuk
        }
        if (!out.length) return json({ data: [] })
        return json({ data: await pg('POST', `order_status?on_conflict=${CONFLICT.order_status}`, out, 'resolution=merge-duplicates,return=representation') })
      }

      if (table === 'messages') {
        const clean = rows.map(r => ({ client_id: cid, year: int(r.year), month: int(r.month), text: String(r.text || '').trim().slice(0, 1000) }))
        if (clean.some(r => isNaN(r.year) || isNaN(r.month) || !r.text || ADMIN_PREFIX.test(r.text))) return json({ error: 'bad_body' }, 400)
        if (!rateLimit('msg:' + cid, 6)) return json({ error: 'rate_limit' }, 429)
        return json({ data: await pg('POST', 'messages', clean, 'return=representation') })
      }

      if (table === 'standing_orders') {
        const clean = rows.map(r => ({
          client_id: cid, product_id: int(r.product_id), year: int(r.year), month: int(r.month),
          qty: Math.max(0, Math.min(999, int(r.qty) || 0)), active: !!r.active,
          dows: (Array.isArray(r.dows) ? r.dows : []).map(int).filter((x: number) => x >= 0 && x <= 6),
          override_days: (Array.isArray(r.override_days) ? r.override_days : []).map(int).filter((x: number) => x >= 1 && x <= 31),
          updated_at: new Date().toISOString(),
        }))
        if (clean.some(r => [r.product_id, r.year, r.month].some(isNaN))) return json({ error: 'bad_body' }, 400)
        return json({ data: await pg('POST', `standing_orders?on_conflict=${CONFLICT.standing_orders}`, clean, 'resolution=merge-duplicates,return=representation') })
      }

      if (table === 'push_subscriptions') {
        const r = rows[0]
        const row = { client_id: cid, endpoint: String(r.endpoint || ''), p256dh: String(r.p256dh || ''), auth: String(r.auth || '') }
        if (!/^https:\/\//.test(row.endpoint) || !row.p256dh || !row.auth) return json({ error: 'bad_body' }, 400)
        return json({ data: await pg('POST', `push_subscriptions?on_conflict=${CONFLICT.push_subscriptions}`, row, 'resolution=merge-duplicates,return=minimal') })
      }
    }

    // ---------------- DELETE ----------------
    if (method === 'DELETE') {
      if (table === 'push_subscriptions') {
        await pg('DELETE', `push_subscriptions?client_id=eq.${enc}`)
        return json({ data: true })
      }
      const q = safeQuery(String(b.query || ''), cid)
      if (q == null || q === `client_id=eq.${enc}`) return json({ error: 'bad_query' }, 400)   // szűrő nélküli tömeges törlés tiltva
      if (table === 'messages') {
        const found = await pg('GET', `messages?select=id,text&${q}`)
        const ids = (found || []).filter((m: any) => !ADMIN_PREFIX.test(m.text || '')).map((m: any) => m.id)
        if (ids.length) await pg('DELETE', `messages?client_id=eq.${enc}&id=in.(${ids.join(',')})`)
        return json({ data: true })
      }
      if (table === 'orders') {
        const found = await pg('GET', `orders?select=id,year,month,day&${q}`)
        if (!found?.length) return json({ data: true })
        const st = await statusMap(cid, found.map((r: any) => [r.year, r.month, r.day]))
        const ok = found.filter((r: any) => dayEditable(r.year, r.month, r.day, st.get(dayKey(r.year, r.month, r.day)), isAdmin))
        const skipped = [...new Set(found.filter((r: any) => !ok.includes(r)).map((r: any) => r.day))]
        if (ok.length) await pg('DELETE', `orders?client_id=eq.${enc}&id=in.(${ok.map((r: any) => r.id).join(',')})`)
        return json({ data: true, skipped_days: skipped })
      }
    }
    return json({ error: 'forbidden' }, 403)
  } catch (e) {
    const st = (e as any)?.status
    return json({ error: String((e as Error)?.message || e) }, st && st < 600 ? st : 500)
  }
})
