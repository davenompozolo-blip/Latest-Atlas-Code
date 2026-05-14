-- Migration: fix price_history schema so sync-wrapper.mjs can actually upsert rows.
--
-- Root cause: sync-wrapper writes `interval: '1d'` in every row and calls
-- .upsert(..., { onConflict: 'asset_id,price_date,interval' }) but the column
-- and matching unique index never existed, causing 100% silent upsert failures
-- since the first sync run.
--
-- Fix:
--   1. Add the missing `interval` column (default '1d' so existing rows stay valid)
--   2. Drop the old 2-column unique constraint
--   3. Create the new 3-column unique index that matches the upsert conflict spec

-- 1. Add interval column (idempotent)
ALTER TABLE public.price_history
  ADD COLUMN IF NOT EXISTS interval text NOT NULL DEFAULT '1d';

-- 2. Drop the old constraint (was: UNIQUE (asset_id, price_date))
ALTER TABLE public.price_history
  DROP CONSTRAINT IF EXISTS price_history_asset_id_price_date_key;

-- 3. New unique index matching onConflict: 'asset_id,price_date,interval'
CREATE UNIQUE INDEX IF NOT EXISTS price_history_asset_date_interval_uniq
  ON public.price_history (asset_id, price_date, interval);
