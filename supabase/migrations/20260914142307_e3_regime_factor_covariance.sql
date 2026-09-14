-- E3 / B2, step 2. Regime-bucketed factor covariance with Ledoit-Wolf shrinkage.
--
-- THE DESIGN, and the two decisions that are not obvious.
--
-- 1. SHRINK THE CORRELATION MATRIX, NOT THE COVARIANCE. Ledoit-Wolf's usual
--    target is a scaled identity, which assumes the variables are commensurate.
--    These are not: SPY log returns have sd ~0.011 and the axis scores ~1.1-1.7,
--    a factor of ~150. Run on the raw covariance the intensity is dominated by
--    the axis-axis pairs purely because they are the largest in absolute size --
--    and those pairs are near-zero BY CONSTRUCTION, because the axes are PCA
--    components. Measured: delta-hat came out at 1123 / 308 / 211 / 109 across
--    the four concentration buckets, i.e. clipped to 1, which would zero every
--    off-diagonal including market-concentration at rho = +0.45.
--    Standardising first puts every pair on the same footing. Intensities then
--    land at 0.023 / 0.038 / 0.037 / 0.074 -- small, as expected at N=4 and
--    T~842, and the market-axis structure survives.
--
--    A scalar shrinkage cannot serve a factor set that is deliberately
--    orthogonal in one block and correlated in another. The correlation scale is
--    what makes one intensity defensible across both.
--
-- 2. BUCKET ON score_20d_z, NEVER score_20d. Recorded twice already in this
--    codebase: score_20d is a rolling 20-session SUM whose sd runs 4.19-8.22,
--    not a sigma level. A bucket edge defined on the sum would mean something
--    different in 2013 and in 2026. The cost is history -- z starts 2013-04-22
--    (3,369 sessions) against 2010-04-05 for the raw scores (4,136) -- and it is
--    worth paying.
--
-- THE SPEC'S ARITHMETIC IS WRONG AND IS NOT REPRODUCED HERE. Master spec section 6
-- E3 says "2007 onward, ~4,800 sessions... four buckets gives ~1,200 sessions
-- each". The axis history begins 2010-04-05 and the z history 2013-04-22, so
-- four buckets give ~842 each. Still comfortably clear of the 250 floor the
-- spec sets, so nothing is blocked -- but the figure is corrected, not quoted.
--
-- Bucket 0 is the UNCONDITIONAL row and is computed over THE SAME sample as the
-- buckets. A comparison against an unconditional figure drawn from a longer
-- window would be measuring the window, not the regime.

create or replace function public.atlas_regime_factor_cov(
  p_axis_key text,
  p_buckets  int default 4,
  p_min_obs  int default 250
)
returns table (
  bucket      int,
  n_obs       int,
  z_lo        numeric,
  z_hi        numeric,
  lw_delta    numeric,
  factor_i    text,
  factor_j    text,
  corr_sample numeric,
  cov_sample  numeric,
  cov_shrunk  numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  with src as (
    select p.date,
           p.market, p.cyclical, p.concentration, p.dollar,
           case p_axis_key
             when 'cyclical'      then p.z_cyclical
             when 'concentration' then p.z_concentration
             when 'dollar'        then p.z_dollar
           end as zval
    from public.vw_factor_return_panel p
    where p.complete_z
  ),
  -- ntile splits near-equally, so a bucket lands under the floor only when the
  -- sample cannot support the requested count. Reducing the count is the
  -- "merge it and say so" the spec asks for, and the count comes back on every
  -- row so the merge is never silent.
  n_eff as (
    select greatest(1, least(p_buckets, (count(*) / nullif(p_min_obs,0))::int)) as k
    from src
  ),
  bucketed as (
    select s.*, ntile((select k from n_eff)) over (order by s.zval, s.date) as bkt
    from src s
  ),
  -- bucket 0 duplicates every row as the unconditional comparison, on the
  -- identical sample.
  dup as (
    select date, market, cyclical, concentration, dollar, zval, bkt from bucketed
    union all
    select date, market, cyclical, concentration, dollar, zval, 0 from bucketed
  ),
  long as (
    select d.date, d.bkt, d.zval, t.f, t.v
    from dup d,
    lateral (values ('market',d.market),('cyclical',d.cyclical),
                    ('concentration',d.concentration),('dollar',d.dollar)) t(f,v)
  ),
  stats as (
    select bkt, f, count(*)::numeric as t, avg(v) as mu, stddev_samp(v) as sd
    from long group by bkt, f
  ),
  span as (
    select bkt, count(*)::int as n_obs, min(zval) as z_lo, max(zval) as z_hi
    from dup group by bkt
  ),
  std as (
    select l.date, l.bkt, l.f, (l.v - s.mu) / nullif(s.sd,0) as u
    from long l join stats s on s.bkt = l.bkt and s.f = l.f
  ),
  prod as (
    select a.bkt, a.f as fi, c.f as fj, a.date, a.u * c.u as p
    from std a join std c on c.date = a.date and c.bkt = a.bkt
  ),
  rho as (
    select bkt, fi, fj, count(*)::numeric as t, avg(p) as r
    from prod group by bkt, fi, fj
  ),
  pivar as (
    select p.bkt, p.fi, p.fj, avg((p.p - r.r)^2) as pi_ij
    from prod p join rho r on r.bkt=p.bkt and r.fi=p.fi and r.fj=p.fj
    group by p.bkt, p.fi, p.fj
  ),
  delta as (
    select r.bkt,
           least(1, greatest(0,
             (sum(v.pi_ij) filter (where r.fi <> r.fj) / max(r.t))
             / nullif(sum(r.r * r.r) filter (where r.fi <> r.fj), 0)
           )) as d
    from rho r join pivar v on v.bkt=r.bkt and v.fi=r.fi and v.fj=r.fj
    group by r.bkt
  )
  select r.bkt::int,
         sp.n_obs,
         sp.z_lo, sp.z_hi,
         round(dl.d::numeric, 8),
         r.fi, r.fj,
         round(r.r::numeric, 8),
         round((r.r * si.sd * sj.sd)::numeric, 14),
         round(((case when r.fi = r.fj then r.r else r.r * (1 - dl.d) end)
                * si.sd * sj.sd)::numeric, 14)
  from rho r
  join delta dl on dl.bkt = r.bkt
  join span  sp on sp.bkt = r.bkt
  join stats si on si.bkt = r.bkt and si.f = r.fi
  join stats sj on sj.bkt = r.bkt and sj.f = r.fj
  order by r.bkt, r.fi, r.fj;
$fn$;

comment on function public.atlas_regime_factor_cov(text,int,int) is
  'Factor covariance per regime bucket, bucketed on score_20d_z quartiles of the named axis. Ledoit-Wolf shrinkage is applied on the CORRELATION scale -- on the raw covariance the intensity is dominated by the near-zero axis-axis pairs and clips to 1. Bucket 0 is the unconditional row over the identical sample. Returns both sample and shrunk covariance; E4 consumes the shrunk one.';

revoke execute on function public.atlas_regime_factor_cov(text,int,int) from public, anon, authenticated;
