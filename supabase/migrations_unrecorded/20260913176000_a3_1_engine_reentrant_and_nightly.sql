-- Two things: the evaluator becomes re-entrant within a transaction, and the
-- nightly job that calls it.
--
-- RE-ENTRANCY matters because the reproducibility check in section 6 is "run the
-- backfill again from scratch and confirm it reproduces". The temp tables are
-- ON COMMIT DROP, so a second call inside the same transaction failed with
-- "relation _tm already exists" -- the check the spec asks for was the one
-- thing the function could not do. Dropped explicitly at entry instead.
--
-- Everything else in the evaluator is identical to the iteration this squashes
-- (see 20260913177000 for the list), except that the two ->> integer
-- extractions now go through safe_bigint.

drop function if exists public.atlas_evaluate_themes(text, date, date, text);

create or replace function public.atlas_evaluate_themes(
  p_logic_version text default 'v0-uncalibrated',
  p_from          date default null,
  p_to            date default null,
  p_baseline_mode text default 'episode_frozen'
) returns table(
  theme_key text, sessions int, transitions int,
  first_as_of date, last_as_of date, digest text
)
language plpgsql
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_theme      record;
  v_row        record;
  v_trg        jsonb;
  v_i          int;
  v_freeze     boolean := (p_baseline_mode = 'episode_frozen');

  st           text;
  prev_st      text;
  runs         jsonb;
  extremes     jsonb;
  an_base      jsonb;
  ep_open      boolean;
  n_emg_hold   int;
  n_no_emg     int;
  v_sessions   int;
  v_trans      int;

  eff          jsonb;
  ev           jsonb;
  comp         jsonb;
  m            numeric;
  thr          numeric;
  op           text;
  meas         text;
  role_        text;
  tkey         text;
  olabel       text;
  okind        text;
  ounits       text;
  rawv         numeric;
  basev        numeric;
  hold_req     int;
  run_n        int;
  passed       boolean;
  ex           numeric;
  ratio        numeric;
  n_emg        int;
  n_abs        int;
  n_abt        int;
  n_exh        int;
  n_cfm        int;
  emg_all      boolean;
  abs_all      boolean;
  abt_any      boolean;
  exh_any      boolean;
  cfm_all      boolean;
  sum_ratio    numeric;
  sum_held     numeric;
  strength_    numeric;
  new_st       text;
  fired        jsonb;
  positive_keys text[];
  pos_all      boolean;
