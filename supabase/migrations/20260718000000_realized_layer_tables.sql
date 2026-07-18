-- Nexus Realized layer — trailing-history tables (spec §8).
-- Two small tables that give the realized beats their honesty gates:
--
--   sector_pnl_residuals  — daily actual/implied/residual per sector.
--       Feeds beat 05's ">1σ" flag, which needs a trailing 60d residual
--       distribution (≥20 obs per sector before a σ is quoted).
--       Populated by the same nightly job that closes the P&L.
--
--   attribution_history   — weekly snapshot of the three Brinson effects
--       at portfolio level, per benchmark. Feeds beat 07's verdict
--       badges (current effect vs trailing 12-week median).
--
-- Until these accrue rows the UI renders '—' — it never fakes history.
-- RLS pattern mirrors options_positioning_snapshots: service-role write,
-- anon/authenticated read-only.

create table if not exists public.sector_pnl_residuals (
  id bigint generated always as identity primary key,
  date date not null default current_date,
  sector text not null,
  actual_pnl numeric,          -- realized sector P&L for the day ($)
  implied_pnl numeric,         -- Σ β_f × factor_move_f × sector MV ($)
  residual numeric,            -- actual − implied ($)
  created_at timestamptz default now(),
  unique (date, sector)
);

alter table public.sector_pnl_residuals enable row level security;
drop policy if exists "read sector residuals" on public.sector_pnl_residuals;
create policy "read sector residuals" on public.sector_pnl_residuals
  for select to anon, authenticated using (true);
-- No insert/update policy for anon → writes are service-role only (nightly job).

create index if not exists sector_residuals_sector_date_desc
  on public.sector_pnl_residuals (sector, date desc);
create index if not exists sector_residuals_date
  on public.sector_pnl_residuals (date desc);

comment on table public.sector_pnl_residuals is
  'Daily sector P&L vs beta-implied P&L (Nexus beat 05). residual = actual − implied. Written nightly by the P&L close job; anon read-only. The 1σ flag needs ≥20 rows per sector before it renders.';

create table if not exists public.attribution_history (
  id bigint generated always as identity primary key,
  week_start date not null,
  benchmark text not null,               -- 'equal' | 'spy' | 'qqq'
  allocation_effect numeric,             -- fractions, e.g. 0.0497 = +4.97%
  selection_effect numeric,
  interaction_effect numeric,
  active_return numeric,
  position_count int,
  created_at timestamptz default now(),
  unique (week_start, benchmark)
);

alter table public.attribution_history enable row level security;
drop policy if exists "read attribution history" on public.attribution_history;
create policy "read attribution history" on public.attribution_history
  for select to anon, authenticated using (true);
-- No insert/update policy for anon → writes are service-role only (weekly job).

create index if not exists attribution_history_bench_week_desc
  on public.attribution_history (benchmark, week_start desc);

comment on table public.attribution_history is
  'Weekly portfolio-level Brinson effects per benchmark (Nexus beat 07). Verdict badges compare the live effect to the trailing 12-week median; below 12 weeks the badge renders ''—''.';
