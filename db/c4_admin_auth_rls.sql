-- KEREK v2.30.0 — C4 Admin Auth biztonsági refactor (FINAL)
-- Move admin_password to dedicated admin_secrets table with strict RLS + REVOKE.
--
-- Run this ONCE in Supabase Dashboard → SQL Editor → New Query → Paste → Run.

-- 1. Create admin_secrets table (idempotent)
CREATE TABLE IF NOT EXISTS admin_secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Copy admin_password from settings to admin_secrets, stripping JSON quotes
INSERT INTO admin_secrets (key, value)
  SELECT key, trim(both '"' from value::text) FROM settings WHERE key = 'admin_password'
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 3. Enable RLS on admin_secrets (NO policies = deny all for non-service-role)
ALTER TABLE admin_secrets ENABLE ROW LEVEL SECURITY;

-- 4. REVOKE all grants from anon and authenticated
REVOKE ALL ON admin_secrets FROM anon, authenticated;
GRANT ALL ON admin_secrets TO service_role;

-- 5. Remove admin_password from settings table
DELETE FROM settings WHERE key = 'admin_password';
