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
GRANT ALL ON public.ingredient_aliases TO service_role;                              -- 2026-10-24: kifejezett jog (Supabase 10-30)
GRANT USAGE, SELECT ON SEQUENCE public.ingredient_aliases_id_seq TO service_role;

-- Ellenőrzés: 1 sor, rls_on = true, policy_db = 0
SELECT c.relname AS tabla, c.relrowsecurity AS rls_on,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename = 'ingredient_aliases') AS policy_db
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'ingredient_aliases';
