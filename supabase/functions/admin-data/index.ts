// KEREK admin-data Edge Function (v1, Fázis 1 — biztonsági lockdown)
// Authentikált PostgREST-proxy: az admin/receptúra modul DB-műveleteit szolgálja
// service_role kulccsal, így a táblákról az anon hozzáférés MEGVONHATÓ (RLS deny).
// A modul-jelszó az admin-auth mintájára validálódik (admin_secrets, SHA-256, admin-fallback).
// Whitelist véd a tetszőleges tábla/művelet ellen.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Engedélyezett tábla+metódus modulonként (Fázis 1: suppliers pilot; bővíthető)
const ALLOWED: Record<string, Record<string, string[]>> = {
  receptura: {
    suppliers: ['GET', 'POST', 'PATCH', 'DELETE'],
    recipe_steps: ['GET', 'POST', 'PATCH', 'DELETE'],
  },
  admin: {},
  gyartas: {},
}

const _attempts = new Map<string, { count: number; resetAt: number }>()
function checkRateLimit(ip: string) {
  const now = Date.now()
  const e = _attempts.get(ip)
  if (!e || now > e.resetAt) { _attempts.set(ip, { count: 1, resetAt: now + 60000 }); return true }
  e.count++
  return e.count <= 60 // authentikált hívás, lazább limit
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!checkRateLimit(ip)) return json({ error: 'rate_limit' }, 429)

    const body = await req.json().catch(() => ({}))
    const { module: mod, password, table, method, query = '', body: payload = null, prefer = null } = body || {}

    // 1) modul + jelszó validálás
    const ALLOWED_MODULES = ['admin', 'receptura', 'gyartas']
    const moduleName = ALLOWED_MODULES.includes(mod) ? mod : null
    if (!moduleName) return json({ error: 'bad_module' }, 400)
    if (typeof password !== 'string' || !password) return json({ error: 'missing_password' }, 400)

    const sb = createClient(SUPABASE_URL, SERVICE_KEY)
    let { data: secret } = await sb.from('admin_secrets').select('value').eq('key', moduleName + '_password').maybeSingle()
    if (!secret?.value && moduleName !== 'admin') {
      ;({ data: secret } = await sb.from('admin_secrets').select('value').eq('key', 'admin_password').maybeSingle())
    }
    if (!secret?.value) return json({ error: 'not_configured' }, 500)
    const stored = String(secret.value).trim()
    const ok = (password === stored) || ((await sha256(password)) === stored)
    if (!ok) return json({ error: 'unauthorized' }, 401)

    // 2) whitelist: tábla + metódus
    const m = String(method || '').toUpperCase()
    if (typeof table !== 'string' || !ALLOWED[moduleName]?.[table]?.includes(m)) {
      return json({ error: 'forbidden', detail: `${moduleName}:${table}:${m}` }, 403)
    }

    // 3) továbbítás PostgREST-re service_role kulccsal
    const url = `${SUPABASE_URL}/rest/v1/${table}${query ? '?' + query : ''}`
    const headers: Record<string, string> = {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    }
    if (prefer) headers['Prefer'] = prefer
    const pgRes = await fetch(url, {
      method: m,
      headers,
      body: (m === 'POST' || m === 'PATCH') && payload != null ? JSON.stringify(payload) : undefined,
    })

    if (!pgRes.ok) return json({ error: await pgRes.text() }, pgRes.status)
    if (m === 'DELETE') return json({ data: true })
    const text = await pgRes.text()
    return json({ data: text ? JSON.parse(text) : null })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})
