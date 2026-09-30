-- I-1d: validation must grade the night it runs in.
--
-- First live chain night (2026-09-28). Every stage ran once, none blocked, and
-- the verdict chain finished at 22:21 -- an hour and twenty minutes earlier
-- than the clock put it. That is the regression. `run_validation` depends only
-- on `write_segment_verdicts`, so it fired at 22:21:25, BEFORE
-- `sync_market_series` (22:50), `options_snapshot` (23:00),
-- `load_macro_series` (23:05) and the factor / regime-CVaR / backtest stages.
-- It graded `feed_coverage` and `feed_reconciliation` on the previous night's
-- writes -- the defect the 2026-08-16 move from 22:40 to 23:40 was made to
-- close, reintroduced by completion-chaining.
--
-- A stage carries one dependency, so the other half of the ordering is a
-- floor. The latest-firing feeds sit on external floors of 23:00 and 23:05 and
-- finished by 23:05:07 on the first live night; 23:15 clears them with margin.
-- The verdict dependency is kept, so a slow trade-sync night still cannot
-- validate before verdicts are written. `log_universe_price_coverage` follows
-- validation and moves with it.

do $$
begin
  update public.atlas_chain_stages
     set not_before = time '23:15'
   where stage = 'run_validation'
     and depends_on = 'write_segment_verdicts'
     and not_before is null;
  if not found then
    raise exception 'I-1d: run_validation not in the expected shape; refusing';
  end if;
end $$;
