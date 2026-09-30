-- ATLAS Trade revamp, spec §7 "Extend" — decisions becomes the intent table.
--
-- The governing constraint from the spec: "Preserve the hash chain: any new
-- column must be inside the content_hash computation or the chain silently
-- stops meaning anything." That is the whole reason this migration is shaped
-- the way it is.
--
-- Three things have to stay true at once:
--   1. The 141 existing rows keep their hashes. They were computed over the v1
--      canon and nothing may rewrite them — decisions is append-only, guarded
--      by the deny_mutation trigger, so nothing CAN.
--   2. Every new row hashes over the sizing and coherence columns as well, or
--      an override could be edited after the fact without breaking the chain.
--   3. vw_ledger_integrity has to keep returning chain_ok = true. It currently
--      inlines a copy of the v1 canon, so extending the trigger alone would
--      make every new row report as tampered.
--
-- The fix for (3) is to stop having two copies of the canon at all: one
-- function, called by both the trigger and the view, versioned by the
-- hash_version column. Old rows carry NULL there and hash as v1; new rows carry
-- 2 and hash as v2. The version marker is itself inside the v2 canon, so it
-- cannot be flipped to downgrade a row's verification.

alter table public.decisions
  add column if not exists sizing_method         text,
  add column if not exists pct_of_equity         numeric,
  -- Display-only second reading (spec §4.1). Stored so the intent record shows
  -- what was on screen; nothing downstream computes from it, ever.
  add column if not exists pct_of_gross          numeric,
  add column if not exists risk_budget_bps       numeric,
  add column if not exists model_qty             numeric,
  add column if not exists submitted_qty         numeric,
  add column if not exists is_override           boolean,
  add column if not exists override_reason       text,
  add column if not exists book_impact           jsonb,
  add column if not exists universe_context      jsonb,
  add column if not exists coherence_net         numeric,
  add column if not exists coherence_alignment   numeric,
  add column if not exists coherence_dispersion  numeric,
  add column if not exists size_multiplier       numeric,
  add column if not exists multiplier_applied    boolean,
  add column if not exists claim_id              bigint,
  -- No DEFAULT on purpose. ADD COLUMN ... DEFAULT does not fire row triggers,
  -- so a default of 2 would silently stamp the 141 pre-existing v1 rows with a
  -- version they were never hashed under. NULL means v1.
  add column if not exists hash_version          int;

comment on column public.decisions.pct_of_gross is
  'Display-only second reading of the trade size against long market value (spec §4.1). Equity is the denominator for every calculation; nothing is derived from this column.';
comment on column public.decisions.hash_version is
  'Canon version used to compute content_hash. NULL = v1 (pre-Trade-revamp rows), 2 = v2 (sizing and coherence columns inside the hash).';

do $$ begin
  alter table public.decisions
    add constraint decisions_claim_id_fkey
    foreign key (claim_id) references public.bench_claims (id);
exception when duplicate_object then null;
end $$;

-- decision_type widening (spec §7): without 'passed' and 'deferred' there is no
-- control group, and §6's whole review loop needs one. Constrained rather than
-- left free text so a typo cannot quietly create a fourth population.
do $$ begin
  alter table public.decisions
    add constraint decisions_decision_type_check
    check (decision_type in ('executed','passed','deferred'));
exception when duplicate_object then null;
end $$;

