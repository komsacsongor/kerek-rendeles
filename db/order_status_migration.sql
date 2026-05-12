-- ============================================================
-- KEREK – Rendelési státusz gép migration
-- Futtatás: Supabase SQL Editor
-- ============================================================

-- 1. Tábla létrehozása
CREATE TABLE IF NOT EXISTS order_status (
  client_id     text        NOT NULL,
  year          int         NOT NULL,
  month         int         NOT NULL,
  day           int         NOT NULL,
  status        text        NOT NULL DEFAULT 'pending',
  admin_note    text,
  deadline      timestamptz,
  confirmed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, year, month, day),
  CONSTRAINT order_status_status_check CHECK (status IN ('pending','confirmed','modified','cancelled'))
);

-- 2. Push subscriptions tábla (Web Push – következő fázis)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  client_id  text        NOT NULL,
  endpoint   text        NOT NULL,
  p256dh     text        NOT NULL,
  auth       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, endpoint)
);

-- 3. RLS engedélyezése
ALTER TABLE order_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 4. RLS policy-k (anon key olvashat/írhat – ugyanolyan mint a többi tábla)
CREATE POLICY "anon_all_order_status" ON order_status FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_push_subscriptions" ON push_subscriptions FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- Edge Function + Cron (automatikus lezárás 18:00-kor)
-- Ezt a Supabase Dashboard-on kell létrehozni:
-- Functions > New Function > "auto-confirm-orders"
-- Schedule: "0 15 * * *" (UTC = 18:00 EEST)
-- ============================================================
-- A függvény kódja: supabase/functions/auto-confirm-orders/index.ts
