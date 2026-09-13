-- Write score_20d_z on every new row. The insert is ON CONFLICT DO NOTHING and
-- that stays correct here -- (date, axis_key) is derived from data, not from a
-- clustering, so a re-run is genuinely idempotent -- but it does mean an
-- existing row is never revised, so the column has to be right on the way in.
-- The one-off backfill of prior rows is the migration before this one.

create or replace function public.atlas_refresh_factor_scores()
 returns table(zscores_written integer, scores_written integer)
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_z int;
  v_s int;
begin
  with legs as (
    select l.pair_key, rp.numerator_symbol as n, rp.denominator_symbol as d
    from (select distinct pair_key from public.factor_axis_loadings) l
    join public.ratio_pairs rp using (pair_key)
  ), lvl as (
    select l.pair_key, p1.date, ln(p1.adj_close) - ln(p2.adj_close) as loglvl
    from legs l
    join public.market_prices p1 on p1.symbol = l.n
    join public.market_prices p2 on p2.symbol = l.d and p2.date = p1.date
    where p1.date >= (select estimation_start from public.factor_axes limit 1)
  ), ret as (
    select pair_key, date,
           loglvl - lag(loglvl) over (partition by pair_key order by date) as r
    from lvl
  ), base as (
    select pair_key, date, r,
           avg(r)          over w as mu,
           stddev_samp(r)  over w as sd,
           count(*)        over w as nb
    from ret
    where r is not null
    window w as (partition by pair_key order by date
                 range between interval '5 years' preceding and current row)
  )
  insert into public.factor_pair_zscores
    (date, pair_key, log_return, baseline_mean, baseline_sd, z, n_baseline)
  select date, pair_key, r, mu, sd, (r - mu) / sd, nb
  from base
  where nb >= 750 and sd > 0
  on conflict (date, pair_key) do nothing;
  get diagnostics v_z = row_count;

  with sc as (
    select z.date, fl.axis_key,
           sum(fl.loading * z.z) as score,
           count(*)              as pairs_used
    from public.factor_pair_zscores z
    join public.factor_axis_loadings fl on fl.pair_key = z.pair_key
    group by z.date, fl.axis_key
  ), cum as (
    select date, axis_key, score, pairs_used,
           case when count(*) over w20 = 20 then sum(score) over w20 end as score_20d,
           case when count(*) over w60 = 60 then sum(score) over w60 end as score_60d
    from sc
    window w20 as (partition by axis_key order by date rows between 19 preceding and current row),
           w60 as (partition by axis_key order by date rows between 59 preceding and current row)
  ), zz as (
    -- score_20d in standard deviations of its own trailing 5-year distribution.
    -- Same window shape and same 750-observation floor as the pair z-scores
    -- above, so the two baselines mean the same thing. Uncentred, per spec:
    -- the axis score is a loading-weighted sum of z-scores and its mean sits
    -- within 0.07 sd of zero on every axis, measured not assumed.
    select date, axis_key, score, pairs_used, score_20d, score_60d,
           case when count(score_20d) over w5y >= 750
                 and stddev_samp(score_20d) over w5y > 0
                then score_20d / (stddev_samp(score_20d) over w5y)
           end as score_20d_z
    from cum
    window w5y as (partition by axis_key order by date
                   range between interval '5 years' preceding and current row)
  )
  insert into public.factor_axis_scores
    (date, axis_key, score, score_20d, score_60d, score_20d_z, pairs_used)
  select date, axis_key, score, score_20d, score_60d, score_20d_z, pairs_used
  from zz
  where pairs_used = 11
  on conflict (date, axis_key) do nothing;
  get diagnostics v_s = row_count;

  return query select v_z, v_s;
end;
$function$;
