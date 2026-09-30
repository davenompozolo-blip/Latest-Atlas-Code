-- ATLAS Trade revamp, spec §4.1 (effective exposure) and §7 ("Universe-wide
-- correlation. insight_correlation_cluster covers 19 holding pairs only, and
-- effective exposure needs the full eligible set").
--
-- Three things get cached nightly here, because §4.1 is explicit that this must
-- not run per keystroke:
--   universe_correlations — pairwise ρ over the trailing window, EWMA weighted,
--                           with the unweighted number kept alongside it so the
--                           threshold can be calibrated against the real book
--                           rather than trusted (decision 2 in §10).
--   universe_risk_stats   — per-symbol daily vol, beta and ADV, so the ticket
--                           can rebuild Σ = D·C·D without touching price_history.
--   universe_clusters     — derived cluster membership, written by the sync job.
--                           §4.1: a hard pairwise cut "misses a name at 0.73
--                           that belongs to the cluster and admits one at 0.76
--                           that does not". The pairwise number stays visible so
--                           you can see when the two methods disagree.

create table if not exists public.universe_correlations (
  as_of_date         date not null,
  symbol_1           text not null,
  symbol_2           text not null,
  window_days        int  not null,
  correlation        numeric not null check (correlation >= -1 and correlation <= 1),
  correlation_simple numeric check (correlation_simple >= -1 and correlation_simple <= 1),
  common_days        int not null,
  created_at         timestamptz not null default now(),
  primary key (as_of_date, symbol_1, symbol_2, window_days),
  -- Stored once per unordered pair. Readers must look up both orderings or use
  -- the view below.
  check (symbol_1 < symbol_2)
);

create index if not exists universe_correlations_lookup_idx
  on public.universe_correlations (as_of_date desc, symbol_1, correlation desc);
create index if not exists universe_correlations_lookup2_idx
  on public.universe_correlations (as_of_date desc, symbol_2, correlation desc);

-- Symmetric read surface so the ticket can ask "everything correlated with X"
-- in one query without caring which side of the pair X was stored on.
create or replace view public.vw_universe_correlation_pairs as
  select as_of_date, symbol_1 as symbol, symbol_2 as peer, window_days,
         correlation, correlation_simple, common_days
    from public.universe_correlations
  union all
  select as_of_date, symbol_2 as symbol, symbol_1 as peer, window_days,
         correlation, correlation_simple, common_days
    from public.universe_correlations;

create table if not exists public.universe_risk_stats (
  as_of_date       date not null,
  symbol           text not null,
  window_days      int not null,
  vol_daily        numeric,   -- EWMA weighted, decimal (0.021 = 2.1%/day)
  vol_daily_simple numeric,
  vol_annual       numeric,
  beta_spy         numeric,
  adv_usd          numeric,
  last_close       numeric,
  last_price_date  date,
  obs_days         int not null,
  primary key (as_of_date, symbol, window_days)
);

create table if not exists public.universe_clusters (
  as_of_date    date not null,
  symbol        text not null,
  method        text not null default 'avg_linkage_corr_distance',
  cluster_id    int not null,
  cluster_label text,
  cluster_size  int not null default 1,
  avg_intra_rho numeric,
  created_at    timestamptz not null default now(),
  primary key (as_of_date, symbol, method)
);

comment on table public.universe_clusters is
  'Derived correlation clusters (spec §4.1). Average-linkage over correlation distance, written nightly by the trade sync job. The destination the pairwise ρ>0.75 cut is a scaffold for.';

-- ── The nightly refresh ──────────────────────────────────────────────────────
-- EWMA weights by recency over a shared date grid: w = lambda^(days back).
-- Pairs whose overlap is thinner than p_min_days are not written at all — a
-- correlation computed on 20 common days is not a weaker reading, it is a
-- different and misleading one.
create or replace function public.refresh_universe_correlations(
  p_window   int     default 120,
  p_min_days int     default 60,
  p_lambda   numeric default 0.97
)
returns integer language plpgsql as $$
declare
  n_pairs integer := 0;
  d_asof  date;
begin
  select max(price_date) into d_asof from public.price_history;
  if d_asof is null then return 0; end if;

  -- DISTINCT ON because a symbol can appear under more than one assets row;
  -- without it a duplicate would silently corrupt every return in the series.
  create temp table _px on commit drop as
    select distinct on (a.symbol, ph.price_date)
           a.symbol, ph.price_date, ph.close
      from public.price_history ph
      join public.assets a on a.id = ph.asset_id
     where ph.close > 0
       and coalesce(a.asset_class, '') not in ('option', 'us_option', 'cash')
       and a.symbol !~ '\d{6}[CP]\d{8}$'
       and ph.price_date > d_asof - (p_window * 2)
     order by a.symbol, ph.price_date, ph.created_at desc nulls last;

  create temp table _ret on commit drop as
    select symbol, price_date, r
      from (
        select symbol, price_date,
               close / lag(close) over (partition by symbol order by price_date) - 1 as r
          from _px
      ) s
     where r is not null and abs(r) < 0.75;   -- guard against split artefacts

  -- Trim to the trailing window on the shared trading-day grid.
  create temp table _grid on commit drop as
    select price_date, row_number() over (order by price_date desc) - 1 as days_back
      from (select distinct price_date from _ret) g
     order by price_date desc
     limit p_window;

  create temp table _rw on commit drop as
    select r.symbol, r.price_date, r.r, power(p_lambda, g.days_back) as w
      from _ret r join _grid g using (price_date);

  delete from public.universe_correlations
   where as_of_date = d_asof and window_days = p_window;

  insert into public.universe_correlations
    (as_of_date, symbol_1, symbol_2, window_days, correlation, correlation_simple, common_days)
  select d_asof, p.s1, p.s2, p_window, p.rho_w, p.rho_s, p.n
  from (
    select
      a.symbol as s1,
      b.symbol as s2,
      count(*) as n,
      -- Weighted correlation, computed in one pass from weighted moments.
      ( (sum(a.w * a.r * b.r) / sum(a.w))
        - (sum(a.w * a.r) / sum(a.w)) * (sum(a.w * b.r) / sum(a.w)) )
      / nullif(
          sqrt( greatest(sum(a.w * a.r * a.r) / sum(a.w) - power(sum(a.w * a.r) / sum(a.w), 2), 0) )
        * sqrt( greatest(sum(a.w * b.r * b.r) / sum(a.w) - power(sum(a.w * b.r) / sum(a.w), 2), 0) ), 0)
        as rho_w,
      corr(a.r, b.r) as rho_s
    from _rw a
    join _rw b on b.price_date = a.price_date and a.symbol < b.symbol
    group by a.symbol, b.symbol
    having count(*) >= p_min_days
  ) p
  where p.rho_w is not null and p.rho_w between -1 and 1;

  get diagnostics n_pairs = row_count;

  -- Per-symbol risk stats over the same window and the same weights, so the
  -- correlation matrix and the vols the ticket pairs it with cannot disagree.
  delete from public.universe_risk_stats
   where as_of_date = d_asof and window_days = p_window;

  insert into public.universe_risk_stats
    (as_of_date, symbol, window_days, vol_daily, vol_daily_simple, vol_annual,
     beta_spy, adv_usd, last_close, last_price_date, obs_days)
  select
    d_asof, v.symbol, p_window,
    v.vol_w, v.vol_s, v.vol_w * sqrt(252), b.beta, l.adv_usd, lc.last_close, lc.last_date, v.n
  from (
    select symbol,
           count(*) as n,
           sqrt(greatest(sum(w * r * r) / sum(w) - power(sum(w * r) / sum(w), 2), 0)) as vol_w,
           stddev_samp(r) as vol_s
      from _rw group by symbol
  ) v
  left join lateral (
    select case when var_samp(m.r) > 0 then covar_samp(x.r, m.r) / var_samp(m.r) end as beta
      from _rw x join _rw m on m.price_date = x.price_date and m.symbol = 'SPY'
     where x.symbol = v.symbol
  ) b on true
  left join lateral (
    select avg(px.close * px.volume) as adv_usd
      from public.price_history px
     where px.asset_id in (select id from public.assets where symbol = v.symbol)
       and px.price_date > d_asof - 30
       and px.volume is not null
  ) l on true
  left join lateral (
    select px.close as last_close, px.price_date as last_date
      from public.price_history px
     where px.asset_id in (select id from public.assets where symbol = v.symbol)
     order by px.price_date desc
     limit 1
  ) lc on true
  where v.n >= p_min_days;

  return n_pairs;
end $$;

comment on function public.refresh_universe_correlations is
  'Nightly correlation/vol/ADV snapshot over the eligible price universe (spec §4.1). Pairs thinner than p_min_days common observations are skipped rather than written weak.';

alter table public.universe_correlations enable row level security;
alter table public.universe_risk_stats   enable row level security;
alter table public.universe_clusters     enable row level security;

drop policy if exists universe_correlations_read on public.universe_correlations;
create policy universe_correlations_read on public.universe_correlations
  for select to anon, authenticated using (true);

drop policy if exists universe_risk_stats_read on public.universe_risk_stats;
create policy universe_risk_stats_read on public.universe_risk_stats
  for select to anon, authenticated using (true);

drop policy if exists universe_clusters_read on public.universe_clusters;
create policy universe_clusters_read on public.universe_clusters
  for select to anon, authenticated using (true);
drop policy if exists universe_clusters_write on public.universe_clusters;
create policy universe_clusters_write on public.universe_clusters
  for all to anon, authenticated using (true) with check (true);
