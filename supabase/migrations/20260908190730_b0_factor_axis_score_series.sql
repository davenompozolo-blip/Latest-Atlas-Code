-- Axis score series (B0 section 2).
--
-- score(axis, t) = SUM over pairs of  loading(axis, pair) * z(pair, t)
-- z(pair, t)     = (r - mu) / sigma, mu and sigma over a TRAILING 5-YEAR ROLLING
--                  window ending at t inclusive.
--
-- The baseline mu and sigma are STORED per (date, pair), not recomputed on read.
-- A rolling window recomputed later against a restated market_prices would
-- silently change historical scores; stored parameters make any past score
-- reproducible exactly, which is what the spec asks for.
--
-- Both tables are append-only in practice: the loader inserts missing dates and
-- never rewrites an existing one, for the same reason.

create table if not exists public.factor_pair_zscores (
  date          date not null,
  pair_key      text not null references public.ratio_pairs(pair_key)
                  on update cascade on delete restrict,
  log_return    numeric not null,
  baseline_mean numeric not null,
  baseline_sd   numeric not null,
  z             numeric not null,
  n_baseline    int     not null,

  constraint factor_pair_zscores_pkey primary key (date, pair_key),
  constraint fpz_sd_positive_ck  check (baseline_sd > 0),
  -- Below this the standardisation is not meaningful and the figure would look
  -- like a score without being one.
  constraint fpz_min_baseline_ck check (n_baseline >= 750)
);
create index if not exists factor_pair_zscores_date_idx on public.factor_pair_zscores (date);

comment on table public.factor_pair_zscores is
  'Per-pair standardised daily log return with the exact trailing-5y baseline used. Stored, not recomputed: this is what makes a historical axis score reproducible.';
comment on column public.factor_pair_zscores.n_baseline is
  'Observations in the trailing 5y window. Minimum 750 (~3y) enforced: a z-score off a short baseline is a number that looks like a score and is not one.';

create table if not exists public.factor_axis_scores (
  date       date not null,
  axis_key   text not null references public.factor_axes(axis_key)
               on update cascade on delete restrict,
  score      numeric not null,
  score_20d  numeric,
  score_60d  numeric,
  pairs_used int not null,

  constraint factor_axis_scores_pkey primary key (date, axis_key),
  -- 11 pairs carry the loadings; a score off fewer is not comparable to one off all.
  constraint fas_pairs_used_ck check (pairs_used = 11)
);
create index if not exists factor_axis_scores_date_idx on public.factor_axis_scores (date);

comment on table public.factor_axis_scores is
  'Daily axis score plus 20d and 60d trailing cumulative sums. The cumulative columns are NULL until their window is full -- a 60d cumulative over 12 days is not a 60d cumulative.';

create or replace function public.atlas_refresh_factor_scores()
returns table (zscores_written int, scores_written int)
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
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
  )
  insert into public.factor_axis_scores (date, axis_key, score, score_20d, score_60d, pairs_used)
  select date, axis_key, score, score_20d, score_60d, pairs_used
  from cum
  where pairs_used = 11
  on conflict (date, axis_key) do nothing;
  get diagnostics v_s = row_count;

  return query select v_z, v_s;
end;
$fn$;

comment on function public.atlas_refresh_factor_scores() is
  'Populates factor_pair_zscores and factor_axis_scores for any dates not already present. Existing rows are never rewritten, so stored baselines stay authoritative.';

alter table public.factor_pair_zscores enable row level security;
alter table public.factor_axis_scores  enable row level security;

drop policy if exists factor_pair_zscores_read    on public.factor_pair_zscores;
drop policy if exists factor_pair_zscores_service on public.factor_pair_zscores;
create policy factor_pair_zscores_read    on public.factor_pair_zscores for select to anon, authenticated using (true);
create policy factor_pair_zscores_service on public.factor_pair_zscores for all    to service_role using (true) with check (true);

drop policy if exists factor_axis_scores_read     on public.factor_axis_scores;
drop policy if exists factor_axis_scores_service  on public.factor_axis_scores;
create policy factor_axis_scores_read     on public.factor_axis_scores for select to anon, authenticated using (true);
create policy factor_axis_scores_service  on public.factor_axis_scores for all    to service_role using (true) with check (true);
