import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const now = new Date().toISOString()

  // Find all PENDING and MODIFIED orders where deadline <= now
  const { data, error } = await supabase
    .from('order_status')
    .select('client_id,year,month,day')
    .in('status', ['pending', 'modified'])
    .lte('deadline', now)

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  if (!data || data.length === 0) return new Response(JSON.stringify({ confirmed: 0 }), { status: 200 })

  // Bulk confirm
  const { error: updErr } = await supabase
    .from('order_status')
    .update({ status: 'confirmed', confirmed_at: now })
    .in('status', ['pending', 'modified'])
    .lte('deadline', now)

  if (updErr) return new Response(JSON.stringify({ error: updErr.message }), { status: 500 })

  return new Response(JSON.stringify({ confirmed: data.length, at: now }), { status: 200 })
})
