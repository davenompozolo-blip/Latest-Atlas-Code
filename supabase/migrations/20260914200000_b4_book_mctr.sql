-- B4, part 1 of 2. A marginal risk contribution that is actually marginal.
--
-- WHAT WAS THERE. `vw_risk_analysis.marginal_vol_contribution` is
-- `weight * annual_vol` -- the position's own standalone volatility scaled by
-- its weight, with NO covariance anywhere in it. That is a share of the
-- UNDIVERSIFIED sum, not a marginal contribution: it cannot tell you that
-- adding to a name which offsets the rest of the book lowers portfolio risk,
-- because nothing in it knows what the rest of the book is.
--
-- A marginal contribution is the partial derivative of portfolio vol with
-- respect to the position's weight:
--
--     MCTR_i = d(sigma_p)/d(w_i) = (Sigma w)_i / sigma_p
--     RC_i   = w_i * MCTR_i          (Euler: SUM RC_i = sigma_p exactly)
--
-- Euler additivity is the whole point -- it is what lets any grouping of
-- positions sum to the book total, which is what B4 and the segment layer both
-- need, and what a standalone-vol share can never provide.
--
-- BASIS, and why every piece of it is on the same window. Sigma = D R D with
-- R from `universe_correlations` (plain Pearson over its own 120-session
-- window) and D the sample sd over THE SAME 120 sessions, taken from SPY's own
-- bars rather than a calendar. The existing view mixes a 252-day vol with
-- nothing; pairing a 252-day vol with a 120-day correlation would be the
-- mixed-basis failure this codebase has now caught six times.
--
-- `correlation`, NOT `correlation_simple`, is the wrong choice here and is
-- deliberately not used: `correlation` is EWMA-weighted at lambda 0.97, so its
-- effective sample is ~33 sessions and it reaches +/-0.9997 on this book. A
-- pairwise EWMA matrix paired with a 120-day sample vol is neither internally
-- consistent nor reliably positive semi-definite.
--
-- COVERAGE IS PUBLISHED, NEVER SILENTLY RENORMALISED AWAY. Two held names
-- (IXC, KMTUY) are absent from the correlation matrix because their feeds are
-- dark, and three are dust (quantity ~2e-5, market value under half a cent).
-- Weights renormalise over what IS measured and `withheld_weight_pct` says how
-- much did not make it, so a reader can see the denominator rather than assume
-- it was the book.

