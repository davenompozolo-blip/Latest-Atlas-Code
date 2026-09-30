-- ============================================================
-- ATLAS Fund Research v2 — PR1 Data Model
-- Tables: funds, fund_returns, benchmarks, benchmark_returns,
--         asset_class_indices, index_returns, fund_holdings,
--         odd_categories, odd_assessments, odd_scores, odd_findings,
--         fund_metrics, fund_style, fund_skill
-- Seed: fictional Aloe Capital — Pan-Africa Long/Short Equity
-- ============================================================

-- ── Core identity tables ──────────────────────────────────────

create table if not exists benchmarks (
  id   uuid primary key default gen_random_uuid(),
  name text not null
);

create table if not exists funds (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  manager        text,
  strategy       text,
  asisa_category text,
  inception      date,
  aum            numeric,
  currency       text default 'ZAR',
  benchmark_id   uuid references benchmarks(id),
  reg28_compliant bool default true,
  peer_count      int,
  location        text
);

-- ── Return series ─────────────────────────────────────────────

create table if not exists fund_returns (
  fund_id    uuid references funds(id) on delete cascade,
  period     date not null,
  return_pct numeric not null,
  primary key (fund_id, period)
);

create table if not exists benchmark_returns (
  benchmark_id uuid references benchmarks(id) on delete cascade,
  period       date not null,
  return_pct   numeric not null,
  primary key (benchmark_id, period)
);

-- ── RBSA basis set ────────────────────────────────────────────

create table if not exists asset_class_indices (
  id   uuid primary key default gen_random_uuid(),
  name text not null
);

create table if not exists index_returns (
  index_id   uuid references asset_class_indices(id) on delete cascade,
  period     date not null,
  return_pct numeric not null,
  primary key (index_id, period)
);

-- ── Holdings ──────────────────────────────────────────────────

create table if not exists fund_holdings (
  fund_id  uuid references funds(id) on delete cascade,
  as_of    date not null,
  security text not null,
  weight   numeric not null,
  sector   text,
  bmk_weight numeric default 0,
  primary key (fund_id, as_of, security)
);

-- ── ODD model ─────────────────────────────────────────────────

create table if not exists odd_categories (
  id     uuid primary key default gen_random_uuid(),
  name   text not null,
  weight numeric not null default 1.0
);

create table if not exists odd_assessments (
  id              uuid primary key default gen_random_uuid(),
  fund_id         uuid references funds(id) on delete cascade,
  review_date     date not null,
  cycle           int not null default 1,
  composite_score numeric,
  rating          text check (rating in ('GREEN','AMBER','RED'))
);

create table if not exists odd_scores (
  assessment_id uuid references odd_assessments(id) on delete cascade,
  category_id   uuid references odd_categories(id) on delete cascade,
  score         numeric not null,
  rag           text check (rag in ('GREEN','AMBER','RED')),
  primary key (assessment_id, category_id)
);

create table if not exists odd_findings (
  id            uuid primary key default gen_random_uuid(),
  assessment_id uuid references odd_assessments(id) on delete cascade,
  category_id   uuid references odd_categories(id) on delete cascade,
  severity      text check (severity in ('RED','AMBER')),
  title         text not null,
  detail        text,
  status        text default 'OPEN' check (status in ('OPEN','REMEDIATED'))
);

-- ── Computed result tables (written by compute job) ───────────

create table if not exists fund_metrics (
  fund_id            uuid references funds(id) on delete cascade,
  as_of              date not null,
  sharpe             numeric,
  sortino            numeric,
  calmar             numeric,
  info_ratio         numeric,
  max_dd             numeric,
  dd_recovery_months int,
  up_capture         numeric,
  down_capture       numeric,
  alpha              numeric,
  alpha_tstat        numeric,
  beta               numeric,
  batting_avg        numeric,
  peer_rank_3y       int,
  peer_rank_5y       int,
  offshore_pct       numeric,
  primary key (fund_id, as_of)
);

create table if not exists fund_style (
  fund_id    uuid references funds(id) on delete cascade,
  as_of      date not null,
  weights    jsonb,
  r2         numeric,
  drift_flag bool default false,
  primary key (fund_id, as_of)
);

