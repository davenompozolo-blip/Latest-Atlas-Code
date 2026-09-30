-- Materialise the return engine for the read path (memo v2 §7: all heavy
-- computation in the nightly job).
--
-- `vw_position_returns` runs 86 plpgsql bisections plus 86 self-counterfactual
-- calls per read — 940 ms warm. That is under anon's 3s cap, but this repo's
-- own rule is that a warm mean near the cap is what a cold-call failure looks
-- like before it happens: `vw_portfolio_home` sat at 944 ms mean / 2,978 ms max
-- and was being cancelled per call, which is what "some panels load, some
-- don't" looked like from the outside. A read path that recomputes an IRR per
-- position on every page load is that pattern by construction, so it is
-- materialised rather than watched.
--
-- 940 ms → 0.7 ms.
--
-- The three engine functions also gain `SET search_path = public`. Without it
-- `atlas_counterfactual` resolved `assets` against whatever search_path the
-- caller happened to have and failed with 42P01 the first time it was called
-- from a migration rather than a plain session — a latent break for any
-- scheduled or SECURITY DEFINER caller, not just this one.
--
-- Refreshed by pg_cron at 23:35 weekdays, between `chain_ts_clusters` (23:30)
-- and `atlas_run_validation` (23:40), so validation can still see it. Added to
-- `cron.job` and nowhere else, per the scheduler rule.

ALTER FUNCTION public.atlas_counterfactual(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.atlas_mwr_period(date[], numeric[]) SET search_path = public;
ALTER FUNCTION public.atlas_xirr(date[], numeric[]) SET search_path = public;

DROP MATERIALIZED VIEW IF EXISTS public.mv_position_returns;

CREATE MATERIALIZED VIEW public.mv_position_returns AS
 SELECT r.*, now() AS computed_at
   FROM public.vw_position_returns r;

-- Unique index is what allows REFRESH ... CONCURRENTLY.
CREATE UNIQUE INDEX mv_position_returns_asset_uniq
    ON public.mv_position_returns (asset_id);
CREATE INDEX mv_position_returns_symbol_idx
    ON public.mv_position_returns (symbol);

GRANT SELECT ON public.mv_position_returns TO anon, authenticated;

COMMENT ON MATERIALIZED VIEW public.mv_position_returns IS
 'Nightly snapshot of vw_position_returns. Read this from the UI - the view itself recomputes an IRR and a self-counterfactual per position (940ms) and must not sit in a page-load path. Unique index on asset_id allows REFRESH ... CONCURRENTLY.';

CREATE OR REPLACE FUNCTION public.atlas_refresh_position_returns()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- CONCURRENTLY so a page load during the refresh reads the previous
    -- snapshot rather than blocking or seeing an empty table.
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_position_returns;
END;
$$;

COMMENT ON FUNCTION public.atlas_refresh_position_returns() IS
 'Refreshes mv_position_returns concurrently. Called by the nightly chain after prices and transactions have landed.';

-- Nightly refresh. Idempotent: cron.schedule replaces a job of the same name.
SELECT cron.schedule(
    'refresh_position_returns',
    '35 23 * * 1-5',
    $$select public.atlas_refresh_position_returns();$$
);