create or replace view public.vw_book_mctr as
with mat as (
  select max(as_of_date) as d from public.universe_correlations
), win as (
  -- LIMIT 1, not DISTINCT. The window is one value for the whole snapshot, and
  -- asking for it with DISTINCT scans all 87,570 rows of that day's matrix to
  -- learn the number 120 -- 912 ms of a 2.8 s run, spent on a constant.
  select m.d,
         (select u.window_days from public.universe_correlations u
           where u.as_of_date = m.d limit 1) as w
    from mat m
), held as (
  select a.symbol, p.asset_id, p.market_value
    from public.positions p
    join public.assets a on a.id = p.asset_id
   where p.as_of_date = (select max(as_of_date) from public.positions)
     and p.quantity is not null and p.quantity <> 0
     -- Dust: a position sold down to ~2e-5 shares is not a risk position.
     and (p.market_value is null or abs(p.market_value) > 0.01)
     and not (a.asset_class = any(array['option','us_option'])
              and a.symbol ~ '^[A-Z.]{1,6}[0-9]{6}[CP][0-9]{8}$'
              and to_date(substring(a.symbol,'([0-9]{6})[CP]'),'YYMMDD') < current_date)
), sess as (
  -- The session spine is SPY's own bars, never a calendar: a weekday feed is
  -- not late on a holiday, and a name with a gap must not shift the window.
  select ph.price_date
    from public.price_history ph, win
   where ph.interval = '1d'
     and ph.asset_id = (select id from public.assets where symbol = 'SPY' limit 1)
     and ph.price_date <= win.d
   group by ph.price_date
   order by ph.price_date desc
   limit (select w from win)
), rets as (
  select h.symbol,
         ph.close / lag(ph.close) over (partition by h.symbol order by ph.price_date) - 1 as r
    from held h
    join public.price_history ph
      on ph.asset_id = h.asset_id and ph.interval = '1d'
   where ph.price_date in (select price_date from sess)
), vol as (
  select symbol, stddev_samp(r) as sd, count(*) as obs
    from rets where r is not null group by symbol
), covsym as (
  select distinct u.symbol_1 as s from public.universe_correlations u, mat where u.as_of_date = mat.d
  union
  select distinct u.symbol_2     from public.universe_correlations u, mat where u.as_of_date = mat.d
), classified as (
  select h.symbol, h.market_value, v.sd, v.obs,
         case when h.symbol not in (select s from covsym) then 'absent_from_matrix'
              when v.sd is null                           then 'no_return_history'
              when v.sd = 0                               then 'zero_variance'
         end as withheld_reason
    from held h left join vol v on v.symbol = h.symbol
), wts as (
  select symbol, sd, market_value,
         market_value / sum(market_value) over () as w
    from classified where withheld_reason is null
), rsym as materialized (
  -- The stored matrix is a strict lower triangle with no diagonal, so it is
  -- symmetrised and given a unit diagonal here. Without the diagonal a
  -- position's own variance drops out of its contribution entirely.
  --
  -- BOTH LEGS ARE FILTERED TO THE HELD SET, and that is not cosmetic. The
  -- matrix is a ~420-name universe: unfiltered, symmetrising it materialises
  -- 175,140 rows and the planner rescans them per position, which measured
  -- 10.2 s against anon's 3 s cap. Filtered it is 3,721 rows. Same lesson as
  -- every view over price_history in this file -- bound the shared table to
  -- the rows you will actually return.
  select u.symbol_1 as a, u.symbol_2 as b, u.correlation_simple as rho
    from public.universe_correlations u, mat
   where u.as_of_date = mat.d
     and u.symbol_1 in (select symbol from wts)
     and u.symbol_2 in (select symbol from wts)
  union all
  select u.symbol_2, u.symbol_1, u.correlation_simple
    from public.universe_correlations u, mat
   where u.as_of_date = mat.d
     and u.symbol_1 in (select symbol from wts)
     and u.symbol_2 in (select symbol from wts)
  union all
  select symbol, symbol, 1.0 from wts
), sigw as materialized (
  select x.symbol, x.w, x.sd, x.market_value, x.obs_,
         x.sd * sum(r.rho * y.sd * y.w) as sigma_w
    from (select w_.*, (select obs from vol where vol.symbol = w_.symbol) obs_ from wts w_) x
    join rsym r on r.a = x.symbol
    join wts  y on y.symbol = r.b
   group by x.symbol, x.w, x.sd, x.market_value, x.obs_
), pv as (
  select sum(w * sigma_w) as var_daily, count(*) as n_measured,
         sum(market_value) as measured_mv
    from sigw
), allmv as (
  select sum(market_value) as total_mv, count(*) as n_positions from classified
)
select
  s.symbol,
  s.market_value,
  s.w                                             as weight,
  (s.sd * sqrt(252::double precision))             as vol_annual,
  s.obs_                                           as obs,
  -- Marginal: the derivative itself, per unit of weight.
  (s.sigma_w / nullif(sqrt(pv.var_daily),0) * sqrt(252::double precision))
                                                   as mctr_annual,
  -- Contribution: weight x marginal. These sum to book vol, by Euler.
  (s.w * s.sigma_w / nullif(sqrt(pv.var_daily),0) * sqrt(252::double precision))
                                                   as risk_contribution_annual,
  (s.w * s.sigma_w / nullif(pv.var_daily,0))       as risk_share,
  rank() over (order by s.w * s.sigma_w desc)      as risk_rank,
  (sqrt(pv.var_daily) * sqrt(252::double precision))                  as book_vol_annual,
  (select sum(w * sd) * sqrt(252::double precision) from sigw)        as undiversified_vol_annual,
  pv.n_measured,
  (allmv.n_positions - pv.n_measured)                                 as n_withheld,
  (100.0 * (allmv.total_mv - pv.measured_mv) / nullif(allmv.total_mv,0)) as withheld_weight_pct,
  (select d from mat)                              as matrix_as_of,
  (select w from win)                              as window_days
from sigw s cross join pv cross join allmv;

comment on view public.vw_book_mctr is
  'Euler-additive marginal risk contribution per held position. Sigma = D R D over universe_correlations (plain Pearson) and sample sd on the SAME 120-session window. SUM(risk_contribution_annual) = book_vol_annual exactly; SUM(risk_share) = 1. Not to be confused with vw_risk_analysis.marginal_vol_contribution, which is weight x standalone vol and carries no covariance.';
