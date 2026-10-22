-- ============================================================
-- KEREK — C1 javítás: ideiglenes PIN (admin) + a v2.55.0 tábla (ha még nincs)
-- v2.55.1
-- Futtasd STAGING-en ÉS PROD-on is (a vasárnapi szinkron a PROD sémáját másolja a stagingre —
-- ha csak a stagingen van meg, vasárnap elveszik).
-- Idempotens — többször is lefuttatható, meglévő adatot nem módosít.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.client_auth (
  client_id         TEXT PRIMARY KEY,
  pin_hash          TEXT,
  q1                SMALLINT,
  a1_hash           TEXT,
  q2                SMALLINT,
  a2_hash           TEXT,
  pin_set_at        TIMESTAMPTZ,
  token_version     INTEGER NOT NULL DEFAULT 0,
  pin_fail_count    INTEGER NOT NULL DEFAULT 0,
  pin_locked_until  TIMESTAMPTZ,
  rec_fail_day      DATE,
  rec_fail_count    INTEGER NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- v2.55.1: ideiglenes PIN — a vevő belépéskor köteles újat választani; lejárat 7 nap
ALTER TABLE public.client_auth ADD COLUMN IF NOT EXISTS must_change    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.client_auth ADD COLUMN IF NOT EXISTS temp_pin_until TIMESTAMPTZ;

ALTER TABLE public.client_auth ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_auth FROM anon, authenticated;
GRANT ALL ON public.client_auth TO service_role;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- ELLENŐRZÉS: 1 sor — rls_on = true, uj_oszlopok = 2
-- ------------------------------------------------------------
SELECT c.relname AS tabla, c.relrowsecurity AS rls_on,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema='public' AND table_name='client_auth'
           AND column_name IN ('must_change','temp_pin_until')) AS uj_oszlopok,
       (SELECT count(*) FROM public.client_auth) AS pin_sorok
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'client_auth';
