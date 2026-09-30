alter table public.bench_claims
  add column if not exists falsifier_text     text,
  add column if not exists review_by          date,
  add column if not exists origin_decision_id uuid;

comment on column public.bench_claims.falsifier_text is
  'What would falsify the claim, stated as an observable (spec 4.2). A claim without one is an opinion.';
comment on column public.bench_claims.review_by is
  'By when you expect to know (spec 4.2). Drives the review queue in the blotter.';
comment on column public.bench_claims.origin_decision_id is
  'The intent row that created or amended this claim. Back-link for section 6 review analytics.';

do $$ begin
  alter table public.bench_claims
    add constraint bench_claims_origin_decision_fkey
    foreign key (origin_decision_id) references public.decisions (id);
exception when duplicate_object then null;
end $$;

alter table public.bench_claims drop constraint if exists bench_claims_status_check;
alter table public.bench_claims
  add constraint bench_claims_status_check
  check (status in ('pending','untested','intact','bending','broken','confirmed','contradicted','expired'));

create or replace function public.bench_claims_stamp_status_change()
returns trigger language plpgsql as $$
declare
  unresolved constant text[] := array['pending','untested'];
begin
  if tg_op = 'INSERT' then
    if not (new.status = any(unresolved)) then new.status_changed_at := now(); end if;
  elsif new.status is distinct from old.status then
    if new.status = any(unresolved) then new.status_changed_at := null;
    else new.status_changed_at := now(); end if;
  end if;
  return new;
end $$;

create index if not exists bench_claims_review_by_idx
  on public.bench_claims (review_by) where review_by is not null;
create index if not exists bench_claims_origin_decision_idx
  on public.bench_claims (origin_decision_id);
