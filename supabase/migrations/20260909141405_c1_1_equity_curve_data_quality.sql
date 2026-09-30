-- C1.1. Mark stale provider snapshots in portfolio_equity_curve. Do not delete.
--
-- Deleting would hide the defect and change row counts other modules depend on.
-- The flag is the fix; consumers filter on it.
--
-- THE SIGNATURE IS NOT WHAT THE BRIEF DESCRIBED, and the difference matters.
-- The brief expected rows bit-identical to their predecessor across all four
-- numeric columns. Exactly one row in the table matches that (id 2,
-- 2025-12-26) and it is NOT a defect: the account was funded at 100,000.00 and
-- not yet deployed, so 2025-12-24 and 2025-12-26 are both genuinely flat.
--
-- The real defect looks different. `profit_loss` here is the DAILY change in
-- equity, not a cumulative figure (2026-07-28: equity 92,517.32 against the
-- prior 94,279.86 gives exactly the -1,762.54 recorded). On the three affected
-- rows the equity is carried forward and profit_loss / profit_loss_pct are
-- therefore 0.00 -- which is arithmetically CONSISTENT with the carried level.
-- The row is internally coherent and factually false, so no cross-column check
-- inside the row can catch it. That is why it survived.
--
-- What identifies it is the transition: a deployed book that moved the day
-- before, reporting a change of exactly zero to the cent. That is not a market
-- outcome. Hence the third predicate below, which is also what excludes the
-- legitimate pre-deployment flat, where the prior day's change was also zero.
--
-- Note the downstream reach: the FOLLOWING row's profit_loss is computed by the
-- provider against the stale level, so 2026-07-30's +2,488.02 is a two-day move
-- reported as one day's. Consumers of profit_loss must therefore treat the row
-- after a stale_snapshot with the same suspicion as the row itself.

alter table public.portfolio_equity_curve
  add column data_quality text not null default 'settled';

alter table public.portfolio_equity_curve
  add constraint portfolio_equity_curve_data_quality_ck
  check (data_quality in ('settled','stale_snapshot','recovered','unknown'));

with flagged as (
  select id
  from (
    select id,
           equity, profit_loss,
           lag(equity)      over w as p_equity,
           lag(profit_loss) over w as p_pl
    from public.portfolio_equity_curve
    window w as (partition by portfolio_id, timeframe order by ts)
  ) s
  where equity   is not distinct from p_equity   -- level carried forward
    and profit_loss = 0                          -- and the day's change zeroed
    and p_pl is distinct from 0                  -- off a day that did move
)
update public.portfolio_equity_curve c
   set data_quality = 'stale_snapshot'
  from flagged f
 where c.id = f.id;

comment on column public.portfolio_equity_curve.data_quality is
  'settled = the provider settled this level. stale_snapshot = the level was carried forward from the prior session and the day''s change reported as zero; not a real observation, exclude from return series. recovered = the level was reconstructed from another source (record the derivation before using this value). unknown = provenance not established.';
