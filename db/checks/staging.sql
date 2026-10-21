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

\echo '--- v2.56: tanult párosítások (ingredient_aliases) ---'
SELECT c.relname AS tabla, c.relrowsecurity AS rls_on,
       (SELECT count(*) FROM public.ingredient_aliases) AS sorok
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'ingredient_aliases';

\echo '--- v2.56.1: settings — RLS szabályok és a mentéshez használt sorok megléte (értéket NEM listáz) ---'
SELECT policyname, cmd, roles::text, left(coalesce(qual,''),160) AS qual, left(coalesce(with_check,''),160) AS with_check
FROM pg_policies WHERE schemaname='public' AND tablename='settings' ORDER BY cmd, policyname;
SELECT k AS kulcs, EXISTS (SELECT 1 FROM public.settings s WHERE s.key = k) AS letezik
FROM unnest(ARRAY['recipe_ai_settings','recipe_financial_settings','recipe_baking_settings','invoice_settings','invoice_vision_model']) AS k;

-- ============================================================
-- Önköltség-kulcs elemzés (üzleti terv) — csak olvas, személyes adat nélkül
-- ============================================================
\echo '--- KÖLTSÉG A) eszközök (sütő / mixer) ---'
SELECT left(name,24) AS nev, type, power_kw, capacity_trays, preheat_kwh, duty_factor, tray_w_mm, tray_h_mm, active
FROM public.equipment ORDER BY type, name;

\echo '--- KÖLTSÉG B) receptek: paraméterek + nyersanyagköltség az alapadagra (legutóbbi beszerzési ár) ---'
WITH price AS (
  SELECT i.id, COALESCE(
    (SELECT b.price_per_g FROM public.ingredient_batches b WHERE b.ingredient_id = i.id AND b.price_per_g > 0 ORDER BY b.received_date DESC, b.id DESC LIMIT 1),
    NULLIF((to_jsonb(i)->>'base_price_per_g')::numeric, 0), NULLIF((to_jsonb(i)->>'price_per_g')::numeric, 0)) AS ppg
  FROM public.ingredients i),
mat AS (
  SELECT ri.recipe_id, SUM(ri.amount * COALESCE(p.ppg, 0)) AS cost, SUM(ri.amount) AS grams,
         COUNT(*) FILTER (WHERE p.ppg IS NULL) AS ar_nelkul, COUNT(*) AS tetel
  FROM public.recipe_ingredients ri LEFT JOIN price p ON p.id = ri.ingredient_id GROUP BY ri.recipe_id)
SELECT r.id, left(r.name, 26) AS recept, r.base_portion AS alap_g, r.unit_weight AS db_g, r.bake_loss AS veszt,
       r.levain_amount AS levain, to_jsonb(r)->>'setup_min' AS setup, to_jsonb(r)->>'per_unit_min' AS perdb,
       to_jsonb(r)->>'bake_min' AS sut, to_jsonb(r)->>'pieces_per_tray' AS db_talca, to_jsonb(r)->>'mixer_min' AS mix,
       r.labor_h, r.electricity AS kwh, round(m.cost::numeric, 2) AS anyag_lej, round(m.grams) AS anyag_g, m.ar_nelkul, m.tetel,
       pr.price AS ar, pr.weight AS termek_g
FROM public.recipes r LEFT JOIN mat m ON m.recipe_id = r.id LEFT JOIN public.products pr ON pr.id = r.product_id
WHERE COALESCE(r.archived, false) = false ORDER BY r.name;

\echo '--- KÖLTSÉG C) levain-alapanyagok ára (id 1 víz, 4 kovász, 9 barnarizsliszt) ---'
SELECT i.id, left(i.name, 30) AS nev, i.unit,
  (SELECT round(b.price_per_g::numeric * 1000, 2) FROM public.ingredient_batches b WHERE b.ingredient_id = i.id AND b.price_per_g > 0 ORDER BY b.received_date DESC, b.id DESC LIMIT 1) AS lej_kg
FROM public.ingredients i WHERE i.id IN (1, 4, 9) ORDER BY i.id;

\echo '--- KÖLTSÉG D) rendelési volumen: az utolsó 40 rendelési nap (db, kg) ---'
WITH d AS (
  SELECT o.year, o.month, o.day, SUM(o.quantity) AS db, SUM(o.quantity * COALESCE(p.weight, 0)) AS g
  FROM public.orders o JOIN public.products p ON p.id = o.product_id WHERE o.quantity > 0
  GROUP BY 1, 2, 3 ORDER BY 1 DESC, 2 DESC, 3 DESC LIMIT 40)
SELECT count(*) AS napok, round(avg(db), 1) AS atlag_db, round(avg(g) / 1000, 1) AS atlag_kg, max(db) AS max_db, min(db) AS min_db,
       min(year * 10000 + month * 100 + day) AS elso, max(year * 10000 + month * 100 + day) AS utolso FROM d;

\echo '--- KÖLTSÉG E) termék-mix ugyanebben az időszakban ---'
WITH days AS (SELECT DISTINCT year, month, day FROM public.orders WHERE quantity > 0 ORDER BY 1 DESC, 2 DESC, 3 DESC LIMIT 40)
SELECT left(p.name, 28) AS termek, p.weight AS g, p.price AS ar, SUM(o.quantity) AS db
FROM public.orders o JOIN days USING (year, month, day) JOIN public.products p ON p.id = o.product_id
WHERE o.quantity > 0 GROUP BY p.name, p.weight, p.price ORDER BY db DESC LIMIT 25;

\echo '--- KÖLTSÉG F) sütési napló: az utolsó 25 sütési nap (db, batch, tálca, sütési perc) ---'
SELECT date, SUM(pieces_actual) FILTER (WHERE log_type IN ('order', 'extra')) AS db,
       count(DISTINCT batch_no) AS batch, SUM(trays_used) AS talca, max(bake_minutes) AS max_perc, count(DISTINCT oven_id) AS suto,
       round(SUM(total_cost) FILTER (WHERE log_type = 'customer')::numeric, 2) AS anyag_lej
FROM public.production_logs GROUP BY date ORDER BY date DESC LIMIT 25;
