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

create table if not exists fund_holdings (
  fund_id  uuid references funds(id) on delete cascade,
  as_of    date not null,
  security text not null,
  weight   numeric not null,
  sector   text,
  bmk_weight numeric default 0,
  primary key (fund_id, as_of, security)
);

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