begin
  if p_baseline_mode not in ('episode_frozen','rolling') then
    raise exception 'p_baseline_mode must be episode_frozen or rolling, got %', p_baseline_mode;
  end if;

  drop table if exists pg_temp._tm;
  drop table if exists pg_temp._start;
  drop table if exists pg_temp._states_out;
  drop table if exists pg_temp._trans_out;

  create temp table _tm on commit drop as
  select t.theme_key    as tm_theme,
         mm.date        as tm_date,
         t.trigger_key, t.role, t.operator, t.measure,
         t.threshold, t.threshold_units,
         coalesce(t.hold_sessions, 1) as hold_sessions,
         t.operand_kind,
         coalesce(t.series_key, t.axis_key, t.pair_key)
           || coalesce(':' || t.baseline_window::text, '')  as operand_label,
         mm.m_value, mm.m_units, mm.raw_value, mm.baseline_mean
    from public.regime_theme_triggers t
    join public.regime_themes th on th.theme_key = t.theme_key and th.active
    left join public.vw_theme_operand_measures mm
      on mm.operand_kind = t.operand_kind
     and mm.operand_key  = coalesce(t.series_key, t.axis_key, t.pair_key)
     and mm.baseline_window is not distinct from t.baseline_window
   where t.logic_version = p_logic_version;

  create index on _tm (tm_theme, tm_date);

  create temp table _start on commit drop as
  select f.tm_theme as st_theme, max(f.first_m) as start_date
    from (
      select x.tm_theme, x.operand_label,
             min(x.tm_date) filter (where x.m_value is not null) as first_m
        from _tm x
       where x.role in ('emergence','absorption','abort')
         and x.measure <> 'retrace_of_episode_move'
       group by x.tm_theme, x.operand_label
    ) f
   group by f.tm_theme;

  create temp table _states_out (
    o_theme text, as_of date, state text, strength numeric, evidence jsonb
  ) on commit drop;
  create temp table _trans_out (
    o_theme text, as_of date, from_state text, to_state text, triggered_by jsonb
  ) on commit drop;

  for v_theme in
    select s.st_theme, s.start_date from _start s order by s.st_theme
  loop
    st := 'dormant'; runs := '{}'::jsonb; extremes := '{}'::jsonb; an_base := '{}'::jsonb;
    ep_open := false; n_emg_hold := 0; n_no_emg := 0;
    v_sessions := 0; v_trans := 0;

    select array_agg(q.trigger_key) into positive_keys
      from (select distinct x.trigger_key from _tm x
             where x.tm_theme = v_theme.st_theme
               and x.role = 'emergence'
               and x.operator in ('gte','abs_gte')
               and x.measure <> 'retrace_of_episode_move') q;

    for v_row in
      select x.tm_date as d, jsonb_agg(to_jsonb(x.*) order by x.trigger_key) as trg
        from _tm x
       where x.tm_theme = v_theme.st_theme
         and x.tm_date >= v_theme.start_date
         and (p_from is null or x.tm_date >= p_from)
         and (p_to   is null or x.tm_date <= p_to)
       group by x.tm_date
       order by x.tm_date
    loop
      eff := '{}'::jsonb;
      for v_i in 0 .. jsonb_array_length(v_row.trg) - 1 loop
        v_trg  := v_row.trg -> v_i;
        tkey   := v_trg ->> 'trigger_key';
        okind  := v_trg ->> 'operand_kind';
        olabel := v_trg ->> 'operand_label';
        ounits := v_trg ->> 'm_units';
        m      := (v_trg ->> 'm_value')::numeric;
        rawv   := (v_trg ->> 'raw_value')::numeric;
        basev  := (an_base ->> olabel)::numeric;
        if v_freeze and okind = 'series' and basev is not null and rawv is not null
           and (ep_open or (v_trg ->> 'measure') = 'retrace_of_episode_move') then
          if ounits = 'pct' then
            m := case when basev <> 0 then (rawv / basev - 1) * 100 end;
          else
            m := (rawv - basev) * 100;
          end if;
        end if;
        if m is not null then
          eff := jsonb_set(eff, array[tkey], to_jsonb(m), true);
        end if;
      end loop;

      pos_all := true;
      for v_i in 0 .. jsonb_array_length(v_row.trg) - 1 loop
        v_trg := v_row.trg -> v_i;
        tkey  := v_trg ->> 'trigger_key';
        if tkey = any (positive_keys) then
          m   := (eff ->> tkey)::numeric;
          thr := (v_trg ->> 'threshold')::numeric;
          op  := v_trg ->> 'operator';
          if m is null
             or (op = 'gte'     and not (m >= thr))
             or (op = 'abs_gte' and not (abs(m) >= thr)) then
            pos_all := false;
          end if;
        end if;
      end loop;

      if pos_all and not ep_open then
        ep_open := true; extremes := '{}'::jsonb; an_base := '{}'::jsonb;
        for v_i in 0 .. jsonb_array_length(v_row.trg) - 1 loop
          v_trg := v_row.trg -> v_i;
          if (v_trg ->> 'operand_kind') = 'series'
             and jsonb_typeof(v_trg -> 'baseline_mean') = 'number' then
            an_base := jsonb_set(an_base, array[v_trg ->> 'operand_label'],
                                 v_trg -> 'baseline_mean', true);
          end if;
        end loop;
      elsif not pos_all and ep_open then
        ep_open := false;
      end if;

      if ep_open then
        for v_i in 0 .. jsonb_array_length(v_row.trg) - 1 loop
          v_trg  := v_row.trg -> v_i;
          olabel := v_trg ->> 'operand_label';
          m      := (eff ->> (v_trg ->> 'trigger_key'))::numeric;
          if m is not null then
            ex := (extremes ->> olabel)::numeric;
            if ex is null or abs(m) > abs(ex) then
              extremes := jsonb_set(extremes, array[olabel], to_jsonb(m), true);
            end if;
          end if;
        end loop;
      end if;

      ev := '[]'::jsonb;
      n_emg := 0; n_abs := 0; n_abt := 0; n_exh := 0; n_cfm := 0;
      emg_all := true; abs_all := true; abt_any := false; exh_any := false; cfm_all := true;
      sum_ratio := 0; sum_held := 0;
      fired := '[]'::jsonb;

      for v_i in 0 .. jsonb_array_length(v_row.trg) - 1 loop
        v_trg    := v_row.trg -> v_i;
        tkey     := v_trg ->> 'trigger_key';
        role_    := v_trg ->> 'role';
        op       := v_trg ->> 'operator';
        meas     := v_trg ->> 'measure';
        thr      := (v_trg ->> 'threshold')::numeric;
        -- safe_bigint, never a bare ::int. Both of these are engine-authored
        -- rather than vendor JSON -- a hold window copied from an int column,
        -- and a run counter this function wrote with to_jsonb -- so neither can
        -- realistically be malformed. The data-trust rule has no carve-out for
        -- "this one is ours", and a bare cast that throws inside a nightly job
        -- aborts the whole run: the same reasoning that made the job 28 cursor
        -- cast a real defect rather than a lint nit.
        hold_req := greatest(coalesce(public.safe_bigint(v_trg ->> 'hold_sessions')::int, 1), 1);
        olabel   := v_trg ->> 'operand_label';
        m        := (eff ->> tkey)::numeric;

        if meas = 'retrace_of_episode_move' then
          ex := (extremes ->> olabel)::numeric;
          if ex is null or ex = 0 or m is null then
            m := 0;
          else
            m := least(greatest((ex - m) / ex, 0), 1) * 100;
          end if;
        end if;

        passed := case
          when m is null then false
          when op = 'gte'        then m >= thr
          when op = 'lte'        then m <= thr
          when op = 'abs_gte'    then abs(m) >= thr
          when op = 'abs_lte'    then abs(m) <= thr
          when op = 'pct_gte'    then m >= thr
          when op = 'retrace_gt' then m > thr
          else false end;

        run_n := coalesce(public.safe_bigint(runs ->> tkey)::int, 0);
        run_n := case when passed then run_n + 1 else 0 end;
        runs  := jsonb_set(runs, array[tkey], to_jsonb(run_n), true);

        ev := ev || jsonb_build_object(
          'trigger_key',    tkey,
          'role',           role_,
          'operand',        olabel,
          'operand_kind',   v_trg ->> 'operand_kind',
          'measure',        meas,
          'operator',       op,
          'observed',       case when m is null then null else round(m, 6) end,
          'observed_units', case when meas = 'retrace_of_episode_move'
                                 then 'pct' else v_trg ->> 'm_units' end,
          'threshold',      thr,
          'threshold_units', v_trg ->> 'threshold_units',
          'raw_value',      v_trg -> 'raw_value',
          'baseline_rolling', v_trg -> 'baseline_mean',
          'baseline_used',  case when v_freeze then an_base -> olabel end,
          'episode_extreme', case when meas = 'retrace_of_episode_move'
                                  then extremes -> olabel end,
          'sessions_held',  run_n,
          'hold_required',  hold_req,
          'pass',           passed,
          'holds',          (run_n >= hold_req));

        if role_ = 'emergence' then
          n_emg := n_emg + 1;
          if run_n < hold_req then emg_all := false; end if;
          if m is null then ratio := 0;
          elsif thr = 0 then ratio := case when passed then 1 else 0 end;
          elsif op in ('gte','abs_gte','pct_gte','retrace_gt') then
            ratio := least(greatest(abs(m) / abs(thr), 0), 1);
          else
            ratio := least(greatest(1 - abs(m) / abs(thr), 0), 1);
          end if;
          sum_ratio := sum_ratio + ratio;
          sum_held  := sum_held + least(run_n::numeric / hold_req, 1);
        elsif role_ = 'absorption' then
          n_abs := n_abs + 1;
          if run_n < hold_req then abs_all := false; end if;
        elsif role_ = 'abort' then
          n_abt := n_abt + 1;
          if run_n >= hold_req then
            abt_any := true;
            fired := fired || jsonb_build_object('trigger_key', tkey, 'role', role_,
                                                 'observed', round(m, 6));
          end if;
        elsif role_ = 'exhaustion' then
          n_exh := n_exh + 1;
          if run_n >= hold_req then exh_any := true; end if;
        elsif role_ = 'confirmation' then
          n_cfm := n_cfm + 1;
          if not passed then cfm_all := false; end if;
        end if;
      end loop;

      if n_emg = 0 then emg_all := false; end if;
      if n_abs = 0 then abs_all := false; end if;
      if n_cfm = 0 then cfm_all := false; end if;

      strength_ := case when n_emg = 0 then null
                        else round((sum_ratio / n_emg) * (sum_held / n_emg), 6) end;

      if emg_all then n_emg_hold := n_emg_hold + 1; n_no_emg := 0;
      else            n_emg_hold := 0;              n_no_emg := n_no_emg + 1;
      end if;

      prev_st := st;
      new_st  := st;

      if abt_any and st <> 'aborted' then
        new_st := 'aborted';
      elsif st = 'established' and exh_any then
        new_st := 'exhausted';
      elsif st = 'dormant' and abs_all then
        new_st := 'absorbed';
      elsif st = 'dormant' and emg_all then
        new_st := 'emerging';
      elsif st = 'emerging' and emg_all and n_emg_hold >= 40 then
        new_st := 'established';
      elsif st <> 'dormant' and n_no_emg >= 60 then
        new_st := 'dormant';
      end if;

      if new_st <> st then
        v_trans := v_trans + 1;
        insert into _trans_out values (
          v_theme.st_theme, v_row.d, st, new_st,
          jsonb_build_object(
            'emergence_conjunction_holds', emg_all,
            'absorption_conjunction_holds', abs_all,
            'abort_fired', abt_any,
            'exhaustion_fired', exh_any,
            'confirmation_passes', cfm_all,
            'sessions_emergence_held', n_emg_hold,
            'sessions_emergence_not_held', n_no_emg,
            'strength', strength_,
            'fired', fired));
        st := new_st;
        n_no_emg := 0; n_emg_hold := 0;
        if st = 'dormant' then
          extremes := '{}'::jsonb; an_base := '{}'::jsonb; ep_open := false;
        end if;
      end if;

      comp := jsonb_build_object(
        'state', st,
        'previous_state', prev_st,
        'logic_version', p_logic_version,
        'baseline_mode', p_baseline_mode,
        'emergence_rows', n_emg,
        'emergence_conjunction_holds', emg_all,
        'absorption_conjunction_holds', abs_all,
        'abort_fired', abt_any,
        'exhaustion_fired', exh_any,
        'confirmation_passes', cfm_all,
        'confirmation_is_gating', false,
        'episode_open', ep_open,
        'episode_baselines', an_base,
        'episode_extremes', extremes,
        'sessions_emergence_held', n_emg_hold,
        'sessions_emergence_not_held', n_no_emg,
        'strength_mean_ratio', round(case when n_emg = 0 then 0 else sum_ratio / n_emg end, 6),
        'strength_held_fraction', round(case when n_emg = 0 then 0 else sum_held / n_emg end, 6),
        'strength', strength_,
        'triggers', ev);

      insert into _states_out values (v_theme.st_theme, v_row.d, st, strength_, comp);
      v_sessions := v_sessions + 1;
    end loop;

    theme_key   := v_theme.st_theme;
    sessions    := v_sessions;
    transitions := v_trans;
    select min(s.as_of), max(s.as_of),
           md5(string_agg(s.as_of::text || '|' || s.state || '|' ||
                          coalesce(round(s.strength, 6)::text, 'null'), E'\n' order by s.as_of))
      into first_as_of, last_as_of, digest
      from _states_out s where s.o_theme = v_theme.st_theme;
    return next;
  end loop;
