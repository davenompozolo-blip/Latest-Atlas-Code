-- v3 additive schema delta
alter table funds add column if not exists ticker text;
alter table funds add column if not exists external_code text;
alter table funds add column if not exists source text default 'manual';
alter table funds add column if not exists is_listed bool default false;

create unique index if not exists funds_ticker_uq on funds(ticker) where ticker is not null;

create table if not exists fund_prices_raw (
  id          uuid primary key default gen_random_uuid(),
  source      text not null,
  fund_code   text not null,
  manager     text,
  fund_name   text,
  asisa_category text,
  price_date  date not null,
  nav         numeric not null,
  ter         numeric,
  tc          numeric,
  tic         numeric,
  created_at  timestamptz default now(),
  unique (source, fund_code, price_date)
);

alter table fund_prices_raw enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'fund_prices_raw' and policyname = 'read_fund_prices_raw')
  then create policy read_fund_prices_raw on fund_prices_raw for select using (true); end if;
end $$;
