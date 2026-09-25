// KEREK — bnr-rates Edge Function
// Hivatalos BNR (Román Nemzeti Bank) napi referencia-árfolyam, ingyenes, kulcs nélkül.
// Böngészőből közvetlenül nem hívható (CORS), ezért megy szerveroldalról.
// Kérés:  { "currency": "EUR", "date": "2026-09-24" }  (date opcionális)
// Válasz: { "ok": true, "rate": 4.9765, "date": "2026-09-24", "currency": "EUR" }
// Megjegyzés: egyes devizák (pl. HUF) multiplier="100" attribútummal jönnek — ezt osztjuk.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Egy Cube-blokkból kiolvassa a keresett deviza árfolyamát (multiplier-rel osztva).
function rateFromCube(cube: string, cur: string): number | null {
  const re = new RegExp(`<Rate[^>]*currency="${cur}"[^>]*>([0-9.]+)</Rate>`, 'i');
  const m = cube.match(re);
  if (!m) return null;
  let val = parseFloat(m[1]);
  const mult = cube.match(new RegExp(`<Rate[^>]*currency="${cur}"[^>]*multiplier="([0-9]+)"`, 'i'))
            || cube.match(new RegExp(`<Rate[^>]*multiplier="([0-9]+)"[^>]*currency="${cur}"`, 'i'));
  if (mult) val = val / parseFloat(mult[1]);
  return val > 0 ? val : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const { currency, date } = await req.json();
    const cur = String(currency ?? '').toUpperCase().replace(/[^A-Z]/g, '');
    if (!cur) return json({ error: 'invalid_currency' }, 400);
    if (cur === 'RON' || cur === 'LEI' || cur === 'LEJ') return json({ ok: true, rate: 1, currency: 'RON', date: date ?? null });

    const wantDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date ?? '')) ? String(date) : null;
    const year = wantDate ? wantDate.slice(0, 4) : new Date().getFullYear().toString();

    // Forrás: éves fájl (történeti dátumhoz), különben a legfrissebb napi.
    const urls = wantDate
      ? [`https://www.bnr.ro/files/xml/years/nbrfx${year}.xml`, 'https://www.bnr.ro/nbrfxrates.xml']
      : ['https://www.bnr.ro/nbrfxrates.xml'];

    let xml = '';
    for (const u of urls) {
      try {
        const r = await fetch(u, { headers: { 'User-Agent': 'KEREK/1.0' } });
        if (r.ok) { xml = await r.text(); break; }
      } catch (_) { /* next */ }
    }
    if (!xml) return json({ error: 'bnr_unavailable' }, 502);

    // Cube-ok kigyűjtése dátummal
    const cubes = [...xml.matchAll(/<Cube date="(\d{4}-\d{2}-\d{2})">([\s\S]*?)<\/Cube>/g)]
      .map((m) => ({ date: m[1], body: m[2] }));
    if (!cubes.length) return json({ error: 'parse_error' }, 502);

    // A kért dátumhoz: a legutolsó Cube, ami <= kért dátum (előző banki nap).
    let chosen = cubes[cubes.length - 1];
    if (wantDate) {
      const le = cubes.filter((c) => c.date <= wantDate);
      chosen = le.length ? le[le.length - 1] : cubes[0];
    }

    const rate = rateFromCube(chosen.body, cur);
    if (rate == null) return json({ error: 'currency_not_found', currency: cur }, 404);

    return json({ ok: true, rate, currency: cur, date: chosen.date });
  } catch (e) {
    return json({ error: 'server_error', message: String((e as Error).message) }, 500);
  }
});