end;
$fn$;

revoke execute on function public.atlas_evaluate_themes(text, date, date, text)
  from public, anon, authenticated;

-- ------------------------------------------------------------------
-- The nightly job. Shadow mode: writes the history, renders nothing.
-- ------------------------------------------------------------------
create or replace function public.atlas_write_theme_states()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_log_id  bigint;
  v_macro   text;
  v_factor  text;
  v_spine   date;
  v_written int;
  v_trans   int;
  v_present int;
  v_digest  text;
  v_status  text;
  v_reason  text;
begin
  insert into public.sync_log (function_name, status, source, details)
  values ('atlas_write_theme_states', 'running', 'pg_cron',
          jsonb_build_object('logic_version', 'v0-uncalibrated',
                             'gate', 'load_macro_series and atlas_refresh_factor_scores today'))
  returning id into v_log_id;

  -- GATE ON WHAT THE WRITER LOGS, not on what the cron job is called. The macro
  -- load's rows carry function_name = 'load_macro_series' and the factor
  -- refresh's carry 'atlas_refresh_factor_scores' -- the EDGE FUNCTION and the
  -- inner function respectively, neither of which is its job name.
  select s.status into v_macro from public.sync_log s
   where s.function_name = 'load_macro_series' and s.started_at::date = current_date
   order by s.id desc limit 1;

  -- 'skipped' is a pass for the factor job: it logs skipped on an idempotent
  -- re-run, which means the score layer is already current for this session.
  -- The macro loader has no such path -- it answers error on a no-op -- so only
  -- success counts there.
  select s.status into v_factor from public.sync_log s
   where s.function_name = 'atlas_refresh_factor_scores' and s.started_at::date = current_date
   order by s.id desc limit 1;

  select max(p.date) into v_spine from public.market_prices p where p.symbol = 'SPY';

  if v_macro is distinct from 'success'
     or coalesce(v_factor, '(none)') not in ('success', 'skipped') then
    -- VALIDATE BEFORE YOU WRITE, and refuse with an UPDATE rather than a RAISE:
    -- a RAISE rolls back its own sync_log row and the refusal then exists only
    -- in cron.job_run_details, which nothing on this platform monitors.
    update public.sync_log
       set status = 'skipped', finished_at = clock_timestamp(),
           details = details || jsonb_build_object(
             'reason', format('upstream not ready: load_macro_series=%s, atlas_refresh_factor_scores=%s',
                              coalesce(v_macro, '(has not run today)'),
                              coalesce(v_factor, '(has not run today)')),
             'macro_status', v_macro, 'factor_status', v_factor, 'session', v_spine)
     where id = v_log_id;
    return;
  end if;

  perform public.atlas_evaluate_themes('v0-uncalibrated');
  select p.states_written, p.transitions_written into v_written, v_trans
    from public.atlas_persist_theme_run('v0-uncalibrated') p;

  select count(*) into v_present from public.regime_theme_states r
   where r.logic_version = 'v0-uncalibrated' and r.as_of = v_spine;

  -- Section 6's reproducibility digest: one session's discrete states, which is
  -- the case where hashing is safe. Never hash a rounded float series -- across
  -- 100k rows some value always sits on a rounding boundary and the hash breaks
  -- however small the real difference is.
  select md5(string_agg(r.theme_key || '|' || r.state || '|' ||
                        coalesce(round(r.strength, 6)::text, 'null'), E'\n' order by r.theme_key))
    into v_digest
    from public.regime_theme_states r
   where r.logic_version = 'v0-uncalibrated' and r.as_of = v_spine;

  -- Three outcomes. The idempotent re-run is `skipped`, never `success` with
  -- zero rows -- dressing one up as the other is what hid two silent no-ops in
  -- this codebase already.
  if v_written > 0 then
    v_status := 'success';
  elsif v_present > 0 then
    v_status := 'skipped';
    v_reason := format('already written for %s', v_spine);
  else
    v_status := 'error';
    v_reason := format('nothing written and no state row exists for session %s',
                       coalesce(v_spine::text, '(no SPY session)'));
  end if;

  update public.sync_log
     set status = v_status, finished_at = clock_timestamp(),
         error_message = case when v_status = 'error' then v_reason end,
         details = details || jsonb_build_object(
           'states_written', v_written, 'transitions_written', v_trans,
           'rows_present_for_session', v_present, 'session', v_spine,
           'state_digest', v_digest, 'macro_status', v_macro,
           'factor_status', v_factor, 'reason', v_reason)
   where id = v_log_id;
  -- No RAISE even on error, for the same reason the gate does not raise: the
  -- row above IS the alarm, and rolling it back to satisfy cron.job_run_details
  -- would trade the monitored surface for the unmonitored one.
end;
$fn$;

revoke execute on function public.atlas_write_theme_states()
  from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('atlas_write_theme_states')
   where exists (select 1 from cron.job where jobname = 'atlas_write_theme_states');
end $$;

-- 23:30 UTC Mon-Sat: after the 23:05 macro load and the 23:10 factor refresh,
-- both of which it gates on.
select cron.schedule('atlas_write_theme_states', '30 23 * * 1-6',
                     $job$select public.atlas_write_theme_states();$job$);
