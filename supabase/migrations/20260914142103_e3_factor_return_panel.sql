-- E3 / B2, step 1. The factor return panel the book's betas were fitted against.
--
-- WHY THIS EXISTS AS AN OBJECT. `book_factor_betas` holds exposures but B0 and
-- C3 both computed their regressors OUTSIDE the database and inserted only the
-- coefficients. So the panel the betas mean anything against was, until now,
-- not reconstructible from the schema -- and E3 multiplies those exposures by a
-- covariance that MUST be in the same units or the product is meaningless.
--
-- The construction is pinned by reproduction, not by assumption:
--   market = SPY **adj_close** log returns (C3 established adj_close, not
--            close; the two differ on ~4 dividend dates and `close` gives
--            market 0.967 against the published 1.026)
--   axes   = the raw daily `factor_axis_scores.score`, NOT score_20d and NOT
--            score_20d_z -- the cumulative columns are sums over a window and
--            were never the regressor.
--
-- PROOF, run on the C3 sample (2025-12-26..2026-09-04, both endpoints settled,
-- n = 168 exactly):
--     var(b . x) / var(book return) = 0.778109717
--     stored C3 r_squared           = 0.778109716915
-- Agreement to 9 dp on a quantity neither side was fitted to. If the panel were
-- in different units, or used `close`, or used a cumulative score column, this
-- identity would not hold.
--
-- `z_*` carries score_20d_z alongside, because E3 buckets on the SIGMA LEVEL
-- and this file already records twice that score_20d is a rolling SUM whose sd
-- runs 4.19-8.22, not a sigma level. Bucketing on the sum would make a bucket
-- edge mean different things in 2013 and 2026.

create or replace view public.vw_factor_return_panel as
with spy as (
  select date,
         ln(adj_close / lag(adj_close) over (order by date)) as market
  from public.market_prices
  where symbol = 'SPY' and adj_close > 0
),
axes as (
  select date,
         max(score) filter (where axis_key = 'cyclical')      as cyclical,
         max(score) filter (where axis_key = 'concentration') as concentration,
         max(score) filter (where axis_key = 'dollar')        as dollar,
         max(score_20d_z) filter (where axis_key = 'cyclical')      as z_cyclical,
         max(score_20d_z) filter (where axis_key = 'concentration') as z_concentration,
         max(score_20d_z) filter (where axis_key = 'dollar')        as z_dollar
  from public.factor_axis_scores
  group by date
)
select a.date,
       s.market,
       a.cyclical, a.concentration, a.dollar,
       a.z_cyclical, a.z_concentration, a.z_dollar,
       (s.market is not null
        and a.cyclical is not null and a.concentration is not null and a.dollar is not null)
         as complete_scores,
       (s.market is not null
        and a.z_cyclical is not null and a.z_concentration is not null and a.z_dollar is not null)
         as complete_z
from axes a
join spy s on s.date = a.date;

comment on view public.vw_factor_return_panel is
  'Daily panel of the four factors book_factor_betas is estimated against: SPY adj_close log return plus the three raw daily axis scores. Verified against C3 by reproducing its stored r_squared to 9 dp. complete_scores marks rows usable for covariance; complete_z marks rows usable for bucketing (z starts 2013-04-22, scores 2010-04-05).';
