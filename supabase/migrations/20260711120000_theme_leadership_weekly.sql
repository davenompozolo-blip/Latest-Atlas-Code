-- Nexus Theme — weekly leadership snapshot store.
-- Persists each theme's 5-day momentum change (the rotation map's y-axis)
-- once a week, ranked, so the phase-2 leadership timeline has real history
-- behind it instead of a cold start (rotation redesign spec §3.7: start the
-- snapshot job now, ship the UI once history has accumulated).
--
-- Written weekly by api/theme-leadership-snapshot.js (Vercel cron, Friday
-- post-close). One row per theme per snapshot; rank 1 = leading theme.
-- Mirrors vol_dispersion_daily: RLS on, anon read, anon write for the
-- headless job (the proven sync-valuations → scrapbook_snapshots pattern).

create table if not exists public.theme_leadership_weekly (
  snapshot_date date not null,           -- the price session the momentum is as of
  theme         text not null,           -- ATLAS theme (sector) label
  momentum_5d   numeric not null,        -- 5-day cumulative momentum, % (nexusThemeCompute.cumMomentum)
  rank          int not null,            -- 1 = strongest 5d momentum that week
  is_leader     boolean not null default false,
  created_at    timestamptz default now(),
  primary key (snapshot_date, theme),
  check (is_leader = (rank = 1))
);

alter table public.theme_leadership_weekly enable row level security;

drop policy if exists "read theme leadership" on public.theme_leadership_weekly;
create policy "read theme leadership" on public.theme_leadership_weekly
  for select to anon, authenticated using (true);

drop policy if exists "anon insert theme leadership" on public.theme_leadership_weekly;
create policy "anon insert theme leadership" on public.theme_leadership_weekly
  for insert to anon, authenticated with check (true);

drop policy if exists "anon update theme leadership" on public.theme_leadership_weekly;
create policy "anon update theme leadership" on public.theme_leadership_weekly
  for update to anon, authenticated using (true) with check (true);

-- Timeline read path: "leaders over time, newest last".
create index if not exists theme_leadership_rank_date
  on public.theme_leadership_weekly (rank, snapshot_date desc);

comment on table public.theme_leadership_weekly is
  'Weekly snapshot of per-theme 5-day momentum change, ranked (rank 1 = leading theme). Written by api/theme-leadership-snapshot.js every Friday post-close; feeds the future Nexus leadership timeline (data collection deliberately starts ahead of the UI).';
