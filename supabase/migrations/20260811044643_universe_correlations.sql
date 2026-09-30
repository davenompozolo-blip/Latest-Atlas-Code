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
  check (symbol_1 < symbol_2)
);

create index if not exists universe_correlations_lookup_idx
  on public.universe_correlations (as_of_date desc, symbol_1, correlation desc);
create index if not exists universe_correlations_lookup2_idx
  on public.universe_correlations (as_of_date desc, symbol_2, correlation desc);

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
  vol_daily        numeric,
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
  'Derived correlation clusters (spec 4.1). Average-linkage over correlation distance, written nightly by the trade sync job.';

alter table public.universe_correlations enable row level security;
alter table public.universe_risk_stats   enable row level security;
alter table public.universe_clusters     enable row level security;

drop policy if exists universe_correlations_read on public.universe_correlations;
create policy universe_correlations_read on public.universe_correlations for select to anon, authenticated using (true);
drop policy if exists universe_risk_stats_read on public.universe_risk_stats;
create policy universe_risk_stats_read on public.universe_risk_stats for select to anon, authenticated using (true);
drop policy if exists universe_clusters_read on public.universe_clusters;
create policy universe_clusters_read on public.universe_clusters for select to anon, authenticated using (true);
drop policy if exists universe_clusters_write on public.universe_clusters;
create policy universe_clusters_write on public.universe_clusters for all to anon, authenticated using (true) with check (true);
