-- E3 / B2, step 3. Stressed CVaR per regime bucket.
--
-- Stressed vol = sqrt(b' Sigma_bucket b), where b is the book's factor exposure
-- from book_factor_betas (alpha excluded -- it is an intercept, not an exposure)
-- and Sigma_bucket is the shrunk covariance from atlas_regime_factor_cov.
--
-- WHY THIS IS SOUND WHERE SLICING THE BOOK'S OWN RETURNS IS NOT. The book has
-- 168 usable daily returns. Quartered, that is ~42 observations and a 95% CVaR
-- becomes an average over two days. The FACTORS have 3,369. So the exposures
-- come from the short sample -- which is what a 4-parameter regression can
-- support -- and the covariance from the long one. The portfolio is young; the
-- factors are not.
--
-- THE DISTRIBUTIONAL ASSUMPTION IS EXPLICIT AND IS NOT MEASURED. b'Sigma b
-- yields a variance, nothing more. Turning that into VaR and CVaR needs a
-- distribution, and Gaussian is assumed here:
--     VaR_q  = z_q * sigma
--     CVaR_q = phi(z_q)/(1-q) * sigma
-- At q=0.95 those are 1.6449 and 2.0627. Daily factor returns are fatter-tailed
-- than Gaussian, so THESE FIGURES UNDERSTATE THE TAIL and are labelled as a
-- parametric-Gaussian reading rather than an empirical one. The Student-t
-- alternative the master spec prefers over Cornish-Fisher is the natural next
-- step and is deliberately not smuggled in here.
--
-- `vol_ratio_vs_unconditional` is the headline: how much more (or less) risk the
-- same book carries in this regime than on the full sample. It is a property of
-- the covariance alone -- the exposures are identical across buckets -- so it
-- isolates the regime effect from the position of the book.

create or replace function public.atlas_regime_cvar(
  p_axis_key text,
  p_buckets  int     default 4,
  p_conf     numeric default 0.95,
  p_min_obs  int     default 250
)
returns table (
  axis_key       text,
  bucket         int,
  bucket_label   text,
  n_obs          int,
  z_lo           numeric,
  z_hi           numeric,
  lw_delta       numeric,
  betas_estimated_at timestamptz,
  vol_daily      numeric,
  vol_annual     numeric,
  var_daily      numeric,
  cvar_daily     numeric,
  vol_ratio_vs_unconditional numeric,
  vol_daily_unshrunk numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  with betas as (
    select factor, beta,
           (select max(estimated_at) from public.book_factor_betas) as est_at
    from public.book_factor_betas
    where estimated_at = (select max(estimated_at) from public.book_factor_betas)
      and factor <> 'alpha'
  ),
  cv as (
    select * from public.atlas_regime_factor_cov(p_axis_key, p_buckets, p_min_obs)
  ),
  q as (
    select c.bucket, max(c.n_obs) as n_obs, max(c.z_lo) as z_lo, max(c.z_hi) as z_hi,
           max(c.lw_delta) as lw_delta,
           sum(bi.beta * bj.beta * c.cov_shrunk) as vq,
           sum(bi.beta * bj.beta * c.cov_sample) as vq_raw
    from cv c
    join betas bi on bi.factor = c.factor_i
    join betas bj on bj.factor = c.factor_j
    group by c.bucket
  ),
  base as (select vq from q where bucket = 0),
  -- z_q and phi(z_q)/(1-q) for the Gaussian reading. Kept as a lookup rather
  -- than a normal-quantile implementation: three confidence levels are all this
  -- surface needs, and an unlisted one must fail loudly rather than silently
  -- resolve to a neighbour.
  k as (
    select * from (values
      (0.90::numeric, 1.2815515655::numeric, 1.7549833193::numeric),
      (0.95::numeric, 1.6448536270::numeric, 2.0627128054::numeric),
      (0.99::numeric, 2.3263478740::numeric, 2.6652142817::numeric)
    ) v(conf, z_q, es_mult)
    where v.conf = p_conf
  )
  select p_axis_key,
         q.bucket::int,
         case when q.bucket = 0 then 'unconditional'
              else 'q' || q.bucket || ' of ' || (select count(*)-1 from q) ||
                   ' (z ' || round(q.z_lo,2) || ' .. ' || round(q.z_hi,2) || ')'
         end,
         q.n_obs, q.z_lo, q.z_hi, q.lw_delta,
         (select est_at from betas limit 1),
         round(sqrt(q.vq)::numeric, 8),
         round((sqrt(q.vq) * sqrt(252))::numeric, 6),
         round((k.z_q     * sqrt(q.vq))::numeric, 8),
         round((k.es_mult * sqrt(q.vq))::numeric, 8),
         round((sqrt(q.vq) / sqrt((select vq from base)))::numeric, 6),
         round(sqrt(q.vq_raw)::numeric, 8)
  from q cross join k
  order by q.bucket;
$fn$;

comment on function public.atlas_regime_cvar(text,int,numeric,int) is
  'Stressed VaR/CVaR per regime bucket: book factor exposures against the bucket covariance. Gaussian parametric -- b''Sigma b gives a variance only, and daily factor returns are fatter-tailed, so these understate the tail. Bucket 0 is unconditional on the identical sample. p_conf accepts 0.90/0.95/0.99 and returns no rows otherwise, deliberately.';

revoke execute on function public.atlas_regime_cvar(text,int,numeric,int) from public, anon, authenticated;
