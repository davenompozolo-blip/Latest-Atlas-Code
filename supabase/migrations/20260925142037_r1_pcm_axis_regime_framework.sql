-- R-1: the intermarket-axis regime framework, per position and per account,
-- for PCM.
--
-- PCM's regime conditioning was retired on 2026-09-10 with the Growth x
-- Inflation quadrant, and deliberately NOT repointed at the three axes: the
-- only bridge from an axis to a Growth/Quality/Momentum/Value/LowVol tilt was
-- `cyclical`, which the BOOK carries no measurable exposure to. That objection
-- is about STYLE tilts through the book's exposure. It does not reach a
-- position-level reading: cluster_identity already fits every universe cluster
-- on market plus the three raw daily axis scores, with t-stats, and the held
-- books map onto it almost completely -- 98% of market value on both accounts
-- has an identity, 94% / 96% carries at least one axis exposure with |t| > 2.
-- Those are facts about the stocks, so a new account has them on day one.
--
-- WHAT THIS IS NOT: a return forecast. A trend-persistence tilt (exposure x
-- recent axis drift) was built and measured first. Across 13 years the
-- correlation of an axis's mean daily score in one block with the next is
-- -0.005 / -0.027 / +0.007 at 20 sessions (206 blocks) and mildly NEGATIVE at
-- 5 (concentration -0.087, t ~ -2.5): recent drift does not persist, so a tilt
-- built on it would inject a view the axes' own history refutes. The
-- framework enters PCM as EXPOSURE (a budget on aggregate axis exposure) and
-- RISK (the regime-CVaR ratio of today's bucket), both measured.
--
-- vw_position_axis_exposure -- per held position of the ACTIVE account, its
--   cluster's axis betas and t-stats. exposure_<axis> is the beta when
--   |t| > 2 and ABSENT (NULL) otherwise: an insignificant exposure is not a
--   small one.
-- vw_regime_axis_state -- per axis: today's reading, what a positive reading
--   means, and the ACTIVE account's regime-CVaR bucket that reading falls in,
--   with its vol ratio against unconditional (NULL for a book with no regime
--   CVaR yet).

create or replace view public.vw_regime_axis_state as
with latest as (
  select s.axis_key, s.date, s.score_20d, s.score_20d_z
    from public.factor_axis_scores s
   where s.date = (select max(s2.date) from public.factor_axis_scores s2
                    where s2.score_20d is not null and s2.score_20d_z is not null)
),
cvar as (
  select c.axis_key, c.bucket, c.bucket_label, c.z_lo, c.z_hi,
         c.vol_ratio_vs_unconditional, c.as_of
    from public.book_regime_cvar c
   where c.portfolio_id = (select public.atlas_active_portfolio())
     and c.conf = 0.95
     and c.bucket > 0
     and c.as_of = (select max(c2.as_of) from public.book_regime_cvar c2
                     where c2.portfolio_id = (select public.atlas_active_portfolio()))
)
select a.axis_key,
       a.label,
       a.positive_means,
       l.date                        as as_of,
       l.score_20d_z                 as z_20d,
       l.score_20d / 20              as mean_daily_score_20d,
       -- The bucket today's reading falls in: the lowest whose upper edge
       -- still contains it, else the top bucket (the quartile edges do not
       -- tile the line exactly -- the same rule atlas_var_backtest uses).
       b.bucket                      as regime_bucket,
       b.bucket_label                as regime_bucket_label,
       b.vol_ratio_vs_unconditional  as regime_vol_ratio,
       b.as_of                       as regime_cvar_as_of
  from public.factor_axes a
  join latest l on l.axis_key = a.axis_key
  left join lateral (
    select c.* from cvar c
     where c.axis_key = a.axis_key
     order by (l.score_20d_z <= c.z_hi) desc, case when l.score_20d_z <= c.z_hi then c.bucket else -c.bucket end
     limit 1
  ) b on true;

create or replace view public.vw_position_axis_exposure as
with pos as materialized (
  -- Class prefix AND OCC shape: either alone has been wrong here before.
  select p.symbol,
         sum(p.market_value) as market_value,
         bool_or(coalesce(a.asset_class, '') ilike '%option%'
                 or p.symbol ~ '^[A-Z.]{1,6}[0-9]{6}[CP][0-9]{8}$') as is_option
    from public.vw_positions_current p
    left join public.assets a on a.id = p.asset_id
   group by p.symbol
),
nav as (select sum(abs(market_value)) as gross from pos),
cl as (
  select u.symbol, u.cluster_id
    from public.universe_clusters u
   where u.as_of_date = (select max(as_of_date) from public.universe_clusters)
),
ci as (
  select c.*
    from public.cluster_identity c
   where c.as_of_date = (select max(as_of_date) from public.cluster_identity)
     and c.fit_status = 'measured'
)
select p.symbol,
       p.market_value,
       p.market_value / nullif((select gross from nav), 0) as weight,
       cl.cluster_id,
       ci.as_of_date as identity_as_of,
       ci.composition_label,
       ci.r_squared,
       ci.beta_cyclical, ci.t_cyclical,
       ci.beta_concentration, ci.t_concentration,
       ci.beta_dollar, ci.t_dollar,
       case when abs(ci.t_cyclical)      > 2 then ci.beta_cyclical      end as exposure_cyclical,
       case when abs(ci.t_concentration) > 2 then ci.beta_concentration end as exposure_concentration,
       case when abs(ci.t_dollar)        > 2 then ci.beta_dollar        end as exposure_dollar,
       case
         when p.is_option               then 'option_contract'
         when cl.cluster_id is null     then 'not_in_partition'
         when ci.as_of_date is null     then 'no_cluster_identity'
         when not (coalesce(abs(ci.t_cyclical) > 2, false)
                   or coalesce(abs(ci.t_concentration) > 2, false)
                   or coalesce(abs(ci.t_dollar) > 2, false)) then 'no_significant_axis'
         else 'measured'
       end as exposure_status
  from pos p
  left join cl on cl.symbol = p.symbol
  left join ci on ci.cluster_id = cl.cluster_id;

revoke all on public.vw_regime_axis_state, public.vw_position_axis_exposure from anon, authenticated;
grant select on public.vw_regime_axis_state, public.vw_position_axis_exposure to anon, authenticated;
