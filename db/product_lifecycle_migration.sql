-- KEREK – Termék életciklus migration
-- 1. deleted_at mező (soft delete)
ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- 2. Index a gyors szűréshez
CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON products(deleted_at);

-- 3. RLS policy már megvan, de ellenőrizzük
-- Az anon policy "USING (true)" már lefedi az összes sort
-- Az appban kell szűrni: WHERE deleted_at IS NULL (aktív termékek)

-- Ellenőrzés
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'products' AND column_name = 'deleted_at';
