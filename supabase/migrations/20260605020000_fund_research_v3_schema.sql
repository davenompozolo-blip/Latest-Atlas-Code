-- ============================================================
-- ATLAS Fund Research v3 — PR1 Schema Delta
-- Builds on top of 20260605010000_fund_research_v2_schema.sql.
-- Adds: fund_prices_raw (ingestion landing), new columns on
-- funds table (ticker, external_code, source, is_listed).
-- All changes are additive and idempotent (IF NOT EXISTS /
-- ADD COLUMN IF NOT EXISTS).
-- ============================================================

-- ── Ingestion landing table ───────────────────────────────────
-- Written daily by sync_funddata_prices; adapter transforms
-- rows into fund_returns for the canonical series.

create table if not exists fund_prices_raw (
  source        text    not null default 'funddata_public',
  fund_code     text    not null,
  manager       text,
  fund_name     text,
  asisa_category text,
  price_date    date    not null,
  nav           numeric,
  ter           numeric,   -- total expense ratio %
  tc            numeric,   -- transaction cost %
  tic           numeric,   -- total investment charge %
  created_at    timestamptz not null default now(),
  primary key (source, fund_code, price_date)
);

alter table fund_prices_raw enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'fund_prices_raw' and policyname = 'read_fund_prices_raw'
  ) then
    create policy read_fund_prices_raw on fund_prices_raw for select using (true);
  end if;
end $$;

-- ── Extend funds table ────────────────────────────────────────
-- Add columns present in v3 spec but absent from v2 migration.

alter table funds add column if not exists ticker        text;
alter table funds add column if not exists external_code text;
alter table funds add column if not exists source        text;
alter table funds add column if not exists is_listed     bool not null default false;
alter table funds add column if not exists reg28_compliant bool default true;
alter table funds add column if not exists peer_count    int;
alter table funds add column if not exists location      text;

-- Unique index on ticker for fast resolver lookups.
create unique index if not exists funds_ticker_uq
  on funds (ticker) where ticker is not null;

-- ── Extend fund_metrics ───────────────────────────────────────
-- peer_rank columns used by the mandate ribbon.

alter table fund_metrics add column if not exists peer_rank_3y  int;
alter table fund_metrics add column if not exists peer_rank_5y  int;
alter table fund_metrics add column if not exists offshore_pct  numeric;

-- ── Service-role write policy for ingestion jobs ──────────────
-- The daily sync writes to fund_prices_raw using the service
-- role key (bypasses RLS), so no insert policy is required.
-- The adapter also writes to fund_returns, which already has
-- an open read policy; the adapter uses the service role.
