// KEREK dynamic-service — Web Push küldő (aes128gcm / RFC 8291 + VAPID / RFC 8292)
// v2.53.0: a korábbi kézi `aesgcm` titkosítás nem-szabványos HKDF-fel hibás CEK/nonce-t
// adott → a böngésző nem tudta visszafejteni → SOHA nem érkezett push. Átírva a modern,
// böngészők által megbízhatóan visszafejtett aes128gcm sémára, helyes HKDF-fel.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function b64url(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')
}
function fromB64url(s: string) {
  return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0))
}
function concatU8(...arrs: Uint8Array[]) {
  const len = arrs.reduce((a,b)=>a+b.length,0)
  const out = new Uint8Array(len)
  let o = 0
  for (const a of arrs) { out.set(a, o); o += a.length }
  return out
}
async function hmac(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', keyBytes, { name:'HMAC', hash:'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}
// HKDF (egy blokk, len <= 32): Extract(salt, ikm) majd Expand(prk, info)
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm)
  const t = await hmac(prk, concatU8(info, new Uint8Array([1])))
  return t.slice(0, len)
}

// VAPID JWT (ES256) — változatlan
async function makeVapidJwt(audience: string, subject: string, privateKeyB64: string, pubX: string, pubY: string): Promise<string> {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = b64url(new TextEncoder().encode(JSON.stringify({
    aud: audience, exp: Math.floor(Date.now()/1000) + 43200, sub: subject
  })))
  const sigInput = new TextEncoder().encode(`${header}.${payload}`)
  const key = await crypto.subtle.importKey('jwk',
    { kty: 'EC', crv: 'P-256', d: privateKeyB64, x: pubX, y: pubY },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, sigInput)
  return `${header}.${payload}.${b64url(sig)}`
}

// aes128gcm titkosítás (RFC 8291 §3.4 + RFC 8188)
async function encryptAes128gcm(uaPublicB64: string, authB64: string, payloadStr: string): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const uaPublic = fromB64url(uaPublicB64)   // 65 byte (04||x||y)
  const authSecret = fromB64url(authB64)     // 16 byte
  const payloadBytes = enc.encode(payloadStr)

  // szerver efemer ECDH kulcspár
  const asKP = await crypto.subtle.generateKey({ name:'ECDH', namedCurve:'P-256' }, true, ['deriveBits'])
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKP.publicKey)) // 65 byte

  // ECDH közös titok
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name:'ECDH', namedCurve:'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name:'ECDH', public: uaKey }, asKP.privateKey, 256))

  const salt = crypto.getRandomValues(new Uint8Array(16))

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info\0"||ua_public||as_public, 32)
  const keyInfo = concatU8(enc.encode('WebPush: info\0'), uaPublic, asPublic)
  const prkKey = await hmac(authSecret, ecdhSecret)
  const ikm = (await hmac(prkKey, concatU8(keyInfo, new Uint8Array([1])))).slice(0, 32)

  // CEK és NONCE
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  // rekord: payload || 0x02 (utolsó rekord delimiter)
  const record = concatU8(payloadBytes, new Uint8Array([2]))
  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name:'AES-GCM', iv: nonce }, cekKey, record))

  // fejléc: salt(16) || rs(4, BE) || idlen(1)=65 || as_public(65)
  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096, false)
  const header = concatU8(salt, rs, new Uint8Array([asPublic.length]), asPublic)
  return concatU8(header, ciphertext)
}

async function sendWebPush(endpoint: string, p256dh: string, auth: string, payload: string, vapidPublic: string, vapidPrivate: string): Promise<number> {
  const body = await encryptAes128gcm(p256dh, auth, payload)
  const url = new URL(endpoint)
  const pubBytes = fromB64url(vapidPublic)
  const pubX = b64url(pubBytes.slice(1, 33))
  const pubY = b64url(pubBytes.slice(33, 65))
  const jwt = await makeVapidJwt(`${url.protocol}//${url.host}`, 'mailto:kerekinfo@kerek.ro', vapidPrivate, pubX, pubY)

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'Authorization': `vapid t=${jwt}, k=${vapidPublic}`,
      'TTL': '86400',
    },
    body,
  })
  return resp.status
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!
    const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!

    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return new Response(JSON.stringify({ error: 'VAPID env hiányzik (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const { client_id, type, title, body, url } = await req.json()
    if (!client_id) return new Response(JSON.stringify({ error: 'missing client_id' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })

    const sb = createClient(SUPABASE_URL, SERVICE_KEY)
    const { data: subs } = await sb.from('push_subscriptions').select('*').eq('client_id', client_id)
    if (!subs?.length) return new Response(JSON.stringify({ sent: 0, subs: 0 }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

    const payload = JSON.stringify({ title: title || 'KEREK Pékség', body: body || '', type: type || 'info', tag: type, url: url || undefined })
    let sent = 0
    const statuses: number[] = []

    for (const sub of subs) {
      try {
        const status = await sendWebPush(sub.endpoint, sub.p256dh, sub.auth, payload, VAPID_PUBLIC, VAPID_PRIVATE)
        statuses.push(status)
        if (status < 300) sent++
        else if (status === 410 || status === 404) await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      } catch(e) { statuses.push(-1); console.error('sub error:', e) }
    }

    return new Response(JSON.stringify({ sent, subs: subs.length, statuses }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch(e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
