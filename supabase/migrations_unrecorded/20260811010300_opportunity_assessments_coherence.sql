-- ATLAS Trade revamp, spec §7 — opportunity_assessments becomes the coherence
-- surface rather than a second table built beside it.
--
-- The table was designed narratively (verdict, thesis_integrity, synthesis,
-- verdict_condition, four dim_* dimensions) for the same problem Layer 3 solves
-- numerically. Per §7 and residual question 4, the two are complementary: the
-- numeric vector lands alongside the qualitative columns, synthesis carries the
-- tension statement, verdict_condition stays as the prose form of the trigger
-- whose evaluable form lives in trade_triggers.

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
  'Σ(w·s)/Σw over the family vector, w = conviction × confidence (spec §5.3).';
comment on column public.opportunity_assessments.alignment is
  '|Σ(w·s)|/Σ(w·|s|) — how much the families agree (spec §5.3). Net +0.4 at alignment 0.9 and net +0.4 at alignment 0.3 are entirely different trades.';
comment on column public.opportunity_assessments.dispersion is
  'Weighted standard deviation of s across families — whether disagreement is broad or comes from one dissenting family.';
comment on column public.opportunity_assessments.family_vector is
  'The full {family: {score, conviction, confidence}} vector the three numbers were computed from.';
comment on column public.opportunity_assessments.posture is
  'Derived from the net × alignment grid (spec §5.5). Advisory only — submit never disables on coherence.';

do $$ begin
  alter table public.opportunity_assessments
    add constraint opportunity_assessments_family_vector_is_object
    check (family_vector is null or jsonb_typeof(family_vector) = 'object');
exception when duplicate_object then null;
end $$;

create index if not exists opportunity_assessments_date_idx
  on public.opportunity_assessments (as_of_date desc);

-- Decision 5 in §10 names the shared coherence surface `signal_coherence`, and
-- §7 (written later, against the real schema) resolves it onto
-- opportunity_assessments. Both are satisfied by exposing the numeric layer
-- under the agreed name: Cortex can consume it for idea generation and Trade
-- for execution judgement without either owning the table.
create or replace view public.signal_coherence as
  select
    symbol,
    as_of_date,
    net,
    alignment,
    dispersion,
    dominant_family,
    family_vector,
    size_multiplier,
    posture,
    intended_side,
    synthesis        as tension_statement,
    verdict_condition,
    thesis_integrity,
    verdict,
    overridden_by_user,
    user_verdict,
    created_at
  from public.opportunity_assessments
  where net is not null;

comment on view public.signal_coherence is
  'Decision 5 (§10): the shared coherence surface. Neither Cortex nor Trade owns it — this is the numeric layer of opportunity_assessments under the agreed name.';
