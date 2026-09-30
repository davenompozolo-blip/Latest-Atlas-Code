alter table public.opportunity_assessments
  add column if not exists net             numeric check (net >= -1 and net <= 1),
  add column if not exists alignment       numeric check (alignment >= 0 and alignment <= 1),
  add column if not exists dispersion      numeric check (dispersion >= 0),
  add column if not exists dominant_family text,
  add column if not exists family_vector   jsonb,
  add column if not exists size_multiplier numeric check (size_multiplier > 0 and size_multiplier <= 1),
  add column if not exists posture         text
    check (posture in ('act','scale_in','wait_for_trigger','stand_down')),
  add column if not exists intended_side   text check (intended_side in ('buy','sell'));

comment on column public.opportunity_assessments.net is
  'Sum(w*s)/Sum(w) over the family vector, w = conviction x confidence (spec 5.3).';
comment on column public.opportunity_assessments.alignment is
  'abs(Sum(w*s))/Sum(w*abs(s)) - how much the families agree (spec 5.3).';
comment on column public.opportunity_assessments.dispersion is
  'Weighted standard deviation of s across families - whether disagreement is broad or comes from one dissenting family.';
comment on column public.opportunity_assessments.family_vector is
  'The full {family: {score, conviction, confidence}} vector the three numbers were computed from.';
comment on column public.opportunity_assessments.posture is
  'Derived from the net x alignment grid (spec 5.5). Advisory only - submit never disables on coherence.';

do $$ begin
  alter table public.opportunity_assessments
    add constraint opportunity_assessments_family_vector_is_object
    check (family_vector is null or jsonb_typeof(family_vector) = 'object');
exception when duplicate_object then null;
end $$;

create index if not exists opportunity_assessments_date_idx
  on public.opportunity_assessments (as_of_date desc);

create or replace view public.signal_coherence as
  select
    symbol, as_of_date, net, alignment, dispersion, dominant_family, family_vector,
    size_multiplier, posture, intended_side,
    synthesis as tension_statement,
    verdict_condition, thesis_integrity, verdict, overridden_by_user, user_verdict, created_at
  from public.opportunity_assessments
  where net is not null;

comment on view public.signal_coherence is
  'Decision 5 (section 10): the shared coherence surface. Neither Cortex nor Trade owns it - this is the numeric layer of opportunity_assessments under the agreed name.';
