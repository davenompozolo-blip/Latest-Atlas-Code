create table if not exists public.trade_triggers (
  id             uuid primary key default gen_random_uuid(),
  symbol         text not null,
  decision_id    uuid references public.decisions (id),
  assessment_id  bigint references public.opportunity_assessments (id),
  trigger_type   text not null
                 check (trigger_type in ('price','iv','event','relative_strength','valuation')),
  condition      jsonb not null,
  description    text not null,
  detail         text,
  status         text not null default 'armed'
                 check (status in ('armed','fired','expired','cancelled')),
  armed_at       timestamptz not null default now(),
  expires_at     date,
  fired_at       timestamptz,
  fired_value    numeric,
  last_checked_at timestamptz,
  last_observed  jsonb,
  intent_payload jsonb not null default '{}'::jsonb,
  notified_at    timestamptz,
  created_at     timestamptz not null default now()
);

comment on table public.trade_triggers is
  'Armed conditions with a lifecycle (spec 5.7). Any posture other than Act must emit at least one of these.';

create index if not exists trade_triggers_armed_idx
  on public.trade_triggers (status, symbol) where status = 'armed';
create index if not exists trade_triggers_symbol_idx
  on public.trade_triggers (symbol, armed_at desc);
create index if not exists trade_triggers_decision_idx
  on public.trade_triggers (decision_id);

create or replace function public.expire_stale_trade_triggers()
returns integer language plpgsql as $$
declare
  n integer;
begin
  update public.trade_triggers
     set status = 'expired', last_checked_at = now()
   where status = 'armed'
     and expires_at is not null
     and expires_at < current_date;
  get diagnostics n = row_count;
  return n;
end $$;

alter table public.trade_triggers enable row level security;
drop policy if exists trade_triggers_read on public.trade_triggers;
create policy trade_triggers_read on public.trade_triggers for select to anon, authenticated using (true);
drop policy if exists trade_triggers_write on public.trade_triggers;
create policy trade_triggers_write on public.trade_triggers for all to anon, authenticated using (true) with check (true);
