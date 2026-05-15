-- Migration: add listing_status to assets table
--
-- Prepares assets as the canonical screener universe. The sync_listing_status
-- Edge Function populates this from Alpha Vantage LISTING_STATUS (weekly).
--
-- Values:
--   'active'   — currently trading, screenable
--   'delisted' — no longer trading; retained because positions may reference it
--   null       — legacy rows inserted before this column existed; treated as 'active'
--               (they come from real positions, so they were active when added)

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS listing_status text DEFAULT 'active';

COMMENT ON COLUMN public.assets.listing_status IS
  'active | delisted. Populated by sync_listing_status Edge Function weekly. NULL = legacy held asset, treat as active.';

-- Back-fill held assets that existed before this column: mark them active
UPDATE public.assets SET listing_status = 'active' WHERE listing_status IS NULL;

-- Index for the screener filter — all active universe queries use this predicate
CREATE INDEX IF NOT EXISTS assets_listing_status_idx
  ON public.assets (listing_status)
  WHERE listing_status = 'active';
