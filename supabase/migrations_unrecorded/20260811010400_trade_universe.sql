-- ATLAS Trade revamp, spec §3 — Layer 1, the tradeable universe.
--
-- §3.1: "Not a screener. A screener answers a question you ask. A universe is a
-- maintained, versioned, persistent set that exists before you ask anything,
-- and it is snapshotted daily so you can look back at what your opportunity set
-- actually was on any date." That sentence is the schema: rules are versioned
-- and stored, members are written per day, and nothing is recomputed from
-- today's data when you look at a past date.
--
-- The eligibility/attractiveness split from §0 is enforced structurally.
-- Eligibility is binary and lives in trade_universe_members.eligible with a
-- reason code when false; attractiveness is continuous and lives in the rank
-- and score columns, which are only meaningful for eligible rows.

create table if not exists public.trade_universes (
  id          bigint generated always as identity primary key,
  code        text not null unique,
  label       text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.trade_universe_rules (
  id          bigint generated always as identity primary key,
  universe_id bigint not null references public.trade_universes (id) on delete cascade,
  -- 'gate' is hard, binary and non-negotiable (§3.2). 'axis' is descriptive and
  -- only ever filters the view (§3.3). Storing the kind stops a descriptive
  -- filter from ever being mistaken for an eligibility rule.
  rule_kind   text not null check (rule_kind in ('gate','axis')),
  code        text not null,
  label       text not null,
  params      jsonb not null default '{}'::jsonb,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (universe_id, code)
);

-- One row per universe per day: the funnel exactly as it was, so a shrinking
-- opportunity set is recoverable and never silent (§3.2).
create table if not exists public.trade_universe_snapshots (
  universe_id     bigint not null references public.trade_universes (id) on delete cascade,
  as_of_date      date not null,
  funnel          jsonb not null default '[]'::jsonb,
  candidate_count int not null default 0,
  eligible_count  int not null default 0,
  excluded_count  int not null default 0,
  data_gate_count int not null default 0,
  built_at        timestamptz not null default now(),
  notes           text,
  primary key (universe_id, as_of_date)
);

comment on column public.trade_universe_snapshots.funnel is
  'Ordered [{stage, label, count, dropped}] — the universe bar in the UI reads this verbatim rather than recounting members.';
comment on column public.trade_universe_snapshots.data_gate_count is
  'Names excluded for data-integrity reasons alone (§3.2). Surfaced on its own so the data gap stays visible instead of silently shrinking the opportunity set.';

create table if not exists public.trade_universe_members (
  universe_id       bigint not null references public.trade_universes (id) on delete cascade,
  as_of_date        date not null,
  symbol            text not null,

  -- Eligibility: binary, with the reason retained when it fails.
  eligible          boolean not null,
  exclusion_code    text,
  exclusion_detail  text,
  gate_stage        text,

  -- Attractiveness: continuous, meaningful only where eligible.
  rank              int,
  composite         numeric,
  net               numeric,
  alignment         numeric,
  dispersion        numeric,

  -- Descriptive axes (§3.3) and the tradability facts the Markets page does
  -- not carry.
  sector            text,
  geography         text,
  market_cap_usd    numeric,
  market_cap_bucket text,
  adv_usd           numeric,
  spread_bps        numeric,
  momentum_pct      numeric,
  vol_pct           numeric,
  liquidity_pct     numeric,
  iv_rank           numeric,
  options_listed    boolean,
  days_to_earnings  int,
  borrow_status     text,

  -- Position overlay (§3.6) — a universe without book context is a stock list.
  book_state        text check (book_state in ('held','bench','unowned','closed')),
  held_weight_pct   numeric,

  metrics           jsonb not null default '{}'::jsonb,
  primary key (universe_id, as_of_date, symbol)
);

comment on column public.trade_universe_members.exclusion_code is
  'Why this name is ineligible today. Gate failures are shown, not hidden (§3.2).';
comment on column public.trade_universe_members.book_state is
  'held | bench | unowned | closed — the always-on position overlay from §3.6.';

create index if not exists trade_universe_members_eligible_idx
  on public.trade_universe_members (universe_id, as_of_date, eligible, rank);
create index if not exists trade_universe_members_symbol_idx
  on public.trade_universe_members (symbol, as_of_date desc);
create index if not exists trade_universe_members_excluded_idx
  on public.trade_universe_members (universe_id, as_of_date, exclusion_code)
  where eligible = false;

-- ── Seed: the US core universe (§10 decision 3, US-listed and Alpaca-tradeable
-- first, venue and vendor agnostic so JSE slots in later) ────────────────────
insert into public.trade_universes (code, label, description)
values ('us_core', 'US core', 'US-listed, broker-tradeable names with a complete and fresh data record. Venue-agnostic by construction: adding JSE means adding a universe row and a geography axis value, not changing the model.')
on conflict (code) do nothing;

insert into public.trade_universe_rules (universe_id, rule_kind, code, label, params, sort_order)
select u.id, r.rule_kind, r.code, r.label, r.params, r.sort_order
from public.trade_universes u
cross join (values
  ('gate', 'broker_tradeable', 'Broker tradeable',
     '{"requires":["tradable","not_halted","not_delisting"]}'::jsonb, 1),
  ('gate', 'liquidity_floor',  'Liquidity floor',
     '{"min_adv_usd":10000000,"max_clip_pct_of_adv":0.05,"max_spread_bps":25}'::jsonb, 2),
  ('gate', 'data_integrity',   'Data integrity',
     '{"max_price_age_days":4,"min_history_days":120,"required":["close","volume","sector"]}'::jsonb, 3),
  ('gate', 'shortability',     'Shortability (short side only)',
     '{"applies_to_side":"sell_short"}'::jsonb, 4),
  ('gate', 'blackout',         'Manual blackout',
     '{"symbols":[]}'::jsonb, 5),
  ('axis', 'geography',        'Geography',        '{"values":["US","JSE","EU","APAC"]}'::jsonb, 10),
  ('axis', 'sector',           'Sector',           '{"source":"assets.sector + sector_overrides"}'::jsonb, 11),
  ('axis', 'market_cap',       'Market cap',       '{"buckets":["Micro","Small","Mid","Large","Mega"]}'::jsonb, 12),
  ('axis', 'realised_vol',     'Realised vol',     '{"bands":["Q1","Q2","Q3","Q4"]}'::jsonb, 13),
  ('axis', 'momentum',         'Momentum',         '{"bands":["Q1","Q2","Q3","Q4"]}'::jsonb, 14),
  ('axis', 'liquidity',        'Liquidity',        '{"tiers":[50000000,10000000]}'::jsonb, 15),
  ('axis', 'options',          'Options / IV rank','{"tiers":["listed","iv_lt_40","iv_gt_60"]}'::jsonb, 16),
  ('axis', 'earnings_prox',    'Earnings proximity','{"buckets":["lt5d","5_30d","gt30d"]}'::jsonb, 17),
  ('axis', 'book_state',       'Book state',       '{"values":["held","bench","unowned"]}'::jsonb, 18)
) as r(rule_kind, code, label, params, sort_order)
where u.code = 'us_core'
on conflict (universe_id, code) do update set
  rule_kind  = excluded.rule_kind,
  label      = excluded.label,
  params     = excluded.params,
  sort_order = excluded.sort_order;

alter table public.trade_universes          enable row level security;
alter table public.trade_universe_rules     enable row level security;
alter table public.trade_universe_snapshots enable row level security;
alter table public.trade_universe_members   enable row level security;

drop policy if exists trade_universes_read on public.trade_universes;
create policy trade_universes_read on public.trade_universes
  for select to anon, authenticated using (true);

drop policy if exists trade_universe_rules_read on public.trade_universe_rules;
create policy trade_universe_rules_read on public.trade_universe_rules
  for select to anon, authenticated using (true);
drop policy if exists trade_universe_rules_write on public.trade_universe_rules;
create policy trade_universe_rules_write on public.trade_universe_rules
  for all to anon, authenticated using (true) with check (true);

drop policy if exists trade_universe_snapshots_read on public.trade_universe_snapshots;
create policy trade_universe_snapshots_read on public.trade_universe_snapshots
  for select to anon, authenticated using (true);
drop policy if exists trade_universe_snapshots_write on public.trade_universe_snapshots;
create policy trade_universe_snapshots_write on public.trade_universe_snapshots
  for all to anon, authenticated using (true) with check (true);

drop policy if exists trade_universe_members_read on public.trade_universe_members;
create policy trade_universe_members_read on public.trade_universe_members
  for select to anon, authenticated using (true);
drop policy if exists trade_universe_members_write on public.trade_universe_members;
create policy trade_universe_members_write on public.trade_universe_members
  for all to anon, authenticated using (true) with check (true);
