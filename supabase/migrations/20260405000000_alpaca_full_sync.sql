-- ATLAS: full Alpaca sync schema additions.
--
-- Extends sync_log for multi-function orchestration and adds the tables
-- needed to land everything the Alpaca paper API exposes beyond positions.

-- ---------------------------------------------------------------------------
-- sync_log: add function_name and parent_id so sub-function rows can be
-- attributed to a parent orchestrator run.
-- ---------------------------------------------------------------------------
alter table public.sync_log
  add column if not exists function_name text,
  add column if not exists parent_id bigint references public.sync_log(id) on delete set null;

create index if not exists sync_log_parent_id_idx
  on public.sync_log (parent_id);

create index if not exists sync_log_function_name_started_at_idx
  on public.sync_log (function_name, started_at desc);

-- vw_sync_status now returns the latest top-level run (parent_id is null).
-- That's the orchestrator row when sync_alpaca_all runs, or a standalone
-- function row when a single function is invoked manually.
--
-- DROP first because the earlier sync_log migration created this view with
-- a different column order and Postgres's CREATE OR REPLACE VIEW cannot
-- rename or reorder existing output columns — it can only append new ones.
drop view if exists public.vw_sync_status;
create view public.vw_sync_status as
select
    id,
    started_at,
    finished_at,
    status,
    source,
    function_name,
    positions_seen,
    positions_upserted,
    transactions_upserted,
    prices_upserted,
    duration_ms,
    error_message,
    details,
    extract(epoch from (now() - coalesce(finished_at, started_at)))::integer as seconds_since
from public.sync_log
where parent_id is null
order by started_at desc
limit 1;

grant select on public.vw_sync_status to anon, authenticated;

-- ---------------------------------------------------------------------------
-- account_snapshots: one row per /v2/account sync. Captures cash, equity,
-- buying power, and long/short MV so the terminal can compute NAV even when
-- positions are mid-settlement.
-- ---------------------------------------------------------------------------
create table if not exists public.account_snapshots (
    id                  bigserial primary key,
    portfolio_id        uuid references public.portfolios(id) on delete cascade,
    as_of               timestamptz not null default now(),
    cash                numeric(24,8),
    equity              numeric(24,8),
    buying_power        numeric(24,8),
    portfolio_value     numeric(24,8),
    long_market_value   numeric(24,8),
    short_market_value  numeric(24,8),
    currency            text not null default 'USD',
    raw                 jsonb not null default '{}'::jsonb
);

create index if not exists account_snapshots_portfolio_as_of_idx
    on public.account_snapshots (portfolio_id, as_of desc);

alter table public.account_snapshots enable row level security;

drop policy if exists account_snapshots_read_anon on public.account_snapshots;
create policy account_snapshots_read_anon
    on public.account_snapshots for select
    to anon, authenticated
    using (true);

-- ---------------------------------------------------------------------------
-- portfolio_equity_curve: populated from /v2/account/portfolio/history.
-- Alpaca returns equity/profit_loss aligned to a timeframe; we store every
-- (portfolio_id, timeframe, ts) point so the terminal can render curves
-- without re-deriving from positions.
-- ---------------------------------------------------------------------------
create table if not exists public.portfolio_equity_curve (
    id               bigserial primary key,
    portfolio_id     uuid not null references public.portfolios(id) on delete cascade,
    ts               timestamptz not null,
    equity           numeric(24,8),
    profit_loss      numeric(24,8),
    profit_loss_pct  numeric(24,8),
    base_value       numeric(24,8),
    timeframe        text not null,
    unique (portfolio_id, timeframe, ts)
);

create index if not exists portfolio_equity_curve_portfolio_ts_idx
    on public.portfolio_equity_curve (portfolio_id, ts desc);

alter table public.portfolio_equity_curve enable row level security;

drop policy if exists portfolio_equity_curve_read_anon on public.portfolio_equity_curve;
create policy portfolio_equity_curve_read_anon
    on public.portfolio_equity_curve for select
    to anon, authenticated
    using (true);

-- ---------------------------------------------------------------------------
-- Ensure a synthetic CASH asset exists for cash-movement transactions
-- (INT, CSD, CSW — anything without a tradable symbol). Activities pointing
-- at this asset keep the transactions schema (asset_id NOT NULL) happy.
-- ---------------------------------------------------------------------------
insert into public.assets (symbol, name, asset_class, currency)
values ('$CASH', 'Cash', 'cash', 'USD')
on conflict (symbol) do nothing;
