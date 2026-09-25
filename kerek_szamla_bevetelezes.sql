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
