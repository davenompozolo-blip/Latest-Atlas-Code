-- A0b answer 3 -- score_20d_z on factor_axis_scores.
--
-- A2's dispersion state compares score_20d against QUIET_SIGMA = 0.5 as though
-- score_20d were a sigma level. It is not: it is a rolling 20-SESSION SUM of
-- the daily axis score, whose standard deviation over this history runs 4.19
-- (dollar) to 8.22 (cyclical). So the "quiet" band was about a fifteenth of
-- what it was meant to be, and quiet fired on 0.53% of sessions instead of the
-- intended tenth or so.
--
-- The fix is the column, not the constant. score_20d_z is score_20d divided by
-- its own trailing standard deviation over the same 5-year baseline the pair
-- z-scores use, so QUIET_SIGMA = 0.5 means half a standard deviation again and
-- survives the next change to the window length -- which a hardcoded 2.5 in raw
-- units would not.
--
-- DIVIDED, NOT CENTERED, following the spec. That is safe here and was checked
-- rather than assumed: the full-history means are +0.285, -0.149 and +0.180
-- against those sds, so omitting the centring shifts a reading by at most
-- 0.07 sigma. The axis score is a loading-weighted sum of z-scores, so a mean
-- near zero is the construction rather than a coincidence.

alter table public.factor_axis_scores
  add column if not exists score_20d_z numeric;

comment on column public.factor_axis_scores.score_20d_z is
  'score_20d expressed in standard deviations of its own trailing 5-year '
  'distribution (sample sd, minimum 750 observations, uncentred). NULL until '
  'the baseline is long enough. This -- never score_20d -- is the column to '
  'compare against a threshold quoted in sigma.';

-- Backfill every existing row. The nightly job inserts ON CONFLICT DO NOTHING,
-- so it would never have populated the column on rows that already exist.
with z as (
  select date, axis_key,
         case when nb >= 750 and sd > 0 then score_20d / sd end as zz
    from (
      select date, axis_key, score_20d,
             stddev_samp(score_20d) over w as sd,
             count(score_20d)       over w as nb
        from public.factor_axis_scores
       where score_20d is not null
      window w as (partition by axis_key order by date
                   range between interval '5 years' preceding and current row)
    ) b
)
update public.factor_axis_scores s
   set score_20d_z = z.zz
  from z
 where z.date = s.date and z.axis_key = s.axis_key
   and s.score_20d_z is distinct from z.zz;
