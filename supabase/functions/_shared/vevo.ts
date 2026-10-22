// KEREK — közös vevő-segédek (vevo-auth + vevo-data EF)
// v2.55.0 (C1 biztonság): aláírt vevő-token, PIN/válasz-hash, rendelési határidő szerver-oldalon.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

export function admin() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
}

// ---------- egyszerű, példányonkénti rate-limit ----------
const _rl = new Map<string, { n: number; reset: number }>()
export function rateLimit(key: string, max: number, windowMs = 60000): boolean {
  const now = Date.now()
  const e = _rl.get(key)
  if (!e || now > e.reset) { _rl.set(key, { n: 1, reset: now + windowMs }); return true }
  e.n++
  return e.n <= max
}
export const clientIp = (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

// ---------- kódolás ----------
const enc = new TextEncoder()
const b64u = (buf: ArrayBuffer | Uint8Array) => {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')

export async function sha256(text: string) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(text))) }

// PBKDF2 (a PIN kevés számjegy → lassú hash + szerver-oldali próbálkozás-korlát)
export async function slowHash(secret: string, saltHex?: string): Promise<string> {
  const salt = saltHex ? Uint8Array.from(saltHex.match(/.{2}/g)!.map(h => parseInt(h, 16))) : crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256)
  return `${hex(salt.buffer)}:${hex(bits)}`
}
export async function slowVerify(secret: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored || !stored.includes(':')) return false
  const [salt] = stored.split(':')
  const h = await slowHash(secret, salt)
  // konstans idejű összehasonlítás
  if (h.length !== stored.length) return false
  let d = 0
  for (let i = 0; i < h.length; i++) d |= h.charCodeAt(i) ^ stored.charCodeAt(i)
  return d === 0
}

