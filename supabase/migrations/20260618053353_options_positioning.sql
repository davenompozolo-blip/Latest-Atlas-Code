create table if not exists public.options_positioning_snapshots (
  id bigint generated always as identity primary key,
  symbol text not null,
  snapshot_date date not null default current_date,
  atm_iv numeric, skew_25d numeric,
  pc_oi numeric, pc_vol numeric,
  front_iv numeric, back_iv numeric,
  oi_peak_strike numeric, next_expiry date,
  drop_reason text,
  created_at timestamptz default now(),
  unique (symbol, snapshot_date)
);

alter table public.options_positioning_snapshots enable row level security;
drop policy if exists "read options snapshots" on public.options_positioning_snapshots;
create policy "read options snapshots" on public.options_positioning_snapshots
  for select to anon, authenticated using (true);

create index if not exists options_snap_symbol_date_desc
  on public.options_positioning_snapshots (symbol, snapshot_date desc);

create or replace view public.nexus_options as
with tracked as (
  select a.symbol as tk from positions p join assets a on a.id = p.asset_id
    where p.quantity <> 0 and p.as_of_date = (select max(as_of_date) from positions)
  union select ticker from scrapbook_companies
  union select symbol from cortex_watchlist
),
win as (
  select symbol,
    percent_rank() over (partition by symbol order by atm_iv)  as iv_rank,
    percent_rank() over (partition by symbol order by skew_25d) as skew_rank,
    snapshot_date, count(*) over (partition by symbol) as n_obs
  from options_positioning_snapshots
  where snapshot_date >= current_date - 90
),
latest as (
  select distinct on (symbol) symbol, snapshot_date
  from options_positioning_snapshots order by symbol, snapshot_date desc
)
select t.tk,
  s.atm_iv, s.skew_25d, s.pc_oi, s.pc_vol, s.front_iv, s.back_iv,
  s.oi_peak_strike, s.next_expiry, s.drop_reason,
  round(w.iv_rank*100) as iv_rank, round(w.skew_rank*100) as skew_rank,
  (w.n_obs >= 30) as rank_ready,
  s.snapshot_date, (s.snapshot_date < current_date - 3) as stale
from tracked t
left join latest l on l.symbol = t.tk
left join options_positioning_snapshots s on s.symbol = l.symbol and s.snapshot_date = l.snapshot_date
left join win w on w.symbol = t.tk and w.snapshot_date = l.snapshot_date;

grant select on public.nexus_options to anon, authenticated;

comment on table public.options_positioning_snapshots is 'Daily options-positioning snapshot per tracked name (ATM IV, 25 delta skew, P/C, term). Service-role write; anon read. drop_reason records honest no-chain coverage.';
comment on view public.nexus_options is 'Canonical options-positioning view: tracked pool (positions + scrapbook + watchlist), latest snapshot, 90d percentile ranks gated by rank_ready. Read by Flagship (held) and Opportunities (candidates).';
