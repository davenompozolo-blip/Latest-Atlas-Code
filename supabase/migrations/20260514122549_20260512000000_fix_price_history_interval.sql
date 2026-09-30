-- Migration: fix price_history schema so sync-wrapper.mjs can actually upsert rows.
-- 1. Add interval column (idempotent)
ALTER TABLE public.price_history
  ADD COLUMN IF NOT EXISTS interval text NOT NULL DEFAULT '1d';

-- 2. Drop the old constraint (was: UNIQUE (asset_id, price_date))
ALTER TABLE public.price_history
  DROP CONSTRAINT IF EXISTS price_history_asset_id_price_date_key;

-- 3. New unique index matching onConflict: 'asset_id,price_date,interval'
CREATE UNIQUE INDEX IF NOT EXISTS price_history_asset_date_interval_uniq
  ON public.price_history (asset_id, price_date, interval);
