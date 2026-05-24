// KEREK Admin Auth Edge Function (v2.30.0)
// Compares submitted password against stored hash in settings table.
// The settings.admin_password row is protected by RLS - only service_role can read it.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

// SHA-256 hashing (same as kliens hashPassword)
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Simple in-memory rate limiter (per-instance, resets on cold start)
const _attempts = new Map<string, { count: number; resetAt: number }>()
function checkRateLimit(ip: string): { allowed: boolean; waitSec: number } {
  const now = Date.now()
  const entry = _attempts.get(ip)
  if (!entry || now > entry.resetAt) {
    _attempts.set(ip, { count: 1, resetAt: now + 60000 }) // 1 minute window
    return { allowed: true, waitSec: 0 }
  }
  entry.count++
  if (entry.count > 5) {
    return { allowed: false, waitSec: Math.ceil((entry.resetAt - now) / 1000) }
  }
  return { allowed: true, waitSec: 0 }
}

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
    const password = body?.password
    if (typeof password !== 'string' || password.length === 0) {
      return json({ success: false, error: 'missing_password' }, 400)
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY)
    // v2.30.0+: admin_password moved to dedicated admin_secrets table with strict RLS
    const { data, error } = await sb.from('admin_secrets').select('value').eq('key', 'admin_password').single()
    if (error || !data?.value) return json({ success: false, error: 'not_configured' }, 500)

    // Stored value may be plain (legacy) or sha256 hex (current).
    const stored = String(data.value).trim()
    const submittedHash = await sha256(password)
    const isCorrect = (password === stored) || (submittedHash === stored)

    if (isCorrect) {
      return json({ success: true })
    } else {
      // Log failed attempt (audit_log via service role)
      try {
        await sb.from('audit_log').insert({
          action: 'login_failed',
          entity_name: 'Admin',
          details: `IP: ${ip}`
        })
      } catch(_e) {}
      return json({ success: false, error: 'invalid_password' }, 401)
    }
  } catch (e: any) {
    return json({ error: e?.message || 'unknown_error' }, 500)
  }
})
