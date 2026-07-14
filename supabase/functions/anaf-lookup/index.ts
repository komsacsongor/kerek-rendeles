// KEREK — anaf-lookup Edge Function
// Cégadat-lekérdezés CUI alapján az ANAF hivatalos, ingyenes v9 API-járól.
// Böngészőből közvetlenül nem hívható (CORS), ezért megy szerveroldalról.
// Nincs API-kulcs. ANAF limit: 1 kérés/másodperc.

const ANAF_URL = 'https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const { cui } = await req.json();

    // "RO 12345678" / "ro12345678" → 12345678
    const clean = String(cui ?? '').toUpperCase().replace(/[^0-9]/g, '');
    if (!clean || clean.length < 2 || clean.length > 10) return json({ error: 'invalid_cui' }, 400);

    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(ANAF_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ cui: Number(clean), data: today }]),
    });

    if (!res.ok) return json({ error: 'anaf_unavailable', status: res.status }, 502);

    const data = await res.json();
    const hit = data?.found?.[0];
    if (!hit) return json({ error: 'not_found' }, 404);

    const g = hit.date_generale ?? hit.dategenerale ?? {};
    const tva = hit.inregistrare_scop_Tva ?? hit.inregistrarescopTva ?? {};

    return json({
      ok: true,
      cui: 'RO' + clean,
      name: g.denumire ?? null,
      address: g.adresa ?? null,
      reg_com: g.nrRegCom ?? null,
      phone: g.telefon ?? null,
      postal_code: g.codPostal ?? null,
      caen: g.cod_CAEN ?? g.codCAEN ?? null,
      iban: g.iban ?? null,
      is_vat_payer: !!(tva.scpTVA ?? false),
      state: g.stare_inregistrare ?? g.stareinregistrare ?? null,
    });
  } catch (e) {
    return json({ error: 'server_error', message: String((e as Error).message) }, 500);
  }
});
