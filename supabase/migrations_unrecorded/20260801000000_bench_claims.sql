-- The Bench, spec §3.2 — theses decompose into claims; claims meet evidence.
-- Applied 2026-08-01.
create table if not exists public.bench_claims (
  id                bigint generated always as identity primary key,
  symbol            text not null,
  thesis_ref        text,
  claim_text        text not null,
  status            text not null default 'pending'
                    check (status in ('pending','confirmed','contradicted')),
  evidence_text     text,
  evidence_value    numeric,
  evidence_source   text,
  status_changed_at timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists bench_claims_symbol_idx on public.bench_claims (symbol);
-- claim reconciliation matches on (symbol, claim_text) so the extractor can
-- upsert instead of duplicating on every Bench refresh (spec §3.2).
create unique index if not exists bench_claims_symbol_claim_uidx
  on public.bench_claims (symbol, md5(claim_text));

-- status_changed_at is what pins claim markers to the tape in the jaws chart,
-- so it must be stamped by the database, not trusted to the caller.
create or replace function public.bench_claims_stamp_status_change()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.status is distinct from 'pending' then new.status_changed_at := now(); end if;
  elsif new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end $$;

drop trigger if exists bench_claims_status_stamp on public.bench_claims;
create trigger bench_claims_status_stamp
  before insert or update on public.bench_claims
  for each row execute function public.bench_claims_stamp_status_change();

-- RLS: read for the front end, write for the assessment writer. Explicit
-- INSERT/UPDATE policies so the writer cannot fail silently the way
-- opportunity_assessments did (that table had SELECT only — see next migration).
alter table public.bench_claims enable row level security;

drop policy if exists bench_claims_anon_read on public.bench_claims;
create policy bench_claims_anon_read on public.bench_claims
  for select to anon, authenticated using (true);

drop policy if exists bench_claims_anon_insert on public.bench_claims;
create policy bench_claims_anon_insert on public.bench_claims
  for insert to anon, authenticated with check (true);

drop policy if exists bench_claims_anon_update on public.bench_claims;
create policy bench_claims_anon_update on public.bench_claims
  for update to anon, authenticated using (true) with check (true);
