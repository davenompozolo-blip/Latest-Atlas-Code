-- Atlas initial Supabase schema for persistent portfolio data.

create extension if not exists "pgcrypto";

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  name text not null,
  broker text,
  base_currency text not null default 'USD',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  symbol text not null unique,
  name text,
  asset_class text,
  exchange text,
  currency text not null default 'USD',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete restrict,
  quantity numeric(24,8) not null,
  average_cost numeric(24,8),
  market_value numeric(24,8),
  as_of_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (portfolio_id, asset_id, as_of_date)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete restrict,
  transaction_type text not null,
  quantity numeric(24,8) not null,
  price numeric(24,8),
  fees numeric(24,8) not null default 0,
  transaction_date timestamptz not null,
  external_id text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (portfolio_id, external_id)
);

create table if not exists public.price_history (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  price_date date not null,
  open numeric(24,8),
  high numeric(24,8),
  low numeric(24,8),
  close numeric(24,8) not null,
  adjusted_close numeric(24,8),
  volume bigint,
  source text,
  created_at timestamptz not null default now(),
  unique (asset_id, price_date)
);

create index if not exists idx_positions_portfolio_id on public.positions (portfolio_id);
create index if not exists idx_positions_asset_id on public.positions (asset_id);
create index if not exists idx_transactions_portfolio_id on public.transactions (portfolio_id);
create index if not exists idx_transactions_asset_id on public.transactions (asset_id);
create index if not exists idx_transactions_transaction_date on public.transactions (transaction_date desc);
create index if not exists idx_price_history_asset_id on public.price_history (asset_id);
create index if not exists idx_price_history_price_date on public.price_history (price_date desc);