// Biztonsági kérdésre adott válasz normalizálása: kisbetű, ékezet nélkül, csak betű/szám
export const normAnswer = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
export const normEmail = (s: string) => String(s || '').trim().toLowerCase()
export const normCode = (s: string) => String(s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
export const SEC_QUESTION_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

// v2.55.1: a PIN pontosan 4 számjegy; a túl egyszerűek (1111, 1234, 4321 …) tiltottak
export function pinProblem(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return 'pin_format'
  if (/^(\d)\1+$/.test(pin)) return 'pin_weak'
  if ('01234567890'.includes(pin) || '09876543210'.includes(pin)) return 'pin_weak'
  return null
}
export function randomPin(): string {
  for (;;) {
    const n = crypto.getRandomValues(new Uint16Array(1))[0] % 10000
    const p = String(n).padStart(4, '0')
    if (!pinProblem(p)) return p
  }
}

// ---------- token (HMAC-SHA256, titok az admin_secrets-ben, első használatkor generálva) ----------
let _secret: string | null = null
async function tokenSecret(): Promise<string> {
  if (_secret) return _secret
  const sb = admin()
  const { data } = await sb.from('admin_secrets').select('value').eq('key', 'vevo_token_secret').maybeSingle()
  if (data?.value) { _secret = String(data.value); return _secret }
  const fresh = hex(crypto.getRandomValues(new Uint8Array(32)).buffer)
  await sb.from('admin_secrets').upsert({ key: 'vevo_token_secret', value: fresh }, { onConflict: 'key', ignoreDuplicates: true })
  const { data: again } = await sb.from('admin_secrets').select('value').eq('key', 'vevo_token_secret').maybeSingle()
  _secret = String(again?.value || fresh)
  return _secret
}
async function hmac(data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(await tokenSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
}
export type TokenPayload = { cid: string; v: number; exp: number; ro?: boolean }
export async function signToken(p: TokenPayload) {
  const body = b64u(enc.encode(JSON.stringify(p)))
  return `${body}.${await hmac(body)}`
}
export type Session = { cid: string; ro: boolean; client: any; auth: any }
// Token ellenőrzés + a vevő aktuális állapota (törölt / függő / PIN-reset → a token érvénytelen)
export async function verifyToken(token: string | null | undefined): Promise<Session | null> {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null
  const [body, sig] = token.split('.')
  if (sig !== await hmac(body)) return null
  let p: TokenPayload
  try { p = JSON.parse(new TextDecoder().decode(fromB64u(body))) } catch { return null }
  if (!p?.cid || !p.exp || Date.now() > p.exp) return null
  const sb = admin()
  const [{ data: client }, { data: auth }] = await Promise.all([
    sb.from('clients').select('id,name,email,phone,is_admin').eq('id', p.cid).maybeSingle(),
    sb.from('client_auth').select('*').eq('client_id', p.cid).maybeSingle(),
  ])
  if (!client) return null
  if (String(client.name || '').startsWith('[DELETED]') || String(client.name || '').startsWith('[PENDING]')) return null
  if ((auth?.token_version || 0) !== (p.v || 0)) return null
  return { cid: p.cid, ro: !!p.ro, client, auth }
}

// ---------- modul-jelszó (admin/receptúra) ellenőrzése — az admin-data EF mintájára ----------
export async function checkModulePassword(module: string, password: unknown): Promise<boolean> {
  if (!['admin', 'receptura'].includes(module) || typeof password !== 'string' || !password) return false
  const sb = admin()
  let { data } = await sb.from('admin_secrets').select('value').eq('key', module + '_password').maybeSingle()
  if (!data?.value && module !== 'admin') ({ data } = await sb.from('admin_secrets').select('value').eq('key', 'admin_password').maybeSingle())
  if (!data?.value) return false
  const stored = String(data.value).trim()
  return password === stored || (await sha256(password)) === stored
}

// ---------- rendelési határidő (Europe/Bucharest) ----------
function tzOffsetMs(instant: Date): number {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Bucharest', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const p: Record<string, string> = {}
  f.formatToParts(instant).forEach(x => { p[x.type] = x.value })
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second)
  return asUtc - instant.getTime()
}
// Bukaresti falióra-idő → UTC pillanat
export function bucharestInstant(y: number, m0: number, d: number, hh = 0, mm = 0): Date {
  const guess = new Date(Date.UTC(y, m0, d, hh, mm))
  return new Date(guess.getTime() - tzOffsetMs(guess))
}
// Alapértelmezett határidő: a sütési nap ELŐTTI nap 18:00 (bukaresti idő)
export const defaultDeadline = (y: number, m0: number, d: number) => bucharestInstant(y, m0, d - 1, 18, 0)
export function bucharestToday(): { y: number; m0: number; d: number } {
  const now = new Date()
  const loc = new Date(now.getTime() + tzOffsetMs(now))
  return { y: loc.getUTCFullYear(), m0: loc.getUTCMonth(), d: loc.getUTCDate() }
}
export function isPastDay(y: number, m0: number, d: number): boolean {
  const t = bucharestToday()
  return Date.UTC(y, m0, d) < Date.UTC(t.y, t.m0, t.d)
}
// A vevő módosíthatja-e még az adott napot (ugyanaz a szabály, mint a vevő felületén)
export function dayEditable(y: number, m0: number, d: number, st: { status?: string; deadline?: string | null } | undefined, isAdmin: boolean): boolean {
  if (isPastDay(y, m0, d)) return false
  if (st?.status === 'cancelled' || st?.status === 'fulfilled') return false
  if (isAdmin) return true
  const dl = st?.deadline ? new Date(st.deadline) : defaultDeadline(y, m0, d)
  return Date.now() < dl.getTime()
}
export function deadlinePassed(y: number, m0: number, d: number, st: { deadline?: string | null } | undefined): boolean {
  const dl = st?.deadline ? new Date(st.deadline) : defaultDeadline(y, m0, d)
  return Date.now() >= dl.getTime()
}

// Admin push (értesítés) a dynamic-service EF-en át, service kulccsal
export async function pushAdmin(type: string, title: string, body: string) {
  try {
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/dynamic-service`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, apikey: key },
      body: JSON.stringify({ client_id: 'ADMIN', type, title, body }),
    })
  } catch (_) { /* a push hiba nem blokkol */ }
}
