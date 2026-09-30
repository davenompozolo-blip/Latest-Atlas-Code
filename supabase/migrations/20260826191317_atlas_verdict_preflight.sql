CREATE OR REPLACE FUNCTION public.atlas_verdict_preflight()
RETURNS TABLE (check_name text, passed boolean, detail text)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_catalog
AS $$
BEGIN
    -- §1.1 Freshness. Compared against the last SESSION, never CURRENT_DATE:
    -- the job runs nightly and a calendar comparison would refuse every
    -- Saturday, Sunday and market holiday, leaving permanent gaps in a table
    -- whose whole value is being a continuous record.
    --
    -- Uses the existing atlas_last_traded_day() rather than a second function
    -- of its own: it is already SPY's max price_date, already has search_path
    -- pinned, and a duplicate under a near-identical name is a thing to keep
    -- in sync forever.
    RETURN QUERY
    SELECT 'positions_freshness'::text,
           (SELECT max(as_of_date) FROM positions) >= atlas_last_traded_day(),
           format('positions %s vs last traded day %s',
                  (SELECT max(as_of_date) FROM positions), atlas_last_traded_day());

    -- §1.2 Coherence. THE gate that matters: the 2026-08-24 phantom rows
    -- carried a current snapshot date and were wrong in content, so freshness
    -- passes them cleanly and only this catches them.
    RETURN QUERY
    SELECT 'ledger_coherence'::text,
           count(*) = 0,
           format('%s symbols mismatched: %s', count(*),
                  COALESCE(string_agg(symbol || ' (broker ' || COALESCE(broker_qty,0)
                           || ' vs ledger ' || COALESCE(ledger_qty,0) || ')', ', '
                           ORDER BY symbol), 'none'))
      FROM vw_position_reconciliation
     WHERE NOT reconciles;

    -- §3 Matrix coverage. Refuses only for a name that HAS a usable feed and
    -- is still missing - that is a real coverage failure and would silently
    -- flip peer_basis from cluster to book.
    --
    -- A name absent because its own feed is too thin to correlate does NOT
    -- refuse. KMTUY is permanently in that state (7 bars in a 120-day window
    -- against a 60-bar minimum), so refusing on it would block the job every
    -- night forever - and a red light that can never go green is one you learn
    -- to ignore. Nothing is being hidden: the engine already refuses such a
    -- name as `stale_mark`, so it carries peer_basis 'none' and no tier is
    -- being quietly downgraded. It is still reported in the detail.
    RETURN QUERY
    SELECT 'matrix_coverage'::text,
           count(*) FILTER (WHERE NOT feed_too_thin) = 0,
           format('%s absent with a live feed: %s | %s absent on a thin feed: %s',
                  count(*) FILTER (WHERE NOT feed_too_thin),
                  COALESCE(string_agg(symbol, ', ') FILTER (WHERE NOT feed_too_thin), 'none'),
                  count(*) FILTER (WHERE feed_too_thin),
                  COALESCE(string_agg(symbol || ' (last bar ' || last_bar || ')', ', ')
                           FILTER (WHERE feed_too_thin), 'none'))
      FROM vw_held_symbols_absent_from_matrix;
END;
$$;

COMMENT ON FUNCTION public.atlas_verdict_preflight() IS
 'Three gates the nightly verdict job must clear before writing anything (step 4 close-out §1.3). Freshness and coherence are different gates catching different failures - a snapshot can be correctly dated and wrong in content, which is exactly what happened on 2026-08-24 - and only coherence catches that one. position_verdicts is an append-only history, so a bad row cannot be corrected later; refusing to write is the only safe failure.';

GRANT EXECUTE ON FUNCTION public.atlas_verdict_preflight() TO service_role;
