-- Concurrent refresh helper so syncs can repopulate the snapshot without
-- blocking reads. Uses the unique index on symbol for CONCURRENTLY.
CREATE OR REPLACE FUNCTION refresh_nexus_holdings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_nexus_holdings;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_nexus_holdings() TO service_role;
