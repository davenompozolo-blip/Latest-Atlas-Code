-- B5, step 2. The VaR backtest itself: exception counts, Kupiec unconditional
-- coverage, and predicted vs realised CVaR.
--
-- TWO LEGS, KEPT APART ON PURPOSE. They answer different questions and folding
-- them together would report one failure as the other -- the mistake this
-- codebase has already made in four layers.
--
--   `model` -- the model-implied book return b'x_t over the whole z-complete
--     factor panel (3,370 sessions). The exposures are fixed and the factor
--     realisations are real, so this isolates the DISTRIBUTIONAL assumption:
--     is the Gaussian quantile right for b'x? Large n, so the test has power.
--
--   `book`  -- the realised book return from vw_book_realised_returns over the
--     sessions the panel also covers (~172). This tests the WHOLE CHAIN, and
--     it fails for reasons the model leg cannot see: b'Sigma b carries no
--     idiosyncratic variance at all, and Sigma is a full-history estimate
--     while the test window is whatever the book has lived through.
--
-- Both legs run unconditional and regime-conditional, and the conditional leg
-- assigns each session the vol of ITS OWN published bucket -- read from
-- book_regime_cvar, never re-derived. The point is to backtest the number that
-- was published, not a parallel computation of it that could drift from it.
--
-- `vol_daily` is conf-invariant by construction (E3 stores one vol per bucket
-- and multiplies by the quantile), so the vols are read once per bucket and the
-- quantile is applied here. That is exactly the assumption under test.

