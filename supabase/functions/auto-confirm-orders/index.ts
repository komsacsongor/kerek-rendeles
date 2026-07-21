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
  const nowDate = new Date()
  const now = nowDate.toISOString()

  // Default határidő, ha a soron nincs tárolt deadline (régi rendelések):
  // előző nap 18:00 Bukarest ~ 16:00 UTC (sosem korábbi a valós 18:00 helyinél).
  const defaultDeadline = (year: number, month0: number, day: number) =>
    new Date(Date.UTC(year, month0, day - 1, 16, 0, 0))

  // Minden PENDING/MODIFIED sor (deadline-nal együtt), majd JS-ben szűrünk lejártra.
  const { data, error } = await supabase
    .from('order_status')
    .select('client_id,year,month,day,deadline')
    .in('status', ['pending', 'modified'])

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  if (!data || data.length === 0) return new Response(JSON.stringify({ confirmed: 0 }), { status: 200 })

  const expired = data.filter(r => {
    const dl = r.deadline ? new Date(r.deadline) : defaultDeadline(r.year, r.month, r.day)
    return dl <= nowDate
  })
  if (expired.length === 0) return new Response(JSON.stringify({ confirmed: 0 }), { status: 200 })

  // Tömeges jóváhagyás — soronként a (client_id,year,month,day) kulcsra
  for (const r of expired) {
    await supabase.from('order_status')
      .update({ status: 'confirmed', confirmed_at: now })
      .eq('client_id', r.client_id).eq('year', r.year).eq('month', r.month).eq('day', r.day)
  }

  // Vevő-push, vevőnként csoportosítva (egy üzenet / vevő)
  const byClient: Record<string, Array<{year:number,month:number,day:number}>> = {}
  for (const r of expired) {
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

  return new Response(JSON.stringify({ confirmed: expired.length, clients: Object.keys(byClient).length, at: now }), { status: 200 })
})
