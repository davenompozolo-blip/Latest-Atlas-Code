-- Portfolio-context assessment of an opportunity (the LLM re-cast of a scrapbook
-- thesis against the actual book). Populated by a scheduled job for the top of
-- the ledger only; the page reads it, never generates it live. Ships RLS-on.
create table if not exists public.opportunity_assessments (
  id            bigint generated always as identity primary key,
  symbol        text not null,
  as_of_date    date not null default current_date,
  context_hash  text,
  survives      text,           -- 'holds_up' | 'conditional' | 'weak_in_context'
  portfolio_verdict text,
  dim_holdings  text,
  dim_regime    text,
  dim_liquidity text,
  dim_oppcost   text,
  swap_source   text,
  model_used    text,
  prompt_version text,
  created_at    timestamptz default now(),
  unique (symbol, as_of_date)
);
alter table public.opportunity_assessments enable row level security;
drop policy if exists "read opportunity assessments" on public.opportunity_assessments;
create policy "read opportunity assessments" on public.opportunity_assessments
  for select to anon, authenticated using (true);
