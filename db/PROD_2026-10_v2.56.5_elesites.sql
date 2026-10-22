-- ============================================================
-- KEREK — PROD-ÉLESÍTÉS v2.56.5: összes szükséges adatbázis-módosítás EGY fájlban
-- Futtasd a PROD Supabase SQL Editorban a kód élesítése ELŐTT.
-- Idempotens: ami már megvan (pl. a v2.53 / v2.54 oszlopok), azt nem változtatja; meglévő adatot nem módosít.
-- A végén egy összesítő: minden sor „✅ rendben” kell legyen.
-- ============================================================

-- ############################################################
-- v2.53 gyártás-oszlopok  (db/2026-09_v2.53_gyartas_oszlopok.sql)
-- ############################################################
-- ============================================================
-- KEREK — Gyártás-flow / batch-tervező oszlopai (v2.53.95–136)
-- A staging kód ezeket írja/olvassa; PROD-on hiányuk → PGRST204 hiba.
-- Futtasd PROD-on (és STAGING-en is, ha a heti szinkron letörölte).
-- Idempotens (IF NOT EXISTS) — többször is lefuttatható, a meglévő adatot nem érinti,
-- és a jelenlegi PROD kódot sem zavarja (csak új, üres oszlopok).
-- ============================================================

-- Sütők: tálca-típus és -méret (batch-kapacitás számítás)
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS tray_type  TEXT;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS tray_w_mm  NUMERIC;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS tray_h_mm  NUMERIC;

-- Receptek: darab / tálca (GN 1/1-re vetítve)
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS pieces_per_tray NUMERIC;

-- Sütési napló: batch-adat a KPI-okhoz + felesleg-allokálás
ALTER TABLE public.production_logs ADD COLUMN IF NOT EXISTS oven_id      BIGINT;
ALTER TABLE public.production_logs ADD COLUMN IF NOT EXISTS bake_minutes INTEGER;
ALTER TABLE public.production_logs ADD COLUMN IF NOT EXISTS trays_used   NUMERIC;
ALTER TABLE public.production_logs ADD COLUMN IF NOT EXISTS batch_no     INTEGER;
ALTER TABLE public.production_logs ADD COLUMN IF NOT EXISTS allocation   TEXT;

-- PostgREST séma-cache frissítése (különben az új oszlop percekig "nem létezik")
NOTIFY pgrst, 'reload schema';

-- ############################################################
-- v2.54 számla-bevételezés  (db/2026-09_v2.54_szamla_bevetelezes.sql)
-- ############################################################
-- ============================================================
-- KEREK — Számla-bevételező operátor: séma-bővítés
-- v2.54.0
-- Futtasd MINDKÉT környezetben (PROD és STAGING).
-- Idempotens (IF NOT EXISTS), többször is lefuttatható.
-- ============================================================

-- FIFO-tétel (ingredient_batches) visszakövethetőség + deviza a számlához
ALTER TABLE public.ingredient_batches ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE public.ingredient_batches ADD COLUMN IF NOT EXISTS currency       TEXT;
ALTER TABLE public.ingredient_batches ADD COLUMN IF NOT EXISTS fx_rate        NUMERIC;

-- Gyors duplikátum-ellenőrzéshez (számlaszám szerint)
CREATE INDEX IF NOT EXISTS idx_ing_batches_invoice_no
  ON public.ingredient_batches (invoice_number);

-- Megjegyzés: a tábla már létezik, ezért új GRANT nem szükséges —
-- az oszlop-jogosultságok a tábla-szintű GRANT-ból öröklődnek.

NOTIFY pgrst, 'reload schema';

-- ############################################################
-- v2.55.1 vevő PIN (client_auth)  (db/2026-10_v2.55.1_vevo_auth_temp_pin.sql)
-- ############################################################
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

-- ############################################################
-- v2.56 tanult párosítások  (db/2026-10_v2.56_ingredient_aliases.sql)
-- ############################################################
-- ============================================================
-- KEREK — Számla-operátor: tanult párosítások (számla-tételnév → alapanyag)
-- v2.56.0
-- Amit a bevételezéskor jóváhagysz / kijavítasz, azt megjegyzi: legközelebb ugyanannál a
-- beszállítónál ugyanaz a tétel automatikusan párosul („✅ tanult”).
-- Futtasd STAGING-en ÉS PROD-on is (a vasárnapi szinkron a PROD sémáját másolja a stagingre).
-- Idempotens — többször is lefuttatható, meglévő adatot nem módosít.
-- Hozzáférés: csak az admin-data Edge Functionön át (RLS bekapcsolva, policy nélkül).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ingredient_aliases (
  id             BIGSERIAL PRIMARY KEY,
  supplier_key   TEXT NOT NULL DEFAULT '',     -- beszállító normalizált neve (jogi forma / domain nélkül)
  raw_key        TEXT NOT NULL,                -- tételnév normalizálva, mennyiség nélkül
  raw_name       TEXT,                         -- az eredeti tételnév (tájékoztató)
  ingredient_id  INTEGER NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (supplier_key, raw_key)
);

ALTER TABLE public.ingredient_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ingredient_aliases FROM anon, authenticated;

GRANT ALL ON public.ingredient_aliases TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.ingredient_aliases_id_seq TO service_role;
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- ÖSSZESÍTŐ ELLENŐRZÉS — minden sor: ✅ rendben
-- ============================================================
WITH cols AS (
  SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'
)
SELECT 'v2.53 gyártás-oszlopok (9)' AS tetel,
       CASE WHEN (SELECT count(*) FROM cols WHERE (table_name, column_name) IN (
         ('equipment','tray_type'),('equipment','tray_w_mm'),('equipment','tray_h_mm'),('recipes','pieces_per_tray'),
         ('production_logs','oven_id'),('production_logs','bake_minutes'),('production_logs','trays_used'),
         ('production_logs','batch_no'),('production_logs','allocation'))) = 9 THEN '✅ rendben' ELSE '❌ hiányzik' END AS eredmeny
UNION ALL
SELECT 'v2.54 számla-oszlopok (3)',
       CASE WHEN (SELECT count(*) FROM cols WHERE (table_name, column_name) IN (
         ('ingredient_batches','invoice_number'),('ingredient_batches','currency'),('ingredient_batches','fx_rate'))) = 3 THEN '✅ rendben' ELSE '❌ hiányzik' END
UNION ALL
SELECT 'v2.55.1 client_auth tábla + RLS + új oszlopok',
       CASE WHEN EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                          WHERE n.nspname = 'public' AND c.relname = 'client_auth' AND c.relrowsecurity)
             AND (SELECT count(*) FROM cols WHERE table_name = 'client_auth' AND column_name IN ('must_change','temp_pin_until')) = 2
            THEN '✅ rendben' ELSE '❌ hiányzik' END
UNION ALL
SELECT 'v2.56 ingredient_aliases tábla + RLS',
       CASE WHEN EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                          WHERE n.nspname = 'public' AND c.relname = 'ingredient_aliases' AND c.relrowsecurity)
            THEN '✅ rendben' ELSE '❌ hiányzik' END;