create table if not exists fund_skill (
  fund_id         uuid references funds(id) on delete cascade,
  as_of           date not null,
  alpha_raw       numeric,
  alpha_se        numeric,
  alpha_shrunk    numeric,
  posterior_lo    numeric,
  posterior_hi    numeric,
  shrink_narrative text,
  quartile_path   jsonb,
  primary key (fund_id, as_of)
);

-- ── Row-level security ────────────────────────────────────────

alter table benchmarks          enable row level security;
alter table funds               enable row level security;
alter table fund_returns        enable row level security;
alter table benchmark_returns   enable row level security;
alter table asset_class_indices enable row level security;
alter table index_returns       enable row level security;
alter table fund_holdings       enable row level security;
alter table odd_categories      enable row level security;
alter table odd_assessments     enable row level security;
alter table odd_scores          enable row level security;
alter table odd_findings        enable row level security;
alter table fund_metrics        enable row level security;
alter table fund_style          enable row level security;
alter table fund_skill          enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'benchmarks'          and policyname = 'read_benchmarks')          then create policy read_benchmarks          on benchmarks          for select using (true); end if;
  if not exists (select 1 from pg_policies where tablename = 'funds'               and policyname = 'read_funds')               then create policy read_funds               on funds               for select using (true); end if;
  if not exists (select 1 from pg_policies where tablename = 'fund_returns'        and policyname = 'read_fund_returns')        then create policy read_fund_returns        on fund_returns        for select using (true); end if;
  if not exists (select 1 from pg_policies where tablename = 'benchmark_returns'   and policyname = 'read_benchmark_returns')   then create policy read_benchmark_returns   on benchmark_returns   for select using (true); end if;
  if not exists (select 1 from pg_policies where tablename = 'asset_class_indices' and policyname = 'read_asset_class_indices') then create policy read_asset_class_indices on asset_class_indices for select using (true); end if;
  if not exists (select 1 from pg_policies where tablename = 'index_returns'       and policyname = 'read_index_returns')       then create policy read_index_returns       on index_returns       for select using (true); end if;
  if not exists (select 1 from pg_policies where tablename = 'fund_holdings'       and policyname = 'read_fund_holdings')       then create policy read_fund_holdings       on fund_holdings       for select using (true); end if;
  if not exists (select 1 from pg_policies where tablename = 'odd_categories'      and policyname = 'read_odd_categories')      then create policy read_odd_categories      on odd_categories      for select using (true); end if;
  if not exists (select 1 from pg_policies where tablename = 'odd_assessments'     and policyname = 'read_odd_assessments')     then create policy read_odd_assessments     on odd_assessments     for select using (true); end if;
  if not exists (select 1 from pg_policies where tablename = 'odd_scores'          and policyname = 'read_odd_scores')          then create policy read_odd_scores          on odd_scores          for select using (true); end if;
  if not exists (select 1 from pg_policies where tablename = 'odd_findings'        and policyname = 'read_odd_findings')        then create policy read_odd_findings        on odd_findings        for select using (true); end if;
  if not exists (select 1 from pg_policies where tablename = 'fund_metrics'        and policyname = 'read_fund_metrics')        then create policy read_fund_metrics        on fund_metrics        for select using (true); end if;
  if not exists (select 1 from pg_policies where tablename = 'fund_style'          and policyname = 'read_fund_style')          then create policy read_fund_style          on fund_style          for select using (true); end if;
  if not exists (select 1 from pg_policies where tablename = 'fund_skill'          and policyname = 'read_fund_skill')          then create policy read_fund_skill          on fund_skill          for select using (true); end if;
end $$;

-- ── Seed: Aloe Capital — Pan-Africa Long/Short Equity ─────────
-- All data is fictional and for development/demonstration only.

do $$ declare
  v_bmk_id  uuid;
  v_fund_id uuid;
  v_asmt_id uuid;
  v_cat     record;

  -- ODD category ids
  c_gov  uuid; c_comp uuid; c_val  uuid; c_cust uuid;
  c_kp   uuid; c_liq  uuid; c_fees uuid; c_ops  uuid;

  -- Monthly return series helpers (approx 89 months 2019-01 to 2026-05)
  -- Fund target: +112% cumulative; Benchmark target: +71% cumulative
  type t_ret is table of numeric[];

