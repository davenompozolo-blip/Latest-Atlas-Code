-- F-3 (F2 section 1 addition): the tail-shape panel needs the distribution the
-- three exception counts describe -- "a body taller and narrower than the normal
-- with heavier tails is one picture and three numbers, and the picture is what
-- makes 'one defect, not three results' legible".
--
-- WHY A VIEW AND NOT A CLIENT FETCH. The model leg is 3,370 sessions. PostgREST
-- caps at 1,000 rows whatever limit says -- recorded in CLAUDE.md three times,
-- most recently emptying the Regime Slicer -- so paging the raw series would be
-- a fourth instance waiting to happen, and F2 section 1 says to bin from the
-- stored series rather than recompute client-side. Binning here returns ~70 rows
-- and the cap is never in play.
--
-- THE MODEL SERIES IS NOT REDEFINED HERE. b'x is lifted verbatim from
-- atlas_var_backtest's `model` CTE: the same four betas at the same
-- max(estimated_at), over vw_factor_return_panel where complete_z. A second
-- definition of the series the panel is grading is exactly how two copies drift
-- apart while both look right. Verified rather than assumed: this reconstruction
-- returns n = 3,370 with 56 observations below -2.3263 sigma and a standardised
-- sd of 0.9997, reproducing the stored run's n_obs, exceptions at 99% and
-- sd_realised/sd_pred to four decimals.
--
-- STANDARDISED BY THE UNCONDITIONAL VOL, which is what puts the three VaR
-- thresholds at exactly -1.2816 / -1.6449 / -2.3263 on this axis. They are
-- Gaussian quantiles, so the client marks them as constants and does NOT
-- recompute VaR -- there is no arithmetic on the client that could disagree with
-- the backtest.
--
-- BINS COVER THE OBSERVED RANGE AND ARE NEVER CLAMPED. The series runs -8.99 to
-- +7.88 and three observations sit beyond 6 sigma. Clamping them into an edge
-- bin would compress the exact evidence the panel exists to show. Bin width is
-- 0.25 sigma.
--
-- PROVENANCE IS PUBLISHED so the surface can prove it is describing the run it
-- is rendering beside. If the nightly job writes a row and the betas are
-- re-estimated afterwards, this view moves and var_backtest_runs does not;
-- betas_estimated_at and cvar_as_of let the panel state that rather than quietly
-- drawing one vintage under another's numbers.

create or replace view public.vw_var_backtest_distribution as
with bet as (
  select max(beta) filter (where factor = 'market')        as bm,
         max(beta) filter (where factor = 'cyclical')      as bc,
         max(beta) filter (where factor = 'concentration') as bk,
         max(beta) filter (where factor = 'dollar')        as bd,
         max(estimated_at)                                 as bea
    from public.book_factor_betas
   where estimated_at = (select max(estimated_at) from public.book_factor_betas)
),
snap as (
  select max(as_of) as cvar_as_of from public.book_regime_cvar
),
uvol as (
  select max(c.vol_daily) as vol
    from public.book_regime_cvar c, snap s
   where c.as_of = s.cvar_as_of and c.bucket = 0
),
z as (
  select f.date,
         (bet.bm * f.market + bet.bc * f.cyclical
          + bet.bk * f.concentration + bet.bd * f.dollar) / u.vol as zz
    from public.vw_factor_return_panel f
   cross join bet
   cross join uvol u
   where f.complete_z
     and u.vol > 0
),
tot as (
  select count(*)::int as n_obs, min(zz) as z_min, max(zz) as z_max,
         floor(min(zz) / 0.25)::int as idx_lo,
         floor(max(zz) / 0.25)::int as idx_hi
    from z
),
binned as (
  select floor(zz / 0.25)::int as idx, count(*)::int as obs
    from z group by 1
),
-- Empty bins must come back as zero rows, not be absent. group by alone
-- returned 41 of 68 bins, and a histogram rendered from a series with holes in
-- it misstates the shape -- which is the one thing this panel exists to show.
grid as (
  select g.idx from tot t, generate_series(t.idx_lo, t.idx_hi) as g(idx)
)
select (g.idx * 0.25)::numeric           as bin_lo,
       ((g.idx + 1) * 0.25)::numeric     as bin_hi,
       (g.idx * 0.25 + 0.125)::numeric   as bin_mid,
       coalesce(b.obs, 0)                as obs,
       t.n_obs,
       round(t.z_min::numeric, 4)        as z_min,
       round(t.z_max::numeric, 4)        as z_max,
       (select bea from bet)             as betas_estimated_at,
       (select cvar_as_of from snap)     as cvar_as_of
  from grid g
  cross join tot t
  left join binned b on b.idx = g.idx
 order by g.idx;

comment on view public.vw_var_backtest_distribution is
'F-3 / B5 tail shape. Model-leg return b''x standardised by the unconditional '
'daily vol, binned at 0.25 sigma. b''x is lifted verbatim from '
'atlas_var_backtest''s model CTE so the panel and the backtest cannot drift. '
'Standardising by sd_pred puts the 90/95/99 VaR thresholds at exactly '
'-1.2816/-1.6449/-2.3263, so the client marks constants and never recomputes '
'VaR. Bins cover the full observed range; outliers past 6 sigma are the finding '
'and are never clamped.';

revoke all on public.vw_var_backtest_distribution from public;
grant select on public.vw_var_backtest_distribution to anon, authenticated, service_role;
