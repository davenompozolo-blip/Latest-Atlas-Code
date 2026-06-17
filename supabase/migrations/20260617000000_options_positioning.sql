-- Nexus Options Positioning — shared data layer.
-- One canonical view + one snapshot table feeding two consumers (Flagship
-- monitoring, Opportunities entry-timing). Mirrors the snapshot + observability
-- convention (scrapbook_snapshots + sync_log) and the RLS-on-with-read-policy
-- pattern (position_themes / opportunity_assessments).
--
-- The snapshot table is written by a scheduled service-role job
-- (api/options-snapshot.js); anon/authenticated may only read. Names with no
-- listed options (ADRs, OTC, thin chains) still record a row carrying nulls +
-- drop_reason, so coverage is honest rather than silently absent.

create table if not exists public.options_positioning_snapshots (
  id bigint generated always as identity primary key,
  symbol text not null,
  snapshot_date date not null default current_date,
  atm_iv numeric, skew_25d numeric,
  pc_oi numeric, pc_vol numeric,
  front_iv numeric, back_iv numeric,
  oi_peak_strike numeric, next_expiry date,
  drop_reason text,            -- 'no_listed_options' | 'chain_too_thin' | null
  created_at timestamptz default now(),
  unique (symbol, snapshot_date)
);

alter table public.options_positioning_snapshots enable row level security;
drop policy if exists "read options snapshots" on public.options_positioning_snapshots;
create policy "read options snapshots" on public.options_positioning_snapshots
  for select to anon, authenticated using (true);
-- No insert/update policy for anon → writes are service-role only (the job).

create index if not exists options_snap_symbol_date_desc
  on public.options_positioning_snapshots (symbol, snapshot_date desc);

-- The view generalises `held` to `tracked` so the same source serves both
-- consumers. Tracked = open positions + scrapbook_companies + cortex_watchlist
-- (the bounded ~70-name pool Opportunities already draws candidates from, so a
-- ledger candidate already has options data, and it's nowhere near the universe).
-- iv_rank / skew_rank are percentile ranks over a trailing 90-day window;
-- rank_ready gates them until ~30 sessions accrue (level + skew sign are live
-- from day one). Left join from tracked → every tracked name appears; no-chain
-- names carry nulls + drop_reason.
create or replace view public.nexus_options as
with tracked as (
  select a.symbol as tk from positions p join assets a on a.id = p.asset_id where p.qty <> 0
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

comment on table public.options_positioning_snapshots is 'Daily options-positioning snapshot per tracked name (ATM IV, 25Δ skew, P/C, term). Service-role write; anon read. drop_reason records honest no-chain coverage.';
comment on view public.nexus_options is 'Canonical options-positioning view: tracked pool (positions + scrapbook + watchlist), latest snapshot, 90d percentile ranks gated by rank_ready. Read by Flagship (held) and Opportunities (candidates).';
