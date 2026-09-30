-- ============================================================
-- KEREK — C1 biztonság: vevő-belépés (PIN + biztonsági kérdések)
-- v2.55.0
-- Futtasd STAGING-en ÉS PROD-on (előbb staging, teszt, aztán prod).
-- Idempotens — többször is lefuttatható, meglévő adatot nem módosít.
--
-- A PIN és a biztonsági válaszok KÜLÖN táblában, lassú hash-sel (PBKDF2) —
-- a tábla a nyilvános kulcs elől teljesen el van zárva (RLS, policy nélkül),
-- csak a szerverfüggvények (service_role) érik el. Ez a heti staging-szinkron
-- után is így marad (az RLS a sémával együtt másolódik).
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

ALTER TABLE public.client_auth ENABLE ROW LEVEL SECURITY;
-- nincs policy → anon / authenticated semmit nem lát és nem ír
REVOKE ALL ON public.client_auth FROM anon, authenticated;
GRANT ALL ON public.client_auth TO service_role;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- ELLENŐRZÉS: 1 sor, rls_on = true
-- ------------------------------------------------------------
SELECT c.relname AS tabla, c.relrowsecurity AS rls_on,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename = 'client_auth') AS policy_db
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'client_auth';