-- ── The single canon ─────────────────────────────────────────────────────────
-- One definition, two callers (the insert trigger and vw_ledger_integrity), so
-- the two can never drift apart again.
create or replace function public.decisions_canon(d public.decisions)
returns text language sql immutable as $$
  select case when coalesce(d.hash_version, 1) >= 2 then
    -- v2: v1 fields, then every field the Trade module writes, then prev_hash.
    coalesce(d.symbol,'')                || '|' ||
    coalesce(d.decided_at::text,'')      || '|' ||
    coalesce(d.decision_type,'')         || '|' ||
    coalesce(d.intent,'')                || '|' ||
    coalesce(d.conviction::text,'')      || '|' ||
    coalesce(d.signal_snapshot::text,'') || '|' ||
    coalesce(d.rationale,'')             || '|' ||
    'v'  || d.hash_version::text         || '|' ||
    coalesce(d.sizing_method,'')         || '|' ||
    coalesce(d.pct_of_equity::text,'')   || '|' ||
    coalesce(d.pct_of_gross::text,'')    || '|' ||
    coalesce(d.risk_budget_bps::text,'') || '|' ||
    coalesce(d.model_qty::text,'')       || '|' ||
    coalesce(d.submitted_qty::text,'')   || '|' ||
    coalesce(d.is_override::text,'')     || '|' ||
    coalesce(d.override_reason,'')       || '|' ||
    coalesce(d.book_impact::text,'')     || '|' ||
    coalesce(d.universe_context::text,'')|| '|' ||
    coalesce(d.coherence_net::text,'')   || '|' ||
    coalesce(d.coherence_alignment::text,'')  || '|' ||
    coalesce(d.coherence_dispersion::text,'') || '|' ||
    coalesce(d.size_multiplier::text,'') || '|' ||
    coalesce(d.multiplier_applied::text,'')   || '|' ||
    coalesce(d.claim_id::text,'')        || '|' ||
    coalesce(d.prev_hash,'')
  else
    -- v1: byte-for-byte what decisions_hash_chain() computed before this
    -- migration. Do not touch — the 141 existing hashes depend on it.
    coalesce(d.symbol,'')                || '|' ||
    coalesce(d.decided_at::text,'')      || '|' ||
    coalesce(d.decision_type,'')         || '|' ||
    coalesce(d.intent,'')                || '|' ||
    coalesce(d.conviction::text,'')      || '|' ||
    coalesce(d.signal_snapshot::text,'') || '|' ||
    coalesce(d.rationale,'')             || '|' ||
    coalesce(d.prev_hash,'')
  end
$$;

create or replace function public.decisions_hash_chain()
returns trigger language plpgsql as $function$
declare
  last_hash text;
begin
  new.created_at := clock_timestamp();
  perform pg_advisory_xact_lock(hashtext('atlas_decisions_chain'));
  select content_hash into last_hash from decisions order by seq desc limit 1;
  new.prev_hash    := coalesce(last_hash, '');
  new.hash_version := 2;
  new.content_hash := encode(digest(public.decisions_canon(new), 'sha256'), 'hex');
  return new;
end $function$;

-- Version-aware integrity check. Same three questions as before (are the links
-- intact, do the bodies still hash to their stored hash, is the whole chain
-- sound), now correct across both canon versions, plus a per-version count so a
-- future migration cannot quietly strand a generation of rows.
--
-- Dropped rather than replaced because the two new columns land before
-- last_decision_at, and CREATE OR REPLACE VIEW cannot reorder or insert columns.
drop view if exists public.vw_ledger_integrity;
create view public.vw_ledger_integrity as
  with ordered as (
    select
      d.id,
      d.created_at,
      d.content_hash,
      d.prev_hash,
      coalesce(d.hash_version, 1) as hash_version,
      lag(d.content_hash) over (order by d.seq) as expected_prev,
      encode(digest(public.decisions_canon(d), 'sha256'), 'hex') as recomputed_hash
    from public.decisions d
  )
  select
    count(*) as total,
    count(*) filter (where prev_hash is distinct from coalesce(expected_prev, '')) as broken_links,
    count(*) filter (where content_hash is distinct from recomputed_hash) as tampered_rows,
    (count(*) filter (where prev_hash is distinct from coalesce(expected_prev, '')) = 0
     and count(*) filter (where content_hash is distinct from recomputed_hash) = 0) as chain_ok,
    count(*) filter (where hash_version = 1) as v1_rows,
    count(*) filter (where hash_version = 2) as v2_rows,
    max(created_at) as last_decision_at
  from ordered;

create index if not exists decisions_symbol_seq_idx on public.decisions (symbol, seq desc);
create index if not exists decisions_claim_id_idx   on public.decisions (claim_id);
