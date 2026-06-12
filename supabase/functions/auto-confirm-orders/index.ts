import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const HU_MONTHS = ['Január','Február','Március','Április','Május','Június',
                   'Július','Augusztus','Szeptember','Október','November','December']

// Vevő push az auto-jóváhagyásról (a dynamic-service push-csatornán)
async function pushToClient(clientId: string, title: string, body: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/dynamic-service`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey': SUPABASE_SERVICE_KEY,
      },
      body: JSON.stringify({ client_id: clientId, type: 'confirmed', title, body }),
    })
  } catch (_) { /* push hiba nem blokkolja az auto-zárást */ }
}

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const now = new Date().toISOString()

  // B FÁZIS (későbbi): ha az 'auto_confirm_respect_shortage' beállítás BE,
  // a hiányzó alapanyagú termékek napjait ki kell hagyni a jóváhagyásból.
  // Jelenleg (A fázis): minden lejárt pending/modified rendelést jóváhagyunk,
  // mert az alapanyaglista még nincs karbantartva.

  // Lejárt PENDING és MODIFIED rendelések
  const { data, error } = await supabase
    .from('order_status')
    .select('client_id,year,month,day')
    .in('status', ['pending', 'modified'])
    .lte('deadline', now)

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  if (!data || data.length === 0) return new Response(JSON.stringify({ confirmed: 0 }), { status: 200 })

  // Tömeges jóváhagyás
  const { error: updErr } = await supabase
    .from('order_status')
    .update({ status: 'confirmed', confirmed_at: now })
    .in('status', ['pending', 'modified'])
    .lte('deadline', now)

  if (updErr) return new Response(JSON.stringify({ error: updErr.message }), { status: 500 })

  // Vevő-push, vevőnként csoportosítva (egy üzenet / vevő)
  const byClient: Record<string, Array<{year:number,month:number,day:number}>> = {}
  for (const r of data) {
    (byClient[r.client_id] = byClient[r.client_id] || []).push(r)
  }
  for (const [clientId, rows] of Object.entries(byClient)) {
    let body: string
    if (rows.length === 1) {
      const r = rows[0]
      body = `${HU_MONTHS[r.month] || (r.month + 1) + '.'} ${r.day}. – rendelésedet jóváhagytuk.`
    } else {
      body = `${rows.length} rendelésedet jóváhagytuk.`
    }
    await pushToClient(clientId, 'Rendelés visszaigazolva ✅', body)
  }

  return new Response(JSON.stringify({ confirmed: data.length, clients: Object.keys(byClient).length, at: now }), { status: 200 })
})
