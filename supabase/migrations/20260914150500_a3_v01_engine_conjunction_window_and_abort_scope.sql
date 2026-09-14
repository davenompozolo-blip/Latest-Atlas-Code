-- A3 v0.1-structural, part 4 of 4. The engine corrections.
--
-- Two changes, both from the 2026-09-13 ruling, both structural. NO THRESHOLD
-- VALUE IS TOUCHED HERE OR ANYWHERE IN THIS SET.
--
-- RULING SECTION 2 -- the conjunction is a WINDOW, not a single session.
--   Was: every emergence row must satisfy run_n >= hold_req on the SAME session.
--   Now: every emergence row must have COMPLETED its own hold, with the oldest
--        such completion no more than regime_themes.conjunction_window (90)
--        sessions back.
--   The old reading was an implementation default, never authored. Fiscal's
--   three rows cleared their 30-session holds at 32, 33 and 55 sessions inside
--   2023 and the conjunction never held on one session; peak strength 0.699.
--
-- RULING SECTION 6 -- the abort transition excludes `dormant`.
--   An abort is the failure of an episode that existed. Firing it from dormant
--   recorded a move that never became a state as an abort, which is how
--   `aborted` reached 24.9% of sessions for productivity_capex and became the
--   second-largest state in every theme.
--
-- Both corrections would be made if they made detection strictly worse; that is
-- the test the ruling sets and the only reason they are authorised.

CREATE OR REPLACE FUNCTION public.atlas_evaluate_themes(p_logic_version text DEFAULT 'v0-uncalibrated'::text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_baseline_mode text DEFAULT 'episode_frozen'::text)
 RETURNS TABLE(theme_key text, sessions integer, transitions integer, first_as_of date, last_as_of date, digest text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  emergence_keys text[];   -- every emergence trigger_key for this theme
  hold_done    jsonb;      -- trigger_key -> session index its hold last completed
  sess_ix      int;        -- session counter, so the window is in SESSIONS not days
  v_conj       int;        -- regime_themes.conjunction_window for this theme
  oldest_done  int;
  done_ix      int;
  ekey         text;
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
         t.threshold, t.threshold_units, th.conjunction_window,
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
    select s.st_theme, s.start_date,
           (select max(x.conjunction_window) from _tm x where x.tm_theme = s.st_theme)
             as conj_window
      from _start s order by s.st_theme
  loop
    st := 'dormant'; runs := '{}'::jsonb; extremes := '{}'::jsonb; an_base := '{}'::jsonb;
    ep_open := false; n_emg_hold := 0; n_no_emg := 0;
    hold_done := '{}'::jsonb; sess_ix := 0;
    v_conj := greatest(coalesce(v_theme.conj_window, 90), 1);
    v_sessions := 0; v_trans := 0;

    select array_agg(q.trigger_key) into positive_keys
      from (select distinct x.trigger_key from _tm x
             where x.tm_theme = v_theme.st_theme
               and x.role = 'emergence'
               and x.operator in ('gte','abs_gte')
               and x.measure <> 'retrace_of_episode_move') q;

    -- Every emergence row, including the abs_lte discriminators and the
    -- retrace-bounded ones. The conjunction is over ALL of them; a theme is not
    -- emergent because its positive rows fired.
    select array_agg(q.trigger_key) into emergence_keys
      from (select distinct x.trigger_key from _tm x
             where x.tm_theme = v_theme.st_theme and x.role = 'emergence') q;

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
      sess_ix := sess_ix + 1;
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
          -- RULING SECTION 2. Record the session on which this row's own hold was
          -- last complete. emg_all is decided AFTER the loop, from whether every
          -- emergence row completed inside a common window -- not from whether
          -- they all happen to be mid-hold on this one session.
          if run_n >= hold_req then
            hold_done := jsonb_set(hold_done, array[tkey], to_jsonb(sess_ix), true);
          end if;
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

      -- RULING SECTION 2, the conjunction itself. Emergence is satisfied when EVERY
      -- emergence row has completed its own hold_sessions and the oldest of
      -- those completions is no more than conjunction_window sessions back.
      --
      -- The window is anchored at the CURRENT session rather than spanning
      -- min..max of the completions. Anchoring keeps the state machine causal:
      -- "all rows have completed recently" is a statement about now, whereas a
      -- free-floating min..max span would let a conjunction that closed years
      -- ago keep a theme emergent forever.
      --
      -- A row whose streak later breaks keeps its recorded completion and simply
      -- ages out of the window. That is the point: macro variables lead and lag
      -- each other by weeks, and the old same-session rule required lockstep.
      if emergence_keys is null or array_length(emergence_keys, 1) is null then
        emg_all := false;
      else
        emg_all := true;
        oldest_done := null;
        foreach ekey in array emergence_keys loop
          if hold_done ? ekey then
            done_ix := public.safe_bigint(hold_done ->> ekey)::int;
            if oldest_done is null or done_ix < oldest_done then oldest_done := done_ix; end if;
          else
            emg_all := false;
          end if;
        end loop;
        if emg_all and (oldest_done is null or sess_ix - oldest_done > v_conj) then
          emg_all := false;
        end if;
      end if;

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

      -- RULING SECTION 6. `any -> aborted` included `dormant`, so a move that never
      -- became a state was recorded as an abort -- up to 24.9% of sessions for
      -- productivity_capex. An abort is the failure of an episode that existed;
      -- there is nothing to abort from dormant.
      if abt_any and st in ('emerging','established') then
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
$function$
