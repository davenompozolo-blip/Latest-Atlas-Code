-- R-1b: vw_regime_axis_state must not place a missing reading in a bucket.
--
-- `latest` takes the newest date on which SOME axis carries a z, so another
-- axis can carry NULL that day. The bucket lookup then compared NULL against
-- every upper edge: `(NULL <= z_hi) desc` sorts NULL first in a DESC order and
-- the `else -bucket` branch picks the HIGHEST bucket -- a missing reading
-- published as the top regime, with its vol ratio fed into PCM's risk scale.
-- Raised by CodeRabbit on PR #837. A NULL reading now gets no bucket (every
-- regime column NULL), and a NULL edge is treated as a non-match, falling
-- through to the same highest-bucket rule atlas_var_backtest uses.
--
-- Behaviour-neutral today: all three axes carry a z on the latest date, and
-- the view returns the same buckets (concentration 4, cyclical 2, dollar 4)
-- before and after. Columns, order and types unchanged.

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
       and l.score_20d_z is not null
     order by coalesce(l.score_20d_z <= c.z_hi, false) desc,
              case when coalesce(l.score_20d_z <= c.z_hi, false) then c.bucket else -c.bucket end
     limit 1
  ) b on true;
