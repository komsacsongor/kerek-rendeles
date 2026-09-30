// KEREK vevo-auth Edge Function (v2.55.0 — C1 biztonság)
// Vevő-belépés a szerveren: kód VAGY e-mail + PIN → aláírt token. A böngésző SOHA nem kapja meg
// más vevők adatait. PIN és biztonsági válaszok PBKDF2-vel, a client_auth táblában (anon-lezárt).
//
// Műveletek (body.action):
//   login {login, pin?, remember?}            → {token, client, needs_setup}
//   me {token}                                 → {client, needs_setup}
//   setup {token, email, phone, pin, q1,a1,q2,a2}  → {ok}
//   register {name, email, phone, pin, q1,a1,q2,a2} → {code}
//   recover_start {email}                      → {q1,q2} | {no_setup} | {locked}
//   recover_verify {email, a1, a2, new_pin, remember?} → {token, client, code}
//   admin_preview {password, client_id}        → {token} (csak olvasható, 30 perc)
//   admin_reset_pin {password, client_id}      → {ok}
//   admin_pin_status {password}                → {rows:[{client_id, has_pin, pin_set_at, rec_locked}]}

import {
  CORS, json, admin, rateLimit, clientIp, slowHash, slowVerify, sha256, normAnswer, normEmail,
  SEC_QUESTION_IDS, pinProblem, signToken, verifyToken, checkModulePassword, pushAdmin, bucharestToday,
} from '../_shared/vevo.ts'

// Az átmeneti időszak végéig a még PIN nélküli fiók e-maillel (PIN nélkül) is beléphet — utána csak kóddal.
const LEGACY_EMAIL_UNTIL = Date.parse('2026-10-31T23:59:59+02:00')
const DAY = 86400000
const PIN_LOCK_AFTER = 3, PIN_LOCK_MS = 15 * 60000, REC_PER_DAY = 3

const cleanName = (n: string) => String(n || '').replace(/^\[(PENDING|DELETED)\]\s*/, '')
const pubClient = (c: any) => ({ id: c.id, name: cleanName(c.name), email: c.email || '', phone: c.phone || '', is_admin: !!c.is_admin })
const needsSetup = (c: any, a: any) => !(a?.pin_hash && a?.a1_hash && a?.a2_hash && c?.email && c?.phone)
const likeEsc = (s: string) => s.replace(/[\\%_]/g, m => '\\' + m)
const todayStr = () => { const t = bucharestToday(); return `${t.y}-${String(t.m0 + 1).padStart(2, '0')}-${String(t.d).padStart(2, '0')}` }
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 120
const phoneOk = (p: string) => (String(p || '').replace(/\D/g, '').length >= 8) && String(p).length <= 30

async function issue(c: any, auth: any, remember: boolean) {
  const exp = Date.now() + (remember ? 90 * DAY : 12 * 3600000)
  return { token: await signToken({ cid: c.id, v: auth?.token_version || 0, exp }), exp }
}

