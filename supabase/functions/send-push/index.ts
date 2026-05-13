import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = 'mailto:kerekinfo@kerek.ro'

async function sendWebPush(sub: any, payload: string) {
  const { default: webpush } = await import('https://esm.sh/web-push@3.6.7')
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
  return webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type' } })
  const { client_id, type, title, body, url } = await req.json()
  if (!client_id) return new Response('missing client_id', { status: 400 })

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { data: subs } = await sb.from('push_subscriptions').select('*').eq('client_id', client_id)
  if (!subs?.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 })

  const payload = JSON.stringify({ title: title || 'KEREK Pékség', body: body || '', type, url: url || '/kerek-rendeles/vevo.html', tag: type })
  let sent = 0

  await Promise.all(subs.map(async (sub: any) => {
    try { await sendWebPush(sub, payload); sent++ }
    catch(e: any) {
      if (e.statusCode === 410 || e.statusCode === 404)
        await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    }
  }))

  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
})
