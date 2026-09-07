-- ============================================================
-- The segment aggregation joins the nightly chain
-- ------------------------------------------------------------
-- 23:35 refresh_position_returns
-- 23:37 atlas_write_verdicts          <- supplies verdict_counts
-- 23:38 atlas_write_segment_verdicts  <- this
-- 23:40 atlas_run_validation
--
-- Gated by ordering rather than by a lock, like the rest of the chain: the
-- job measures 1,561 ms against a two-minute gap, and it holds the same
-- preflight the position job does, so a night where the book is stale
-- refuses at both stages instead of leaving level 2 populated and level 3
-- empty for that date.
--
-- Mon-Fri to match atlas_write_verdicts. pg_cron is the only scheduler --
-- do not add this to Vercel Cron or GitHub Actions.
-- ============================================================

SELECT cron.schedule(
    'atlas_write_segment_verdicts',
    '38 23 * * 1-5',
    $$select public.atlas_write_segment_verdicts();$$
);