function questionsProblem(b: any): string | null {
  const q1 = Number(b.q1), q2 = Number(b.q2)
  if (!SEC_QUESTION_IDS.includes(q1) || !SEC_QUESTION_IDS.includes(q2) || q1 === q2) return 'questions_invalid'
  if (normAnswer(b.a1).length < 2 || normAnswer(b.a2).length < 2) return 'answer_short'
  return null
}
async function secretsRow(b: any) {
  return {
    pin_hash: await slowHash(String(b.pin)),
    q1: Number(b.q1), a1_hash: await slowHash(normAnswer(b.a1)),
    q2: Number(b.q2), a2_hash: await slowHash(normAnswer(b.a2)),
    pin_set_at: new Date().toISOString(), pin_fail_count: 0, pin_locked_until: null,
    rec_fail_count: 0, rec_fail_day: null, updated_at: new Date().toISOString(),
  }
}
async function findByEmail(sb: any, email: string) {
  const { data } = await sb.from('clients').select('id,name,email,phone,is_admin').ilike('email', likeEsc(email)).limit(2)
  return (data || [])[0] || null
}
async function getAuth(sb: any, cid: string) {
  const { data } = await sb.from('client_auth').select('*').eq('client_id', cid).maybeSingle()
  return data
}
// Nem létező e-mailre is "kérdéseket" adunk (az e-mail alapján mindig ugyanazt), így nem derül ki, kinek van fiókja
async function fakeQuestions(email: string) {
  const h = await sha256('kerek-fake:' + email)
  const q1 = (parseInt(h.slice(0, 4), 16) % 9) + 1
  let q2 = (parseInt(h.slice(4, 8), 16) % 9) + 1
  if (q2 === q1) q2 = (q1 % 9) + 1
  return { q1, q2 }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const ip = clientIp(req)
  try {
    const b = await req.json().catch(() => ({}))
    const action = String(b?.action || '')
    const sb = admin()
    if (!rateLimit('all:' + ip, 120)) return json({ error: 'rate_limit' }, 429)

    // ---------------- LOGIN ----------------
    if (action === 'login') {
      if (!rateLimit('login:' + ip, 20)) return json({ error: 'rate_limit' }, 429)
      const raw = String(b.login || '').trim()
      if (!raw) return json({ error: 'missing_login' }, 400)
      let c: any = null, viaEmail = false
      if (raw.includes('@')) {
        viaEmail = true
        c = await findByEmail(sb, normEmail(raw))
      } else {
        const { data } = await sb.from('clients').select('id,name,email,phone,is_admin').ilike('id', likeEsc(raw)).limit(1)
        c = (data || [])[0] || null
        if (!c) {
          const n = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
          if (/^KER[A-Z0-9]{8}$/.test(n)) {
            const id = `KER-${n.slice(3, 7)}-${n.slice(7, 11)}`
            const r = await sb.from('clients').select('id,name,email,phone,is_admin').eq('id', id).maybeSingle()
            c = r.data || null
          }
        }
        if (!c && !/^KER/i.test(raw) && raw.includes(' ')) return json({ error: 'name_login_removed' }, 401)
      }
      if (!c) return json({ error: viaEmail ? 'bad_credentials' : 'unknown_code' }, 401)
      if (String(c.name).startsWith('[PENDING]')) return json({ error: 'pending' }, 403)
      if (String(c.name).startsWith('[DELETED]')) return json({ error: 'deleted' }, 403)
      const auth = await getAuth(sb, c.id)

      if (viaEmail) {
        if (auth?.pin_hash) {
          if (auth.pin_locked_until && Date.now() < Date.parse(auth.pin_locked_until))
            return json({ error: 'pin_locked', wait_minutes: Math.ceil((Date.parse(auth.pin_locked_until) - Date.now()) / 60000) }, 429)
          if (!b.pin) return json({ error: 'pin_required' }, 401)
          if (!(await slowVerify(String(b.pin), auth.pin_hash))) {
            const fails = (auth.pin_fail_count || 0) + 1
            const upd: any = { pin_fail_count: fails >= PIN_LOCK_AFTER ? 0 : fails, updated_at: new Date().toISOString() }
            if (fails >= PIN_LOCK_AFTER) upd.pin_locked_until = new Date(Date.now() + PIN_LOCK_MS).toISOString()
            await sb.from('client_auth').update(upd).eq('client_id', c.id)
            return json({ error: fails >= PIN_LOCK_AFTER ? 'pin_locked' : 'bad_credentials', wait_minutes: fails >= PIN_LOCK_AFTER ? 15 : undefined }, 401)
          }
          if (auth.pin_fail_count) await sb.from('client_auth').update({ pin_fail_count: 0 }).eq('client_id', c.id)
        } else if (Date.now() > LEGACY_EMAIL_UNTIL) {
          return json({ error: 'code_required' }, 401)   // átmenet vége: PIN nélkül csak kóddal
        }
      }
      const t = await issue(c, auth, !!b.remember)
      try { await sb.from('audit_log').insert({ action: 'login', entity_name: cleanName(c.name), details: viaEmail ? 'Vevő belépés (e-mail)' : 'Vevő belépés (kód)' }) } catch (_) {}
      return json({ ...t, client: pubClient(c), needs_setup: needsSetup(c, auth) })
    }

    // ---------------- ME (mentett munkamenet) ----------------
    if (action === 'me') {
      const s = await verifyToken(b.token)
      if (!s) return json({ error: 'invalid_token' }, 401)
      return json({ client: pubClient(s.client), needs_setup: s.ro ? false : needsSetup(s.client, s.auth), readonly: s.ro })
    }

    // ---------------- SETUP (meglévő vevő: adatok + PIN + kérdések) ----------------
    if (action === 'setup') {
      const s = await verifyToken(b.token)
      if (!s || s.ro) return json({ error: 'invalid_token' }, 401)
      const email = normEmail(b.email), phone = String(b.phone || '').trim()
      if (!emailOk(email)) return json({ error: 'email_invalid' }, 400)
      if (!phoneOk(phone)) return json({ error: 'phone_invalid' }, 400)
      const pp = pinProblem(String(b.pin || '')); if (pp) return json({ error: pp }, 400)
      const qp = questionsProblem(b); if (qp) return json({ error: qp }, 400)
      const other = await findByEmail(sb, email)
      if (other && other.id !== s.cid) return json({ error: 'email_exists' }, 409)
      const { error: e1 } = await sb.from('clients').update({ email, phone }).eq('id', s.cid)
      if (e1) return json({ error: 'save_failed', detail: e1.message }, 500)
      const row = { client_id: s.cid, token_version: s.auth?.token_version || 0, ...(await secretsRow(b)) }
      const { error: e2 } = await sb.from('client_auth').upsert(row, { onConflict: 'client_id' })
      if (e2) return json({ error: 'save_failed', detail: e2.message }, 500)
      try { await sb.from('audit_log').insert({ action: 'pin_setup', entity_name: cleanName(s.client.name), details: 'PIN + biztonsági kérdések beállítva' }) } catch (_) {}
      return json({ ok: true, client: pubClient({ ...s.client, email, phone }) })
    }

    // ---------------- REGISTER (új vevő) ----------------
    if (action === 'register') {
      if (!rateLimit('reg:' + ip, 5, 10 * 60000)) return json({ error: 'rate_limit' }, 429)
      const name = String(b.name || '').trim().replace(/\s+/g, ' ')
      const email = normEmail(b.email), phone = String(b.phone || '').trim()
      if (name.length < 3 || name.length > 80 || /^\[/.test(name)) return json({ error: 'name_invalid' }, 400)
      if (!emailOk(email)) return json({ error: 'email_invalid' }, 400)
      if (!phoneOk(phone)) return json({ error: 'phone_invalid' }, 400)
      const pp = pinProblem(String(b.pin || '')); if (pp) return json({ error: pp }, 400)
      const qp = questionsProblem(b); if (qp) return json({ error: qp }, 400)
      const ex = await findByEmail(sb, email)
      if (ex) return json({ error: String(ex.name).startsWith('[DELETED]') ? 'email_deleted' : 'email_exists' }, 409)
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
      let code = ''
      for (let i = 0; i < 8; i++) {
        const r = crypto.getRandomValues(new Uint8Array(8))
        const cand = 'KER-' + Array.from(r.slice(0, 4), x => chars[x % 32]).join('') + '-' + Array.from(r.slice(4), x => chars[x % 32]).join('')
        const { data } = await sb.from('clients').select('id').eq('id', cand).maybeSingle()
        if (!data) { code = cand; break }
      }
      if (!code) return json({ error: 'save_failed' }, 500)
      const { error: e1 } = await sb.from('clients').insert({ id: code, name: '[PENDING] ' + name, email, phone })
      if (e1) return json({ error: /duplicate|23505/.test(e1.message) ? 'email_exists' : 'save_failed', detail: e1.message }, e1.message.includes('23505') ? 409 : 500)
      await sb.from('client_auth').upsert({ client_id: code, token_version: 0, ...(await secretsRow(b)) }, { onConflict: 'client_id' })
      try { await sb.from('audit_log').insert({ action: 'client_register', entity_name: name, details: 'Önregisztráció (jóváhagyásra vár)' }) } catch (_) {}
      await pushAdmin('new_client', '👤 Új regisztráció', `${name} regisztrált — jóváhagyásra vár`)
      return json({ code })
    }

    // ---------------- RECOVERY ----------------
    if (action === 'recover_start') {
      if (!rateLimit('rec:' + ip, 10, 10 * 60000)) return json({ error: 'rate_limit' }, 429)
      const email = normEmail(b.email)
      if (!emailOk(email)) return json({ error: 'email_invalid' }, 400)
      const c = await findByEmail(sb, email)
      if (!c || /^\[(PENDING|DELETED)\]/.test(String(c.name))) return json(await fakeQuestions(email))
      const a = await getAuth(sb, c.id)
      if (!a?.a1_hash || !a?.a2_hash) return json({ no_setup: true })
      if (a.rec_fail_day === todayStr() && (a.rec_fail_count || 0) >= REC_PER_DAY) return json({ locked: true })
      return json({ q1: a.q1, q2: a.q2 })
    }

    if (action === 'recover_verify') {
      if (!rateLimit('recv:' + ip, 10, 10 * 60000)) return json({ error: 'rate_limit' }, 429)
      const email = normEmail(b.email)
      const c = await findByEmail(sb, email)
      const a = c && !/^\[(PENDING|DELETED)\]/.test(String(c.name)) ? await getAuth(sb, c.id) : null
      if (!c || !a?.a1_hash) return json({ error: 'wrong_answers' }, 401)
      const today = todayStr()
      const fails = a.rec_fail_day === today ? (a.rec_fail_count || 0) : 0
      if (fails >= REC_PER_DAY) return json({ error: 'locked' }, 429)
      const ok = (await slowVerify(normAnswer(b.a1), a.a1_hash)) && (await slowVerify(normAnswer(b.a2), a.a2_hash))
      if (!ok) {
        const n = fails + 1
        await sb.from('client_auth').update({ rec_fail_day: today, rec_fail_count: n, updated_at: new Date().toISOString() }).eq('client_id', c.id)
        if (n >= REC_PER_DAY) await pushAdmin('recovery_locked', '🔐 Sikertelen PIN-helyreállítás', `${cleanName(c.name)}: ${REC_PER_DAY} hibás válasz ma — ha jelentkezik, töröld a PIN-jét az adminban.`)
        return json({ error: n >= REC_PER_DAY ? 'locked' : 'wrong_answers', left: Math.max(0, REC_PER_DAY - n) }, 401)
      }
      const pp = pinProblem(String(b.new_pin || '')); if (pp) return json({ error: pp }, 400)
      const v = (a.token_version || 0) + 1   // a korábbi (esetleg ellopott) munkamenetek érvénytelenek
      await sb.from('client_auth').update({ pin_hash: await slowHash(String(b.new_pin)), pin_set_at: new Date().toISOString(), token_version: v, pin_fail_count: 0, pin_locked_until: null, rec_fail_count: 0, rec_fail_day: null, updated_at: new Date().toISOString() }).eq('client_id', c.id)
      try { await sb.from('audit_log').insert({ action: 'pin_recovered', entity_name: cleanName(c.name), details: 'PIN helyreállítva biztonsági kérdésekkel' }) } catch (_) {}
      const t = await issue(c, { token_version: v }, !!b.remember)
      return json({ ...t, client: pubClient(c), code: c.id, needs_setup: needsSetup(c, { ...a, pin_hash: 'x' }) })
    }

    // ---------------- ADMIN műveletek (admin jelszóval) ----------------
    if (action.startsWith('admin_')) {
      if (!rateLimit('adm:' + ip, 60)) return json({ error: 'rate_limit' }, 429)
      if (!(await checkModulePassword('admin', b.password))) return json({ error: 'unauthorized' }, 401)
      if (action === 'admin_pin_status') {
        const { data } = await sb.from('client_auth').select('client_id,pin_hash,pin_set_at,rec_fail_day,rec_fail_count')
        const today = todayStr()
        return json({ rows: (data || []).map((r: any) => ({ client_id: r.client_id, has_pin: !!r.pin_hash, pin_set_at: r.pin_set_at, rec_locked: r.rec_fail_day === today && (r.rec_fail_count || 0) >= REC_PER_DAY, rec_fails_today: r.rec_fail_day === today ? (r.rec_fail_count || 0) : 0 })) })
      }
      const cid = String(b.client_id || '')
      const { data: c } = await sb.from('clients').select('id,name,email,phone,is_admin').eq('id', cid).maybeSingle()
      if (!c) return json({ error: 'not_found' }, 404)
      const a = await getAuth(sb, cid)
      if (action === 'admin_preview') {
        const token = await signToken({ cid, v: a?.token_version || 0, exp: Date.now() + 30 * 60000, ro: true })
        return json({ token })
      }
      if (action === 'admin_reset_pin') {
        await sb.from('client_auth').upsert({ client_id: cid, pin_hash: null, q1: null, a1_hash: null, q2: null, a2_hash: null, pin_set_at: null, token_version: (a?.token_version || 0) + 1, pin_fail_count: 0, pin_locked_until: null, rec_fail_count: 0, rec_fail_day: null, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
        try { await sb.from('audit_log').insert({ action: 'pin_reset', entity_name: cleanName(c.name), details: 'PIN törölve (admin)' }) } catch (_) {}
        return json({ ok: true })
      }
    }
    return json({ error: 'unknown_action' }, 400)
  } catch (e) {
    return json({ error: 'server_error', detail: String((e as Error)?.message || e) }, 500)
  }
})
