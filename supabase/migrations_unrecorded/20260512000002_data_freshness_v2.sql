-- Migration: data_freshness() v2
--
-- Replaces the v1 function (20260512000001) with a richer version that:
--   - Uses correct column names (account_snapshots.as_of, not snapshot_date)
--   - Returns a 'status' field (fresh/stale/dead) with per-stream thresholds
--     instead of forcing the client to compute it
--   - Adds sync_log stream entries for both Edge Functions so the tile can
--     distinguish "prices sync never ran" from "prices sync ran but data stale"
--
-- Column corrections vs v1:
--   account_snapshots: as_of (timestamptz) — not snapshot_date
--   price_history:     price_date + interval '21 hours' → approx 9 PM ET close

CREATE OR REPLACE FUNCTION public.data_freshness()
RETURNS TABLE (
  stream        text,
  last_update   timestamptz,
  age_hours     numeric,
  status        text    -- 'fresh' | 'stale' | 'dead'
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH streams AS (
    -- Price history: treat max(price_date) as end-of-trading-day
    SELECT
      'price_history'::text                                                    AS stream,
      (MAX(price_date)::timestamp + INTERVAL '21 hours')::timestamptz         AS latest_event,
      36::numeric                                                              AS warn_hours,
      96::numeric                                                              AS dead_hours
    FROM public.price_history
    WHERE "interval" = '1d'

    UNION ALL

    -- Positions: last upsert timestamp
    SELECT 'positions', MAX(updated_at), 1, 24
    FROM public.positions

    UNION ALL

    -- Account snapshots: broker equity snapshot
    SELECT 'account_snapshots', MAX(as_of), 24, 96
    FROM public.account_snapshots

    UNION ALL

    -- Edge Function: position sync heartbeat
    SELECT
      'sync_alpaca_positions',
      MAX(started_at) FILTER (WHERE status = 'success'),
      1, 24
    FROM public.sync_log
    WHERE function_name = 'sync_alpaca_positions'

    UNION ALL

    -- Edge Function: price sync heartbeat (may be null before first run)
    SELECT
      'sync_alpaca_prices',
      MAX(started_at) FILTER (WHERE status = 'success'),
      36, 96
    FROM public.sync_log
    WHERE function_name = 'sync_alpaca_prices'
  )
  SELECT
    stream,
    latest_event                                                               AS last_update,
    ROUND(EXTRACT(EPOCH FROM (NOW() - latest_event)) / 3600.0, 2)             AS age_hours,
    CASE
      WHEN latest_event IS NULL
        THEN 'dead'
      WHEN EXTRACT(EPOCH FROM (NOW() - latest_event)) / 3600.0 > dead_hours
        THEN 'dead'
      WHEN EXTRACT(EPOCH FROM (NOW() - latest_event)) / 3600.0 > warn_hours
        THEN 'stale'
      ELSE 'fresh'
    END                                                                        AS status
  FROM streams
  ORDER BY
    CASE stream
      WHEN 'price_history'         THEN 1
      WHEN 'positions'             THEN 2
      WHEN 'account_snapshots'     THEN 3
      WHEN 'sync_alpaca_positions' THEN 4
      WHEN 'sync_alpaca_prices'    THEN 5
      ELSE 6
    END
$$;

GRANT EXECUTE ON FUNCTION public.data_freshness() TO anon, authenticated, service_role;
