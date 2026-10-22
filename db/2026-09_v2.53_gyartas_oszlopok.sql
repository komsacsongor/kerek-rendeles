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

-- ------------------------------------------------------------
-- ELLENŐRZÉS: futtatás után ennek 9 sort kell adnia
-- ------------------------------------------------------------
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name, column_name) IN (
    ('equipment','tray_type'), ('equipment','tray_w_mm'), ('equipment','tray_h_mm'),
    ('recipes','pieces_per_tray'),
    ('production_logs','oven_id'), ('production_logs','bake_minutes'), ('production_logs','trays_used'),
    ('production_logs','batch_no'), ('production_logs','allocation'))
ORDER BY table_name, column_name;
