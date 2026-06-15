// KEREK Admin Set-Password Edge Function (v2.48.0)
// Az admin jelszó ellenőrzése után beállítja egy modul (admin/receptura/gyartas) jelszavát
// az admin_secrets táblában (service_role írás; anon nem írhat). Hash: SHA-256.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const _attempts = new Map<string, { count: number; resetAt: number }>()
function checkRateLimit(ip: string): { allowed: boolean; waitSec: number } {
  const now = Date.now()
  const entry = _attempts.get(ip)
  if (!entry || now > entry.resetAt) {
    _attempts.set(ip, { count: 1, resetAt: now + 60000 })
    return { allowed: true, waitSec: 0 }
  }
  entry.count++
  if (entry.count > 10) return { allowed: false, waitSec: Math.ceil((entry.resetAt - now) / 1000) }
  return { allowed: true, waitSec: 0 }
}

const ALLOWED_MODULES = ['admin', 'receptura', 'gyartas']

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const rl = checkRateLimit(ip)
    if (!rl.allowed) return json({ success: false, error: 'rate_limit', wait_seconds: rl.waitSec }, 429)

    const body = await req.json().catch(() => ({}))
    const currentPassword = body?.current_password
    const newPassword = body?.new_password
    const moduleName = body?.module

    if (typeof currentPassword !== 'string' || currentPassword.length === 0)
      return json({ success: false, error: 'missing_current_password' }, 400)
    if (typeof newPassword !== 'string' || newPassword.length < 3)
      return json({ success: false, error: 'weak_new_password' }, 400)
    if (!ALLOWED_MODULES.includes(moduleName))
      return json({ success: false, error: 'invalid_module' }, 400)

    const sb = createClient(SUPABASE_URL, SERVICE_KEY)

    // Engedélyezés: csak a jelenlegi ADMIN jelszó ismeretében lehet bármely modul jelszavát állítani
    const { data: adminRow, error: readErr } = await sb.from('admin_secrets')
      .select('value').eq('key', 'admin_password').maybeSingle()
    if (readErr || !adminRow?.value) return json({ success: false, error: 'not_configured' }, 500)

    const stored = String(adminRow.value).trim()
    const submittedHash = await sha256(currentPassword)
    const authorized = (currentPassword === stored) || (submittedHash === stored)
    if (!authorized) {
      try { await sb.from('audit_log').insert({ action: 'password_set_denied', entity_name: moduleName, details: `IP: ${ip}` }) } catch (_e) {}
      return json({ success: false, error: 'invalid_admin_password' }, 401)
    }

    const newHash = await sha256(newPassword)
    const { error: upErr } = await sb.from('admin_secrets')
      .upsert({ key: moduleName + '_password', value: newHash, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (upErr) return json({ success: false, error: 'write_failed', detail: upErr.message }, 500)

    try { await sb.from('audit_log').insert({ action: 'password_set', entity_name: moduleName, details: `Modul jelszó frissítve` }) } catch (_e) {}
    return json({ success: true, module: moduleName })
  } catch (e: any) {
    return json({ error: e?.message || 'unknown_error' }, 500)
  }
})
