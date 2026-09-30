-- E1.1 (cont.) -- one writer, used by the trigger and by the backfill alike.
-- Two code paths that must agree eventually disagree; this codebase has the
-- scar (atlas_verdict_preflight is shared between the position and segment jobs
-- for exactly this reason).

create or replace function public.atlas_snapshot_thesis_regime(p_thesis_id bigint,
                                                                p_as_of     date,
                                                                p_reason    text,
                                                                p_snapshot_at timestamptz default null,
                                                                p_logic_version text default 'v1')
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_score_date date;
    v_disp       text;
    v_rows       integer;
    v_at         timestamptz := coalesce(p_snapshot_at, now());
begin
    -- The most recent session ON OR BEFORE the thesis date -- never the nearest,
    -- and never today's. A thesis written on a Sunday, or before the 23:10
    -- refresh, was written under the last published scores, and that is what it
    -- must record.
    select max(date) into v_score_date
      from public.factor_axis_scores where date <= p_as_of;

    if v_score_date is null then
        -- No axis state existed yet. Write nothing rather than a zero row: an
        -- absent snapshot is legible, a fabricated one is not.
        return 0;
    end if;

    v_disp := public.atlas_axis_dispersion_state(v_score_date);

    insert into public.thesis_regime_snapshots
        (thesis_id, snapshot_at, snapshot_reason, axis_key, score_date,
         score_20d, score_60d, dispersion_state, logic_version)
    select p_thesis_id, v_at, p_reason, s.axis_key, s.date,
           s.score_20d, s.score_60d, v_disp, p_logic_version
      from public.factor_axis_scores s
     where s.date = v_score_date
    on conflict (thesis_id, snapshot_at, axis_key, logic_version) do nothing;

    get diagnostics v_rows = row_count;
    return v_rows;
end;
$function$;

revoke execute on function public.atlas_snapshot_thesis_regime(bigint, date, text, timestamptz, text)
  from public, anon, authenticated;

-- -- Trigger: snapshot on creation, and on a revision that changes the claim ---
-- A trigger rather than an application call, deliberately. The spec says the
-- snapshot is written "on thesis creation and on any revision that changes the
-- thesis's claim"; a constraint the writer cannot forget beats a convention it
-- might. Same argument as the verdict invariants living in CHECKs.
create or replace function public.atlas_bench_claim_snapshot_tg()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
    if tg_op = 'INSERT' then
        perform public.atlas_snapshot_thesis_regime(
            new.id,
            (new.created_at at time zone 'America/New_York')::date,
            'created',
            new.created_at);
    elsif tg_op = 'UPDATE' and new.claim_text is distinct from old.claim_text then
        -- Only a changed CLAIM is a revision. A status move (untested ->
        -- bending) is the thesis being graded, not rewritten, and snapshotting
        -- there would reset the very baseline the drift is measured from.
        perform public.atlas_snapshot_thesis_regime(
            new.id,
            (now() at time zone 'America/New_York')::date,
            'revised',
            now());
    end if;
    return new;
end;
$function$;

drop trigger if exists trg_bench_claims_regime_snapshot on public.bench_claims;
create trigger trg_bench_claims_regime_snapshot
    after insert or update of claim_text on public.bench_claims
    for each row execute function public.atlas_bench_claim_snapshot_tg();
