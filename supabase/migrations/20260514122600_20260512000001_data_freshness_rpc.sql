-- Migration: data_freshness() v1 RPC
-- Will be superseded by v2 in the next migration.
CREATE OR REPLACE FUNCTION public.data_freshness()
RETURNS TABLE (
  stream      text,
  last_update timestamptz,
  age_hours   numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT 'price_history'::text,
         (MAX(price_date)::timestamp + INTERVAL '21 hours')::timestamptz,
         EXTRACT(EPOCH FROM (NOW() - (MAX(price_date)::timestamp + INTERVAL '21 hours')))/3600
  FROM public.price_history WHERE "interval" = '1d'
  UNION ALL
  SELECT 'positions',
         MAX(updated_at),
         EXTRACT(EPOCH FROM (NOW() - MAX(updated_at)))/3600
  FROM public.positions
  UNION ALL
  SELECT 'sync_alpaca_prices',
         MAX(started_at),
         EXTRACT(EPOCH FROM (NOW() - MAX(started_at)))/3600
  FROM public.sync_log WHERE function_name = 'sync_alpaca_prices';
$$;

GRANT EXECUTE ON FUNCTION public.data_freshness() TO anon, authenticated, service_role;
