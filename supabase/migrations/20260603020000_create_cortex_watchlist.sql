-- Cortex Watchlist · Pinned panel backing table
-- Color-coded status dots: active (green) · stale (amber/red) · candidate (blue)
CREATE TABLE IF NOT EXISTS cortex_watchlist (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  symbol      text NOT NULL,
  status      text NOT NULL DEFAULT 'candidate' CHECK (status IN ('active','stale','candidate')),
  note        text,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);

ALTER TABLE cortex_watchlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cortex_watchlist_all ON cortex_watchlist;
CREATE POLICY cortex_watchlist_all ON cortex_watchlist
  FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON cortex_watchlist TO anon, authenticated, service_role;

INSERT INTO cortex_watchlist (symbol, status, note, sort_order) VALUES
  ('VRT',   'active',    'AI datacenter thermal/power — thesis extender; monitor for entry on pullback.', 1),
  ('NPSNY', 'stale',     'Naspers/Prosus ADR — watching Tencent NAV discount; data slightly stale.',      2),
  ('UNH',   'candidate', 'Healthcare SAA fill candidate — managed care anchor, awaiting valuation read.',  3)
ON CONFLICT (user_id, symbol) DO NOTHING;
