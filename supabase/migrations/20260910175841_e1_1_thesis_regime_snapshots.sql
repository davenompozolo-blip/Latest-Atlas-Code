-- E1.1 -- snapshot the axis state a thesis was written under.
--
-- Master Build Spec §6.1. When a thesis is created or materially revised,
-- record where each axis stood. Drift between that snapshot and current state
-- is then a true, auditable statement -- "this thesis was written when
-- concentration was +2.2 sigma; it is now -1.0" -- and it needs no theme engine.
--
-- THE THESIS TABLE IS `bench_claims`, PK `id` (bigint, not derived from
-- content). §9.4's "no stable key -> hold E1.1" therefore does not apply.
--
-- NAMING DEVIATION, STATED SO IT CAN BE OVERRULED. The spec's field list says
-- `score_20d_z`. There is no z-scored column anywhere in the factor layer:
-- factor_axis_scores holds `score`, `score_20d` and `score_60d`, and
-- atlas_refresh_factor_scores writes score_20d as a rolling 20-SESSION SUM of
-- the daily score, not a sigma level (mean |score_20d| runs 3.3 to 5.8). Storing
-- a sum under a `_z` name is the fwd_pe failure exactly: a column whose name
-- asserts a measure it does not carry. The column is `score_20d`, and it holds
-- score_20d.

-- -- Dispersion state as of a score date --------------------------------------
-- Mirrors dispersionState() in src/pages/nexus/nexusAxesCompute.js. Computed
-- over NON-MARGINAL axes only, exactly as the panel does.
--
-- p_quiet mirrors QUIET_SIGMA (0.5) in that module. The two must move together;
-- that duplication is the one thing here §2.6 ("thresholds are rows, not
-- constants") would want closed, and it is flagged rather than closed because
-- the threshold itself is an open question with the product owner.
create or replace function public.atlas_axis_dispersion_state(p_date date,
                                                              p_quiet numeric default 0.5)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
    with inc as (
        select s.axis_key, s.score_20d
          from public.factor_axis_scores s
          join public.factor_axes a on a.axis_key = s.axis_key
         where s.date = p_date and a.marginal is not true and s.score_20d is not null
    )
    select case
        when (select count(*) from inc) < 2                              then 'insufficient_axes'
        when (select bool_and(abs(score_20d) < p_quiet) from inc)        then 'quiet'
        when (select count(distinct sign(score_20d)) from inc) = 1
         and (select bool_or(abs(score_20d) >= p_quiet) from inc)        then 'aligned'
        else 'contested'
    end;
$function$;

revoke execute on function public.atlas_axis_dispersion_state(date, numeric)
  from public, anon, authenticated;

-- -- The history ---------------------------------------------------------------
create table if not exists public.thesis_regime_snapshots (
    id              bigint generated always as identity primary key,
    thesis_id       bigint      not null references public.bench_claims(id) on delete cascade,
    snapshot_at     timestamptz not null default now(),
    snapshot_reason text        not null check (snapshot_reason in ('created', 'revised', 'backfill')),
    axis_key        text        not null references public.factor_axes(axis_key),
    -- The session the score came from. Never assumed to be the snapshot date:
    -- a thesis written on a Sunday, or before the nightly refresh, takes the
    -- most recent session on or before it. Published so a reader can see the
    -- gap rather than infer one.
    score_date      date,
    score_20d       numeric,
    score_60d       numeric,
    dispersion_state text       not null,
    logic_version   text        not null default 'v1',
    created_at      timestamptz not null default now(),
    unique (thesis_id, snapshot_at, axis_key, logic_version)
);

comment on table public.thesis_regime_snapshots is
'E1.1 -- append-only record of the intermarket axis state each bench_claims thesis was written under. One row per axis per snapshot. score_20d is factor_axis_scores.score_20d (a rolling 20-session SUM, NOT a z-score); the spec called it score_20d_z but no z-scored column exists. UPDATE is blocked by trigger; rows follow their claim on delete.';

create index if not exists thesis_regime_snapshots_thesis_idx
    on public.thesis_regime_snapshots (thesis_id, snapshot_at desc);

alter table public.thesis_regime_snapshots enable row level security;

-- Append-only, enforced rather than intended. UPDATE is what would corrupt the
-- history -- a row rewritten no longer records what was known at the time.
-- DELETE is left to the FK cascade: a snapshot is a history OF a claim, so it
-- is coherent for it to go when the claim does.
create or replace function public.atlas_block_snapshot_update()
returns trigger
language plpgsql
as $function$
begin
    raise exception 'thesis_regime_snapshots is append-only; UPDATE is refused (thesis_id=%, axis=%)',
        old.thesis_id, old.axis_key
        using hint = 'Write a new snapshot instead. A rewritten row no longer records what was known at snapshot_at.';
end;
$function$;

drop trigger if exists trg_thesis_regime_snapshots_append_only on public.thesis_regime_snapshots;
create trigger trg_thesis_regime_snapshots_append_only
    before update on public.thesis_regime_snapshots
    for each row execute function public.atlas_block_snapshot_update();
