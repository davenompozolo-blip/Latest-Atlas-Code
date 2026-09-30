create extension if not exists pgcrypto;

create table if not exists orders (
  id               uuid primary key default gen_random_uuid(),
  client_order_id  text unique,
  alpaca_order_id  text,
  symbol           text not null,
  side             text,
  type             text,
  qty              numeric,
  notional         numeric,
  status           text,
  filled_qty       numeric,
  filled_avg_price numeric,
  reject_reason    text,
  submitted_at     timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  raw              jsonb
);

alter table orders enable row level security;
do $$ begin
  create policy orders_anon_read on orders for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy orders_service_all on orders for all using (auth.role() = 'service_role');
exception when duplicate_object then null; end $$;

create table if not exists decisions (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  decided_at      timestamptz not null default now(),
  symbol          text not null,
  entity_type     text default 'holding',
  decision_type   text not null,
  intent          text,
  order_id        uuid references orders(id),
  conviction      int,
  signal_snapshot jsonb,
  rationale       text,
  benchmark       text default 'SPY',
  content_hash    text,
  prev_hash       text,
  supersedes_id   uuid references decisions(id)
);

create index if not exists idx_decisions_symbol  on decisions(symbol);
create index if not exists idx_decisions_created  on decisions(created_at);
create index if not exists idx_decisions_type     on decisions(decision_type);

create table if not exists decision_outcomes (
  id               uuid primary key default gen_random_uuid(),
  decision_id      uuid not null references decisions(id),
  horizon_days     int not null,
  snapshot_at      timestamptz not null default now(),
  entity_return    numeric,
  benchmark_return numeric,
  alpha            numeric,
  correct          boolean,
  unique(decision_id, horizon_days)
);

create or replace function decisions_hash_chain() returns trigger as $$
declare
  last_hash text;
  canon     text;
begin
  new.created_at := now();
  perform pg_advisory_xact_lock(hashtext('atlas_decisions_chain'));
  select content_hash into last_hash from decisions order by created_at desc, id desc limit 1;
  new.prev_hash := coalesce(last_hash, '');
  canon :=
    coalesce(new.symbol,'')              || '|' ||
    coalesce(new.decided_at::text,'')    || '|' ||
    coalesce(new.decision_type,'')       || '|' ||
    coalesce(new.intent,'')              || '|' ||
    coalesce(new.conviction::text,'')    || '|' ||
    coalesce(new.signal_snapshot::text,'') || '|' ||
    coalesce(new.rationale,'')           || '|' ||
    coalesce(new.prev_hash,'');
  new.content_hash := encode(digest(canon, 'sha256'), 'hex');
  return new;
end $$ language plpgsql;

drop trigger if exists trg_decisions_hash on decisions;
create trigger trg_decisions_hash before insert on decisions
  for each row execute function decisions_hash_chain();

create or replace function deny_mutation() returns trigger as $$
begin raise exception '% is append-only — corrections append a new row', tg_table_name; end $$ language plpgsql;

drop trigger if exists no_mutate_decisions on decisions;
create trigger no_mutate_decisions before update or delete on decisions
  for each row execute function deny_mutation();

drop trigger if exists no_mutate_outcomes on decision_outcomes;
create trigger no_mutate_outcomes before update or delete on decision_outcomes
  for each row execute function deny_mutation();

alter table decisions enable row level security;
do $$ begin
  create policy decisions_anon_read on decisions for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy decisions_anon_insert on decisions for insert with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy decisions_service_all on decisions for all using (auth.role() = 'service_role');
exception when duplicate_object then null; end $$;

alter table decision_outcomes enable row level security;
do $$ begin
  create policy outcomes_anon_read on decision_outcomes for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy outcomes_service_all on decision_outcomes for all using (auth.role() = 'service_role');
exception when duplicate_object then null; end $$;

create or replace view vw_ledger_integrity as
with ordered as (
  select
    id, created_at, content_hash, prev_hash,
    lag(content_hash) over (order by created_at, id) as expected_prev,
    encode(digest(
      coalesce(symbol,'')              || '|' ||
      coalesce(decided_at::text,'')    || '|' ||
      coalesce(decision_type,'')       || '|' ||
      coalesce(intent,'')              || '|' ||
      coalesce(conviction::text,'')    || '|' ||
      coalesce(signal_snapshot::text,'') || '|' ||
      coalesce(rationale,'')           || '|' ||
      coalesce(prev_hash,'')
    , 'sha256'), 'hex') as recomputed_hash
  from decisions
)
select
  count(*)                                                                              as total,
  count(*) filter (where prev_hash is distinct from coalesce(expected_prev,''))         as broken_links,
  count(*) filter (where content_hash is distinct from recomputed_hash)                 as tampered_rows,
  (
    count(*) filter (where prev_hash is distinct from coalesce(expected_prev,'')) = 0 and
    count(*) filter (where content_hash is distinct from recomputed_hash) = 0
  )                                                                                      as chain_ok,
  max(created_at)                                                                        as last_decision_at
from ordered;
