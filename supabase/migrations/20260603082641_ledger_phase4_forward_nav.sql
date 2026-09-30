create table if not exists forward_test_positions (
  id             uuid primary key default gen_random_uuid(),
  decision_id    uuid not null references decisions(id),
  symbol         text not null,
  intent         text not null,
  decided_at     date not null,
  entry_price    numeric not null,
  qty            numeric not null,
  notional       numeric,
  created_at     timestamptz not null default now()
);
create index if not exists idx_ftp_symbol on forward_test_positions(symbol);
create index if not exists idx_ftp_date   on forward_test_positions(decided_at);
alter table forward_test_positions enable row level security;
do $$ begin
  create policy ftp_anon_read on forward_test_positions for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ftp_service_all on forward_test_positions for all using (auth.role() = 'service_role');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ftp_anon_insert on forward_test_positions for insert with check (true);
exception when duplicate_object then null; end $$;
drop trigger if exists no_mutate_ftp on forward_test_positions;
create trigger no_mutate_ftp before update or delete on forward_test_positions
  for each row execute function deny_mutation();

insert into forward_test_positions
  (decision_id, symbol, intent, decided_at, entry_price, qty, notional)
select d.id, d.symbol, d.intent, d.decided_at::date,
  (d.signal_snapshot->>'price')::numeric,
  case d.intent when 'add' then (d.signal_snapshot->>'quantity')::numeric
                            else -(d.signal_snapshot->>'quantity')::numeric end,
  (d.signal_snapshot->>'notional')::numeric
from decisions d
where d.decision_type = 'executed'
  and (d.signal_snapshot->>'price')::numeric > 0
  and (d.signal_snapshot->>'quantity')::numeric > 0
  and not exists (select 1 from forward_test_positions ftp where ftp.decision_id = d.id)
order by d.seq;

create or replace view vw_forward_nav as
with
calendar as (
  select distinct ph.price_date as dt
  from price_history ph
  where ph.price_date >= (select min(decided_at) from forward_test_positions)
    and ph.price_date <= (select max(price_date) from price_history)
),
position_series as (
  select cal.dt, ftp.symbol,
    sum(ftp.qty) filter (where ftp.decided_at <= cal.dt) as net_qty,
    sum(ftp.notional) filter (where ftp.decided_at <= cal.dt and ftp.qty < 0) as cash_from_sales
  from calendar cal
  cross join (select distinct symbol from forward_test_positions) syms
  join forward_test_positions ftp on ftp.symbol = syms.symbol
  group by cal.dt, ftp.symbol
),
valued as (
  select ps.dt, ps.symbol, ps.net_qty,
    coalesce(ps.cash_from_sales, 0) as cash_from_sales,
    ledger_px(ps.symbol, ps.dt) as px
  from position_series ps
  where ps.net_qty > 0
),
daily as (
  select dt, sum(net_qty * px) as equity_value, max(cash_from_sales) as total_cash
  from valued group by dt
)
select dt,
  round((equity_value + coalesce(total_cash, 0))::numeric, 2) as nav,
  round(equity_value::numeric, 2) as equity_value,
  round(coalesce(total_cash, 0)::numeric, 2) as cash
from daily order by dt;

create or replace view vw_forward_vs_spy as
with
base_date as (select min(dt) as d from vw_forward_nav),
base_nav  as (select nav from vw_forward_nav where dt = (select d from base_date)),
base_spy  as (select ledger_px('SPY', (select d from base_date)) as px),
spy_series as (
  select ph.price_date as dt,
    round((coalesce(ph.adjusted_close, ph.close) / nullif((select px from base_spy), 0) * 100)::numeric, 4) as spy_idx
  from price_history ph join assets a on a.id = ph.asset_id
  where upper(a.symbol) = 'SPY'
    and ph.price_date >= (select d from base_date)
),
fwd_series as (
  select dt,
    round((nav / nullif((select nav from base_nav), 0) * 100)::numeric, 4) as fwd_idx,
    nav
  from vw_forward_nav
)
select coalesce(f.dt, s.dt) as dt, f.fwd_idx, s.spy_idx,
  round((f.fwd_idx - s.spy_idx)::numeric, 4) as alpha_idx, f.nav
from fwd_series f
full outer join spy_series s on s.dt = f.dt
where coalesce(f.dt, s.dt) is not null order by 1;

create or replace view vw_forward_summary as
with
series    as (select * from vw_forward_vs_spy where fwd_idx is not null and spy_idx is not null),
first_row as (select * from series order by dt asc  limit 1),
last_row  as (select * from series order by dt desc limit 1),
peak      as (select max(fwd_idx) as peak_fwd from series)
select
  (select dt  from first_row) as inception_date,
  (select dt  from last_row)  as as_of_date,
  (select nav from last_row)  as current_nav,
  round(((select fwd_idx from last_row) - 100)::numeric, 2) as total_return_pct,
  round(((select spy_idx from last_row) - 100)::numeric, 2) as spy_total_return_pct,
  round(((select fwd_idx from last_row) - (select spy_idx from last_row))::numeric, 2) as total_alpha_pct,
  round((1 - (select fwd_idx from last_row) / nullif((select peak_fwd from peak), 0))::numeric * 100, 2) as drawdown_from_peak_pct,
  (select count(*) from forward_test_positions where qty > 0) as open_positions,
  (select count(*) from forward_test_positions) as total_position_records;
