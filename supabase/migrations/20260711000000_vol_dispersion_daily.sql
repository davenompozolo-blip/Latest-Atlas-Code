-- Nexus Volatility Dispersion — daily spread store.
-- One table shared by all three basket types (market / portfolio / sector):
-- one ingestion job (api/vol-dispersion-sync.js), three read paths (Rotation
-- Map badge, Rotation Map sector strip, Opportunities Ledger annotation).
-- The spread is precomputed and stored so the frontend percentile / z-score
-- is a cheap windowed read, never a recompute.
--
-- Mirrors options_positioning_snapshots: RLS on, anon read, anon write for
-- the headless job (the proven sync-valuations → scrapbook_snapshots
-- pattern — no service-role/env-binding dependency).
--
-- Spec deviation, deliberate: the spec draft keyed the table on
-- (date, basket_type, sector) with sector NULL for non-sector rows, but
-- Postgres primary-key columns cannot be nullable. sector is therefore
-- NOT NULL DEFAULT '' with a check tying non-empty sector to
-- basket_type='sector', which keeps the natural key and PostgREST
-- on_conflict upserts working.

create table if not exists public.vol_dispersion_daily (
  date              date not null,
  basket_type       text not null check (basket_type in ('market','portfolio','sector')),
  sector            text not null default '',  -- ATLAS sector label; '' unless basket_type='sector'
  basket_iv         numeric not null,  -- weighted avg 30D ATM IV across basket names, vol points
  benchmark_iv      numeric not null,  -- 30D ATM IV of the index/ETF leg, vol points
  benchmark_ticker  text not null,     -- 'SPY', 'XLK', … — traceability
  spread            numeric not null,  -- basket_iv - benchmark_iv
  constituent_count int not null,      -- # names actually priced that day (degraded-data flag)
  created_at        timestamptz default now(),
  primary key (date, basket_type, sector),
  check ((basket_type = 'sector') = (sector <> ''))
);

alter table public.vol_dispersion_daily enable row level security;

drop policy if exists "read vol dispersion" on public.vol_dispersion_daily;
create policy "read vol dispersion" on public.vol_dispersion_daily
  for select to anon, authenticated using (true);

drop policy if exists "anon insert vol dispersion" on public.vol_dispersion_daily;
create policy "anon insert vol dispersion" on public.vol_dispersion_daily
  for insert to anon, authenticated with check (true);

drop policy if exists "anon update vol dispersion" on public.vol_dispersion_daily;
create policy "anon update vol dispersion" on public.vol_dispersion_daily
  for update to anon, authenticated using (true) with check (true);

-- The read paths are all "one basket, trailing window, newest last".
create index if not exists vol_dispersion_basket_date
  on public.vol_dispersion_daily (basket_type, sector, date desc);

comment on table public.vol_dispersion_daily is
  'Daily single-name-vs-index implied-vol spread (implied-correlation proxy) per basket. market/portfolio benchmark = SPY 30D ATM IV; sector benchmark = SPDR sector ETF IV (Option B). Written nightly by api/vol-dispersion-sync.js; read by the Nexus Rotation Map badge, sector strip, and Ledger annotation.';