begin
  -- Skip if already seeded
  if exists (select 1 from funds where name = 'Aloe Capital — Pan-Africa Long/Short Equity') then
    return;
  end if;

  -- Benchmark
  insert into benchmarks (name) values ('ASISA SA EQ General Index') returning id into v_bmk_id;

  -- Fund
  insert into funds (name, manager, strategy, asisa_category, inception, aum, currency, benchmark_id,
                     reg28_compliant, peer_count, location)
  values ('Aloe Capital — Pan-Africa Long/Short Equity',
          'Aloe Capital',
          'Pan-Africa Long/Short Equity',
          'SA EQ General',
          '2019-01-01',
          4200000000,
          'ZAR',
          v_bmk_id,
          true, 148, 'Cape Town')
  returning id into v_fund_id;

  -- Monthly returns 2019-01 → 2026-05  (89 periods)
  -- Fund series (target cumulative ~+112%)
  insert into fund_returns (fund_id, period, return_pct) values
    (v_fund_id, '2019-01-01', -1.8),
    (v_fund_id, '2019-02-01',  2.4),
    (v_fund_id, '2019-03-01',  1.9),
    (v_fund_id, '2019-04-01',  3.1),
    (v_fund_id, '2019-05-01', -2.3),
    (v_fund_id, '2019-06-01',  1.7),
    (v_fund_id, '2019-07-01',  0.8),
    (v_fund_id, '2019-08-01', -1.2),
    (v_fund_id, '2019-09-01',  2.1),
    (v_fund_id, '2019-10-01',  1.5),
    (v_fund_id, '2019-11-01',  0.6),
    (v_fund_id, '2019-12-01',  2.9),
    (v_fund_id, '2020-01-01',  1.1),
    (v_fund_id, '2020-02-01', -6.4),
    (v_fund_id, '2020-03-01',-12.8),
    (v_fund_id, '2020-04-01',  8.3),
    (v_fund_id, '2020-05-01',  4.2),
    (v_fund_id, '2020-06-01',  2.7),
    (v_fund_id, '2020-07-01',  1.3),
    (v_fund_id, '2020-08-01',  2.8),
    (v_fund_id, '2020-09-01', -2.1),
    (v_fund_id, '2020-10-01', -1.4),
    (v_fund_id, '2020-11-01',  7.6),
    (v_fund_id, '2020-12-01',  3.9),
    (v_fund_id, '2021-01-01', -0.8),
    (v_fund_id, '2021-02-01',  2.3),
    (v_fund_id, '2021-03-01',  3.4),
    (v_fund_id, '2021-04-01',  1.8),
    (v_fund_id, '2021-05-01',  0.5),
    (v_fund_id, '2021-06-01',  2.1),
    (v_fund_id, '2021-07-01', -1.3),
    (v_fund_id, '2021-08-01',  1.9),
    (v_fund_id, '2021-09-01', -2.7),
    (v_fund_id, '2021-10-01',  3.2),
    (v_fund_id, '2021-11-01', -1.8),
    (v_fund_id, '2021-12-01',  2.6),
    (v_fund_id, '2022-01-01', -3.1),
    (v_fund_id, '2022-02-01', -1.6),
    (v_fund_id, '2022-03-01',  2.4),
    (v_fund_id, '2022-04-01', -2.8),
    (v_fund_id, '2022-05-01',  0.9),
    (v_fund_id, '2022-06-01', -4.2),
    (v_fund_id, '2022-07-01',  3.8),
    (v_fund_id, '2022-08-01', -1.9),
    (v_fund_id, '2022-09-01', -3.3),
    (v_fund_id, '2022-10-01',  2.7),
    (v_fund_id, '2022-11-01',  3.1),
    (v_fund_id, '2022-12-01', -0.7),
    (v_fund_id, '2023-01-01',  3.6),
    (v_fund_id, '2023-02-01', -0.4),
    (v_fund_id, '2023-03-01',  2.8),
    (v_fund_id, '2023-04-01',  1.7),
    (v_fund_id, '2023-05-01', -1.2),
    (v_fund_id, '2023-06-01',  3.4),
    (v_fund_id, '2023-07-01',  1.1),
    (v_fund_id, '2023-08-01', -2.3),
    (v_fund_id, '2023-09-01', -1.8),
    (v_fund_id, '2023-10-01',  0.9),
    (v_fund_id, '2023-11-01',  4.2),
    (v_fund_id, '2023-12-01',  2.1),
    (v_fund_id, '2024-01-01',  1.4),
    (v_fund_id, '2024-02-01',  2.9),
    (v_fund_id, '2024-03-01',  1.6),
    (v_fund_id, '2024-04-01', -1.7),
    (v_fund_id, '2024-05-01',  2.3),
    (v_fund_id, '2024-06-01',  1.8),
    (v_fund_id, '2024-07-01',  0.7),
    (v_fund_id, '2024-08-01',  2.4),
    (v_fund_id, '2024-09-01', -0.9),
    (v_fund_id, '2024-10-01',  1.3),
    (v_fund_id, '2024-11-01',  2.8),
    (v_fund_id, '2024-12-01',  1.1),
    (v_fund_id, '2025-01-01',  1.9),
    (v_fund_id, '2025-02-01', -0.6),
    (v_fund_id, '2025-03-01',  2.2),
    (v_fund_id, '2025-04-01',  1.4),
    (v_fund_id, '2025-05-01',  2.6),
    (v_fund_id, '2025-06-01',  1.7),
    (v_fund_id, '2025-07-01',  0.8),
    (v_fund_id, '2025-08-01',  2.1),
    (v_fund_id, '2025-09-01', -1.1),
    (v_fund_id, '2025-10-01',  1.6),
    (v_fund_id, '2025-11-01',  2.3),
    (v_fund_id, '2025-12-01',  1.2),
    (v_fund_id, '2026-01-01',  1.8),
    (v_fund_id, '2026-02-01',  0.9),
    (v_fund_id, '2026-03-01',  2.4),
    (v_fund_id, '2026-04-01',  1.1),
    (v_fund_id, '2026-05-01',  1.6);

  -- Benchmark returns (target cumulative ~+71%)
  insert into benchmark_returns (benchmark_id, period, return_pct) values
    (v_bmk_id, '2019-01-01', -2.1),
    (v_bmk_id, '2019-02-01',  1.8),
    (v_bmk_id, '2019-03-01',  1.4),
    (v_bmk_id, '2019-04-01',  2.3),
    (v_bmk_id, '2019-05-01', -2.9),
    (v_bmk_id, '2019-06-01',  1.1),
    (v_bmk_id, '2019-07-01',  0.4),
    (v_bmk_id, '2019-08-01', -1.7),
    (v_bmk_id, '2019-09-01',  1.5),
    (v_bmk_id, '2019-10-01',  0.9),
    (v_bmk_id, '2019-11-01',  0.2),
    (v_bmk_id, '2019-12-01',  2.1),
    (v_bmk_id, '2020-01-01',  0.6),
    (v_bmk_id, '2020-02-01', -8.3),
    (v_bmk_id, '2020-03-01',-16.4),
    (v_bmk_id, '2020-04-01',  9.1),
    (v_bmk_id, '2020-05-01',  3.4),
    (v_bmk_id, '2020-06-01',  2.1),
    (v_bmk_id, '2020-07-01',  0.8),
    (v_bmk_id, '2020-08-01',  2.3),
    (v_bmk_id, '2020-09-01', -2.8),
    (v_bmk_id, '2020-10-01', -2.1),
    (v_bmk_id, '2020-11-01',  7.9),
    (v_bmk_id, '2020-12-01',  3.2),
    (v_bmk_id, '2021-01-01', -1.3),
    (v_bmk_id, '2021-02-01',  1.8),
    (v_bmk_id, '2021-03-01',  2.7),
    (v_bmk_id, '2021-04-01',  1.2),
    (v_bmk_id, '2021-05-01',  0.1),
    (v_bmk_id, '2021-06-01',  1.6),
    (v_bmk_id, '2021-07-01', -1.8),
    (v_bmk_id, '2021-08-01',  1.4),
    (v_bmk_id, '2021-09-01', -3.4),
    (v_bmk_id, '2021-10-01',  2.6),
    (v_bmk_id, '2021-11-01', -2.4),
    (v_bmk_id, '2021-12-01',  1.9),
    (v_bmk_id, '2022-01-01', -3.8),
    (v_bmk_id, '2022-02-01', -2.3),
    (v_bmk_id, '2022-03-01',  1.9),
    (v_bmk_id, '2022-04-01', -3.4),
    (v_bmk_id, '2022-05-01',  0.4),
    (v_bmk_id, '2022-06-01', -5.1),
    (v_bmk_id, '2022-07-01',  3.2),
    (v_bmk_id, '2022-08-01', -2.6),
    (v_bmk_id, '2022-09-01', -4.2),
    (v_bmk_id, '2022-10-01',  2.1),
    (v_bmk_id, '2022-11-01',  2.7),
    (v_bmk_id, '2022-12-01', -1.1),
    (v_bmk_id, '2023-01-01',  2.9),
    (v_bmk_id, '2023-02-01', -0.8),
    (v_bmk_id, '2023-03-01',  2.1),
    (v_bmk_id, '2023-04-01',  1.2),
    (v_bmk_id, '2023-05-01', -1.7),
    (v_bmk_id, '2023-06-01',  2.8),
    (v_bmk_id, '2023-07-01',  0.7),
    (v_bmk_id, '2023-08-01', -2.9),
    (v_bmk_id, '2023-09-01', -2.3),
    (v_bmk_id, '2023-10-01',  0.4),
    (v_bmk_id, '2023-11-01',  3.6),
    (v_bmk_id, '2023-12-01',  1.6),
    (v_bmk_id, '2024-01-01',  0.9),
    (v_bmk_id, '2024-02-01',  2.3),
    (v_bmk_id, '2024-03-01',  1.1),
    (v_bmk_id, '2024-04-01', -2.2),
    (v_bmk_id, '2024-05-01',  1.8),
    (v_bmk_id, '2024-06-01',  1.3),
    (v_bmk_id, '2024-07-01',  0.3),
    (v_bmk_id, '2024-08-01',  1.9),
    (v_bmk_id, '2024-09-01', -1.4),
    (v_bmk_id, '2024-10-01',  0.8),
    (v_bmk_id, '2024-11-01',  2.2),
    (v_bmk_id, '2024-12-01',  0.7),
    (v_bmk_id, '2025-01-01',  1.4),
    (v_bmk_id, '2025-02-01', -0.9),
    (v_bmk_id, '2025-03-01',  1.7),
    (v_bmk_id, '2025-04-01',  0.9),
    (v_bmk_id, '2025-05-01',  2.1),
    (v_bmk_id, '2025-06-01',  1.2),
    (v_bmk_id, '2025-07-01',  0.4),
    (v_bmk_id, '2025-08-01',  1.6),
    (v_bmk_id, '2025-09-01', -1.4),
    (v_bmk_id, '2025-10-01',  1.1),
    (v_bmk_id, '2025-11-01',  1.8),
    (v_bmk_id, '2025-12-01',  0.8),
    (v_bmk_id, '2026-01-01',  1.3),
    (v_bmk_id, '2026-02-01',  0.5),
    (v_bmk_id, '2026-03-01',  1.9),
    (v_bmk_id, '2026-04-01',  0.7),
    (v_bmk_id, '2026-05-01',  1.2);

  -- Fund holdings as of 2026-04-30
  insert into fund_holdings (fund_id, as_of, security, weight, sector, bmk_weight) values
    (v_fund_id, '2026-04-30', 'Naspers',           0.082, 'Consumer',    0.072),
    (v_fund_id, '2026-04-30', 'FirstRand',         0.071, 'Financials',  0.081),
    (v_fund_id, '2026-04-30', 'Standard Bank',     0.065, 'Financials',  0.078),
    (v_fund_id, '2026-04-30', 'Anglo American',    0.058, 'Resources',   0.063),
    (v_fund_id, '2026-04-30', 'BHP Group',         0.048, 'Resources',   0.054),
    (v_fund_id, '2026-04-30', 'Remgro',            0.044, 'Industrials', 0.032),
    (v_fund_id, '2026-04-30', 'Capitec',           0.039, 'Financials',  0.041),
    (v_fund_id, '2026-04-30', 'MTN Group',         0.036, 'Industrials', 0.029),
    (v_fund_id, '2026-04-30', 'Shoprite',          0.034, 'Consumer',    0.036),
    (v_fund_id, '2026-04-30', 'Sanlam',            0.029, 'Financials',  0.031),
    (v_fund_id, '2026-04-30', 'iShares MSCI EM',   0.088, 'Offshore',    0.060),
    (v_fund_id, '2026-04-30', 'Vanguard FTSE Dev', 0.072, 'Offshore',    0.060),
    (v_fund_id, '2026-04-30', 'SA Bonds ETF',      0.050, 'Bonds',       0.000),
    (v_fund_id, '2026-04-30', 'Cash',              0.120, 'Cash',        0.000),
    (v_fund_id, '2026-04-30', 'Other Equities',    0.164, 'Financials',  0.133);

  -- ODD categories (weights default to 1.0)
  insert into odd_categories (name, weight) values
    ('Governance',     1.2) returning id into c_gov;
  insert into odd_categories (name, weight) values
    ('Compliance',     1.1) returning id into c_comp;
  insert into odd_categories (name, weight) values
    ('Valuation',      1.0) returning id into c_val;
  insert into odd_categories (name, weight) values
    ('Custody',        1.0) returning id into c_cust;
  insert into odd_categories (name, weight) values
    ('Key-Person/BCP', 1.0) returning id into c_kp;
  insert into odd_categories (name, weight) values
    ('Liquidity',      1.3) returning id into c_liq;
  insert into odd_categories (name, weight) values
    ('Fees',           0.8) returning id into c_fees;
  insert into odd_categories (name, weight) values
    ('Operations',     1.0) returning id into c_ops;

  -- ODD assessment
  insert into odd_assessments (fund_id, review_date, cycle, composite_score, rating)
  values (v_fund_id, '2026-04-30', 1, 74, 'AMBER')
  returning id into v_asmt_id;

  -- ODD category scores
  insert into odd_scores (assessment_id, category_id, score, rag) values
    (v_asmt_id, c_gov,  92, 'GREEN'),
    (v_asmt_id, c_comp, 88, 'GREEN'),
    (v_asmt_id, c_val,  68, 'AMBER'),
    (v_asmt_id, c_cust, 90, 'GREEN'),
    (v_asmt_id, c_kp,   61, 'AMBER'),
    (v_asmt_id, c_liq,  52, 'RED'),
    (v_asmt_id, c_fees, 71, 'AMBER'),
    (v_asmt_id, c_ops,  86, 'GREEN');

  -- ODD findings
  insert into odd_findings (assessment_id, category_id, severity, title, detail, status) values
    (v_asmt_id, c_liq,
     'RED',
     'Liquidity terms mismatch underlying assets',
     'Monthly dealing / 30-day notice, but ~18% of book in small-caps with >10-day liquidation horizons. Gate untested.',
     'OPEN'),
    (v_asmt_id, c_kp,
     'AMBER',
     'Key-person concentration — no documented succession',
     'CIO drives research and risk sign-off; no deputy with discretionary authority on file.',
     'OPEN'),
    (v_asmt_id, c_val,
     'AMBER',
     'Level-3 valuation governed in-house',
     'Two unlisted positions (~6% NAV) priced via internal model; independent verification quarterly, not monthly.',
     'OPEN');

  -- Fund metrics (precomputed, as_of latest quarter-end)
  insert into fund_metrics (fund_id, as_of, sharpe, sortino, calmar, info_ratio,
                             max_dd, dd_recovery_months, up_capture, down_capture,
                             alpha, alpha_tstat, beta, batting_avg,
                             peer_rank_3y, peer_rank_5y, offshore_pct)
  values (v_fund_id, '2026-03-31',
          1.12, 1.58, 0.84, 0.62,
          -18.4, 7, 0.94, 0.78,
          3.2, 2.1, 0.88, 0.58,
          12, 41, 0.28);

end $$;
