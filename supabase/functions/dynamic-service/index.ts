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

async function encryptPayload(p256dh: string, auth: string, payloadStr: string) {
  const enc = new TextEncoder()
  const payloadBytes = enc.encode(payloadStr)
  const clientPubBytes = fromB64url(p256dh)
  const authBytes = fromB64url(auth)

  // Generate server ECDH key pair
  const serverKP = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKP.publicKey))

  // Import client public key
  const clientPubKey = await crypto.subtle.importKey('raw', clientPubBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, [])

  // ECDH shared secret
  const sharedBits = await crypto.subtle.deriveBits({ name: 'ECDH', public: clientPubKey }, serverKP.privateKey, 256)

  const salt = crypto.getRandomValues(new Uint8Array(16))

  // PRK via HKDF-Extract (HMAC-SHA256)
  const hmacKey = await crypto.subtle.importKey('raw', authBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, new Uint8Array([
    ...new Uint8Array(sharedBits), ...enc.encode('Content-Encoding: auth\0')
  ])))

  // Helper: HKDF-Expand
  async function expand(prk: Uint8Array, info: Uint8Array, len: number) {
    const k = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    return new Uint8Array((await crypto.subtle.sign('HMAC', k, new Uint8Array([...salt, ...info, 1]))).slice(0, len))
  }

  function buildInfo(type: string) {
    const label = enc.encode(`Content-Encoding: ${type}\0P-256\0`)
    const buf = new Uint8Array(label.length + 2 + clientPubBytes.length + 2 + serverPubRaw.length)
    let o = 0
    buf.set(label, o); o += label.length
    new DataView(buf.buffer).setUint16(o, clientPubBytes.length, false); o += 2
    buf.set(clientPubBytes, o); o += clientPubBytes.length
    new DataView(buf.buffer).setUint16(o, serverPubRaw.length, false); o += 2
    buf.set(serverPubRaw, o)
    return buf
  }

  const cek = await expand(prk, buildInfo('aesgcm'), 16)
  const nonce = await expand(prk, buildInfo('nonce'), 12)

  const encKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const padded = new Uint8Array(2 + payloadBytes.length)
  padded.set(payloadBytes, 2)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, encKey, padded)

  return { ciphertext: new Uint8Array(ciphertext), salt, serverPubRaw }
}

async function sendWebPush(endpoint: string, p256dh: string, auth: string, payload: string, vapidPublic: string, vapidPrivate: string) {
  const { ciphertext, salt, serverPubRaw } = await encryptPayload(p256dh, auth, payload)
  const url = new URL(endpoint)
  // Extract x,y from public key (uncompressed: 04||x||y)
  const pubBytes = fromB64url(vapidPublic)
  const pubX = b64url(pubBytes.slice(1, 33))
  const pubY = b64url(pubBytes.slice(33, 65))
  const jwt = await makeVapidJwt(`${url.protocol}//${url.host}`, 'mailto:kerekinfo@kerek.ro', vapidPrivate, pubX, pubY)

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aesgcm',
      'Encryption': `salt=${b64url(salt)}`,
      'Crypto-Key': `dh=${b64url(serverPubRaw)};p256ecdsa=${vapidPublic}`,
      'Authorization': `WebPush ${jwt}`,
      'TTL': '86400',
    },
    body: ciphertext,
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

    const { client_id, type, title, body } = await req.json()
    if (!client_id) return new Response(JSON.stringify({ error: 'missing client_id' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })

    const sb = createClient(SUPABASE_URL, SERVICE_KEY)
    const { data: subs } = await sb.from('push_subscriptions').select('*').eq('client_id', client_id)
    if (!subs?.length) return new Response(JSON.stringify({ sent: 0 }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

    const payload = JSON.stringify({ title: title || 'KEREK Pékség', body: body || '', type: type || 'info', tag: type })
    let sent = 0

    for (const sub of subs) {
      try {
        const status = await sendWebPush(sub.endpoint, sub.p256dh, sub.auth, payload, VAPID_PUBLIC, VAPID_PRIVATE)
        if (status < 300) sent++
        else if (status === 410 || status === 404) await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      } catch(e) { console.error('sub error:', e) }
    }

    return new Response(JSON.stringify({ sent }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch(e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