create or replace function public.atlas_var_backtest(
  p_conf  numeric default 0.95,
  p_as_of date    default null
)
returns table (
  as_of                   date,
  cvar_as_of              date,
  leg                     text,
  basis                   text,
  axis_key                text,
  conf                    numeric,
  window_start            date,
  window_end              date,
  n_obs                   int,
  exceptions              int,
  var_pred_daily          numeric,
  cvar_pred_daily         numeric,
  cvar_pred_on_exceptions numeric,
  cvar_realised_daily     numeric,
  sd_pred_daily           numeric,
  sd_realised_daily       numeric,
  sd_factor_window        numeric,
  sd_residual_window      numeric,
  kupiec_lr               numeric,
  betas_estimated_at      timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
with
-- Postgres has no inverse normal CDF, so the three quantiles the schema permits
-- are tabulated. The CVaR multiplier phi(z)/(1-c) is DERIVED from that z rather
-- than tabulated beside it, so the two cannot drift apart.
q as (
  select p_conf as conf,
         case p_conf
           when 0.90 then 1.2815515655446004::numeric
           when 0.95 then 1.6448536269514722::numeric
           when 0.99 then 2.3263478740408408::numeric
         end as zq
   -- An unsupported confidence returns NO ROWS rather than resolving to a
   -- neighbour, exactly as atlas_regime_cvar does. A NULL quantile would
   -- silently report zero exceptions, which is a no-op answering 200.
   where p_conf in (0.90, 0.95, 0.99)
),
k as (
  select q.conf, q.zq,
         exp(-(q.zq::double precision ^ 2) / 2.0) / sqrt(2.0 * pi()) / (1 - q.conf::double precision) as cf
    from q
),
snap as (
  select coalesce(p_as_of, (select max(c.as_of) from public.book_regime_cvar c)) as cvar_as_of
),
bet as (
  select max(beta) filter (where factor = 'market')        as bm,
         max(beta) filter (where factor = 'cyclical')      as bc,
         max(beta) filter (where factor = 'concentration') as bk,
         max(beta) filter (where factor = 'dollar')        as bd,
         max(beta) filter (where factor = 'alpha')         as a0,
         max(estimated_at)                                 as bea
    from public.book_factor_betas
   where estimated_at = (select max(estimated_at) from public.book_factor_betas)
),
panel as (
  select f.date, f.market, f.cyclical, f.concentration, f.dollar,
         f.z_cyclical, f.z_concentration, f.z_dollar
    from public.vw_factor_return_panel f
   where f.complete_z
),
model as (
  select p.date,
         bet.bm * p.market + bet.bc * p.cyclical + bet.bk * p.concentration + bet.bd * p.dollar as r
    from panel p cross join bet
),
-- One vol per (axis, bucket) for the snapshot under test. Grouping collapses
-- the conf rows, which carry the identical vol.
vols as (
  select c.axis_key, c.bucket, max(c.vol_daily) as vol, max(c.z_hi) as z_hi
    from public.book_regime_cvar c, snap s
   where c.as_of = s.cvar_as_of and c.bucket > 0
   group by c.axis_key, c.bucket
),
uvol as (
  select max(c.vol_daily) as vol
    from public.book_regime_cvar c, snap s
   where c.as_of = s.cvar_as_of and c.bucket = 0
),
zlong as (
  select date, 'cyclical'::text      as ax, z_cyclical      as z from panel
  union all
  select date, 'concentration'::text as ax, z_concentration as z from panel
  union all
  select date, 'dollar'::text        as ax, z_dollar        as z from panel
),
-- Lowest bucket whose upper edge still contains z; a z above every edge falls
-- to the top bucket. The quartile edges do not tile the line exactly (bucket 2
-- opens a hair above bucket 1 closes), so a future session can land between
-- them -- it must not fall out of the sample.
assigned as (
  select zl.date, zl.ax,
         coalesce(
           (select v.vol from vols v
             where v.axis_key = zl.ax and zl.z <= v.z_hi
             order by v.bucket limit 1),
           (select v.vol from vols v
             where v.axis_key = zl.ax
             order by v.bucket desc limit 1)
         ) as vol
    from zlong zl
),
bookret as (
  select b.session_date as date, b.log_return as r
    from public.vw_book_realised_returns b
   where b.usable
),
-- Both book legs are scoped to the sessions the panel also covers, so the
-- conditional and unconditional book rows share one denominator.
bookpanel as (
  select br.date, br.r from bookret br join panel p on p.date = br.date
),
decomp as (
  select stddev_samp(m.r)                       as sd_factor,
         stddev_samp(bp.r - bet.a0 - m.r)       as sd_resid
    from bookpanel bp
    join model m on m.date = bp.date
   cross join bet
),
obs as (
  select 'model'::text as leg, 'unconditional'::text as basis, null::text as axis_key,
         m.date, m.r as ret, u.vol
    from model m cross join uvol u
  union all
  select 'model', 'regime_conditional', a.ax, m.date, m.r, a.vol
    from model m join assigned a on a.date = m.date
  union all
  select 'book', 'unconditional', null, bp.date, bp.r, u.vol
    from bookpanel bp cross join uvol u
  union all
  select 'book', 'regime_conditional', a.ax, bp.date, bp.r, a.vol
    from bookpanel bp join assigned a on a.date = bp.date
),
agg as (
  select o.leg, o.basis, o.axis_key,
         min(o.date) as window_start,
         max(o.date) as window_end,
         count(*)::int as n_obs,
         count(*) filter (where o.ret < -(k.zq * o.vol))::int as exceptions,
         avg(k.zq * o.vol)::numeric  as var_pred_daily,
         avg(k.cf * o.vol)::numeric  as cvar_pred_daily,
         avg(k.cf * o.vol) filter (where o.ret < -(k.zq * o.vol))::numeric as cvar_pred_on_exceptions,
         avg(-o.ret)       filter (where o.ret < -(k.zq * o.vol))::numeric as cvar_realised_daily,
         sqrt(avg(o.vol * o.vol))::numeric as sd_pred_daily,
         stddev_samp(o.ret)::numeric       as sd_realised_daily
    from obs o cross join k
   group by o.leg, o.basis, o.axis_key
)
select (select max(p.date) from panel p)          as as_of,
       (select s.cvar_as_of from snap s)          as cvar_as_of,
       a.leg, a.basis, a.axis_key, p_conf         as conf,
       a.window_start, a.window_end, a.n_obs, a.exceptions,
       round(a.var_pred_daily, 10),
       round(a.cvar_pred_daily, 10),
       round(a.cvar_pred_on_exceptions, 10),
       round(a.cvar_realised_daily, 10),
       round(a.sd_pred_daily, 10),
       round(a.sd_realised_daily, 10),
       case when a.leg = 'book' then round(d.sd_factor::numeric, 10) end,
       case when a.leg = 'book' then round(d.sd_resid::numeric, 10)  end,
       -- Kupiec unconditional coverage. 0*ln(0) is 0 in the limit and NaN in
       -- floating point, so both saturated cases are written out rather than
       -- left to the arithmetic.
       round((2 * (
           case when a.exceptions = 0 then 0
                else a.exceptions * ln((a.exceptions::numeric / a.n_obs) / (1 - p_conf)) end
         + case when a.exceptions = a.n_obs then 0
                else (a.n_obs - a.exceptions) * ln((1 - a.exceptions::numeric / a.n_obs) / p_conf) end
       ))::numeric, 10) as kupiec_lr,
       (select bet.bea from bet) as betas_estimated_at
  from agg a cross join decomp d
 order by a.leg desc, a.basis, a.axis_key nulls first;
$fn$;

comment on function public.atlas_var_backtest(numeric, date) is
  'Kupiec unconditional-coverage backtest of the E3 parametric VaR. Two legs kept apart: `model` tests the Gaussian assumption on b''x over the full factor panel; `book` tests the whole chain on realised equity returns. Conditional rows read each session''s own published bucket vol from book_regime_cvar rather than re-deriving the buckets.';

revoke execute on function public.atlas_var_backtest(numeric, date) from public, anon, authenticated;
