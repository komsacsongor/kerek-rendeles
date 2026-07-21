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
  const mkKey = (c: string, y: number, m: number, d: number) => `${c}-${y}-${m}-${d}`

  // 1) Minden RENDELT nap (a rendelésekből — így a status-sor NÉLKÜLI rendelések is beleesnek)
  const { data: orders, error: oErr } = await supabase
    .from('orders').select('client_id,year,month,day')
  if (oErr) return new Response(JSON.stringify({ error: oErr.message }), { status: 500 })
  if (!orders || orders.length === 0) return new Response(JSON.stringify({ confirmed: 0 }), { status: 200 })

  const orderedDays = new Map<string, {client_id:string,year:number,month:number,day:number}>()
  for (const o of orders) orderedDays.set(mkKey(o.client_id, o.year, o.month, o.day), o)

  // 2) Meglévő státuszok (kulcs → {status, deadline})
  const { data: statuses, error: sErr } = await supabase
    .from('order_status').select('client_id,year,month,day,status,deadline')
  if (sErr) return new Response(JSON.stringify({ error: sErr.message }), { status: 500 })
  const stMap = new Map<string, {status:string, deadline:string|null}>()
  for (const s of (statuses || [])) stMap.set(mkKey(s.client_id, s.year, s.month, s.day), { status: s.status, deadline: s.deadline })

  // 3) Lejárt, még le nem zárt rendelt napok → jóváhagyandók
  const toConfirm: Array<{client_id:string,year:number,month:number,day:number}> = []
  for (const [key, od] of orderedDays) {
    const st = stMap.get(key)
    if (st && (st.status === 'confirmed' || st.status === 'cancelled')) continue // már lezárt
    const dl = st?.deadline ? new Date(st.deadline) : defaultDeadline(od.year, od.month, od.day)
    if (dl <= nowDate) toConfirm.push(od)
  }
  if (toConfirm.length === 0) return new Response(JSON.stringify({ confirmed: 0 }), { status: 200 })

  // 4) Jóváhagyás (upsert — a status-sor nélkülieknek is létrehozza)
  const rows = toConfirm.map(r => ({
    client_id: r.client_id, year: r.year, month: r.month, day: r.day,
    status: 'confirmed', confirmed_at: now
  }))
  const { error: upErr } = await supabase
    .from('order_status').upsert(rows, { onConflict: 'client_id,year,month,day' })
  if (upErr) return new Response(JSON.stringify({ error: upErr.message }), { status: 500 })

  // 5) Vevő-push, vevőnként csoportosítva
  const byClient: Record<string, Array<{year:number,month:number,day:number}>> = {}
  for (const r of toConfirm) (byClient[r.client_id] = byClient[r.client_id] || []).push(r)
  for (const [clientId, list] of Object.entries(byClient)) {
    const body = list.length === 1
      ? `${HU_MONTHS[list[0].month] || (list[0].month + 1) + '.'} ${list[0].day}. – rendelésedet jóváhagytuk.`
      : `${list.length} rendelésedet jóváhagytuk.`
    await pushToClient(clientId, 'Rendelés visszaigazolva ✅', body)
  }

  return new Response(JSON.stringify({ confirmed: toConfirm.length, clients: Object.keys(byClient).length, at: now }), { status: 200 })
})
