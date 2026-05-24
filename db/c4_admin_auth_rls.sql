-- KEREK v2.30.0 — C4 Admin Auth biztonsági refactor
-- Protect settings.admin_password from anon read access.
-- Service role can still read everything (Edge Functions use service role).
--
-- Run this ONCE in Supabase Dashboard → SQL Editor → New Query → Paste → Run.

-- 1. Enable Row Level Security on the settings table (if not yet enabled)
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- 2. Allow anon role to SELECT all settings EXCEPT admin_password
DROP POLICY IF EXISTS "anon_read_settings_except_password" ON settings;
CREATE POLICY "anon_read_settings_except_password"
  ON settings
  FOR SELECT
  TO anon
  USING (key <> 'admin_password');

-- 3. Allow anon role to INSERT/UPDATE settings EXCEPT admin_password
--    (so admin UI can still save categories, baking_days_default, etc.)
DROP POLICY IF EXISTS "anon_write_settings_except_password" ON settings;
CREATE POLICY "anon_write_settings_except_password"
  ON settings
  FOR ALL
  TO anon
  USING (key <> 'admin_password')
  WITH CHECK (key <> 'admin_password');

-- 4. Verify: this should return 0 rows for anon, 1 row for service_role
-- SELECT * FROM settings WHERE key = 'admin_password';

-- Note: service_role bypasses RLS, so the admin-auth Edge Function can still
-- read admin_password. Only anonymous browser requests are blocked.
