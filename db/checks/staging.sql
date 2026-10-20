-- ============================================================
-- KEREK — STAGING ellenőrző lekérdezések (CSAK OLVASÓ — a workflow read-only tranzakcióban futtatja)
-- A db-staging.yml workflow minden db/ változáskor lefuttatja; az eredmény a GitHub Actions logban.
-- Személyes adatot (e-mail, telefon, hash) NEM listázunk — csak darabszámot / állapotot.
-- ============================================================

\echo '--- client_auth tábla: létezik? RLS? új oszlopok? ---'
SELECT c.relname AS tabla, c.relrowsecurity AS rls_on,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename = 'client_auth') AS policy_db,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema='public' AND table_name='client_auth'
           AND column_name IN ('must_change','temp_pin_until')) AS uj_oszlopok
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'client_auth';

\echo '--- PIN-állapot összesítő (darabszámok) ---'
SELECT count(*) AS auth_sorok,
       count(*) FILTER (WHERE pin_hash IS NOT NULL) AS van_pin,
       count(*) FILTER (WHERE a1_hash IS NOT NULL AND a2_hash IS NOT NULL) AS van_kerdes,
       count(*) FILTER (WHERE must_change) AS ideiglenes
FROM public.client_auth;

\echo '--- Vevők: PIN nélküli jóváhagyott vevők száma ---'
SELECT count(*) AS jovahagyott_vevo,
       count(*) FILTER (WHERE a.client_id IS NULL OR a.pin_hash IS NULL) AS pin_nelkul
FROM public.clients c LEFT JOIN public.client_auth a ON a.client_id = c.id
WHERE c.name NOT LIKE '[PENDING]%' AND c.name NOT LIKE '[DELETED]%';

\echo '--- Gyártás- és számla-oszlopok (v2.53 / v2.54) ---'
SELECT table_name, count(*) AS oszlop_db
FROM information_schema.columns
WHERE table_schema='public' AND (table_name, column_name) IN (
  ('equipment','tray_type'),('equipment','tray_w_mm'),('equipment','tray_h_mm'),('recipes','pieces_per_tray'),
  ('production_logs','oven_id'),('production_logs','bake_minutes'),('production_logs','trays_used'),
  ('production_logs','batch_no'),('production_logs','allocation'),
  ('ingredient_batches','invoice_number'),('ingredient_batches','currency'),('ingredient_batches','fx_rate'))
GROUP BY table_name ORDER BY table_name;
