-- Atlas Market Data Pipeline: price_history schema update (corrected)
-- Column names confirmed from live Supabase schema:
--   date       → price_date
--   adj_close  → adjusted_close
--   provider   → source
-- Only missing column is: interval

ALTER TABLE price_history
  ADD COLUMN IF NOT EXISTS interval text NOT NULL DEFAULT '1d';

-- Drop old unique constraint if one exists
ALTER TABLE price_history
  DROP CONSTRAINT IF EXISTS price_history_asset_id_price_date_key;

-- Add correct composite unique constraint using actual column names
ALTER TABLE price_history
  ADD CONSTRAINT price_history_unique_row
  UNIQUE (asset_id, source, interval, price_date);

-- Index for fast range queries (performance analytics engine)
CREATE INDEX IF NOT EXISTS idx_price_history_asset_interval_date
  ON price_history (asset_id, interval, price_date DESC);
