-- Three corrections from CodeRabbit's review of PR #783. All three verified
-- against the live database before applying, and one of them corrects my own
-- fix from four hours earlier.
--
-- ============================================================================
-- 1. THE NaN GUARD WAS INCOMPLETE. `numeric` HAS INFINITIES TOO.
-- ============================================================================
--
-- `20260915110000` guarded with `IS DISTINCT FROM 'NaN'::numeric`. On
-- PostgreSQL 17 `numeric` also carries `'Infinity'` and `'-Infinity'`, and:
--
--   'Infinity'::numeric > 0                            -> true
--   'Infinity'::numeric > 3.841459                     -> true
--   'Infinity'::numeric IS DISTINCT FROM 'NaN'::numeric -> TRUE   <-- passes
--
-- So the guard closed one of three doors. A `+Infinity` kupiec_lr still
-- satisfied `kupiec_lr >= 0` AND both `kupiec_reject_*` flag bindings with the
-- flags true -- the exact case the previous migration was written to refuse.
--
-- **A two-sided range is the whole guard.** `x > '-Infinity' AND x < 'Infinity'`
-- is FALSE for all three sentinels: NaN fails the upper bound (NaN sorts above
-- everything), +Infinity fails it too, -Infinity fails the lower. It is NULL
-- for NULL, so the CHECK still passes on the nullable measurements. Measured,
-- not reasoned:
--
--   label        x > '-Infinity' and x < 'Infinity'   IS DISTINCT FROM 'NaN'
--   NaN          false                                false
--   +Infinity    false                                TRUE
--   -Infinity    false                                TRUE
--   0.012        true                                 true
--   null         null                                 true
--
-- This is the same shape as the lesson the last migration recorded -- a
-- one-sided bound is permeable and a two-sided one is not -- applied to the
-- fix itself rather than to the thing it was fixing.
--
-- ============================================================================
-- 2. THE EQUITY SERIES HAD NO GUARD AT ALL, AT EITHER END.
-- ============================================================================
--
-- `vw_book_realised_returns` filtered `pec.equity > 0`, which admits NaN and
-- +Infinity, and `portfolio_equity_curve` carries no numeric constraint of any
-- kind -- only `data_quality`. A non-finite equity level contaminates TWO
-- realised returns (the one into it and the one out of it) and would then be
-- counted as a usable settled observation by the book leg.
--
-- Guarded in both places, for the reason this repo already records: a gate
-- applied at the consumer is missed by the next consumer. The view's filter
-- becomes a two-sided range (`> 0` was always the lower half of one); the
-- table gets the finiteness constraint it never had.
--
-- 0 of 179 rows violate, so both are plain validating constraints.
--
-- ============================================================================
-- 3. ONE EXISTING ROW SKIPPED EVERY CONFIDENCE LEVEL.
-- ============================================================================
--
-- The writer's presence check was `count(*) WHERE as_of AND logic_version` --
-- not per confidence. So a call with `p_confs = ARRAY[0.95]` wrote 8 rows and
-- then permanently blocked the nightly default call from ever writing 90% and
-- 99% for that `as_of`: it would log `skipped, already written`, which is the
-- "no-op dressed as success" pattern this repo has three entries about, on a
-- night two thirds of the readings are missing.
--
-- Always iterate `p_confs`, with `ON CONFLICT DO NOTHING` per row.
--
-- **That is safe HERE and the distinction matters.** The segment job's
-- `DO NOTHING` failed because a segment id is derived from a CLUSTERING that
-- is recomputed nightly, so yesterday's ids and today's coexisted. This key --
-- (as_of, logic_version, leg, basis, axis_key, conf) -- is derived from the
-- panel date, a fixed two-element leg set, a fixed two-element basis set and
-- the `factor_axes` rows. Nothing in it moves under recomputation. **Before
-- reusing an upsert key, ask whether it survives recomputation** -- asked, and
-- here it does.
--
-- `rows_present` is still logged beside `rows_written`, and `confs` records
-- which levels were requested, so a partial fill is legible as a partial fill.

-- ---------- 1. finite, not merely not-NaN ----------

alter table public.var_backtest_runs drop constraint if exists vbr_finite_ck;

alter table public.var_backtest_runs
  add constraint vbr_finite_ck check (
        (var_pred_daily          > '-Infinity'::numeric and var_pred_daily          < 'Infinity'::numeric)
    and (cvar_pred_daily         > '-Infinity'::numeric and cvar_pred_daily         < 'Infinity'::numeric)
    and (cvar_pred_on_exceptions > '-Infinity'::numeric and cvar_pred_on_exceptions < 'Infinity'::numeric
         or cvar_pred_on_exceptions is null)
    and (cvar_realised_daily     > '-Infinity'::numeric and cvar_realised_daily     < 'Infinity'::numeric
         or cvar_realised_daily is null)
    and (sd_pred_daily           > '-Infinity'::numeric and sd_pred_daily           < 'Infinity'::numeric)
    and (sd_realised_daily       > '-Infinity'::numeric and sd_realised_daily       < 'Infinity'::numeric)
    and (sd_factor_window        > '-Infinity'::numeric and sd_factor_window        < 'Infinity'::numeric
         or sd_factor_window is null)
    and (sd_residual_window      > '-Infinity'::numeric and sd_residual_window      < 'Infinity'::numeric
         or sd_residual_window is null)
    and (kupiec_lr               > '-Infinity'::numeric and kupiec_lr               < 'Infinity'::numeric)
  );

alter table public.book_regime_cvar drop constraint if exists brc_finite_ck;

alter table public.book_regime_cvar
  add constraint brc_finite_ck check (
        (vol_daily                  > '-Infinity'::numeric and vol_daily                  < 'Infinity'::numeric)
    and (vol_daily_unshrunk         > '-Infinity'::numeric and vol_daily_unshrunk         < 'Infinity'::numeric)
    and (vol_annual                 > '-Infinity'::numeric and vol_annual                 < 'Infinity'::numeric)
    and (var_daily                  > '-Infinity'::numeric and var_daily                  < 'Infinity'::numeric)
    and (cvar_daily                 > '-Infinity'::numeric and cvar_daily                 < 'Infinity'::numeric)
    and (vol_ratio_vs_unconditional > '-Infinity'::numeric and vol_ratio_vs_unconditional < 'Infinity'::numeric)
    and (z_lo > '-Infinity'::numeric and z_lo < 'Infinity'::numeric or z_lo is null)
    and (z_hi > '-Infinity'::numeric and z_hi < 'Infinity'::numeric or z_hi is null)
  );

comment on constraint vbr_finite_ck on public.var_backtest_runs is
  'Two-sided range, which is the only form that refuses all three numeric sentinels: NaN and +Infinity both fail the upper bound, -Infinity the lower. A NaN-only guard let +Infinity satisfy every ordering CHECK on this table including both kupiec_reject flag bindings.';
comment on constraint brc_finite_ck on public.book_regime_cvar is
  'Same guard at the point the value is created. brc_vol_positive_ck and brc_cvar_gt_var_ck are each satisfied by NaN and by +Infinity on their own.';

-- ---------- 2. the equity series, at both ends ----------

alter table public.portfolio_equity_curve drop constraint if exists pec_finite_ck;

alter table public.portfolio_equity_curve
  add constraint pec_finite_ck check (
        (equity      > '-Infinity'::numeric and equity      < 'Infinity'::numeric)
    and (profit_loss > '-Infinity'::numeric and profit_loss < 'Infinity'::numeric or profit_loss is null)
  );

comment on constraint pec_finite_ck on public.portfolio_equity_curve is
  'A non-finite equity level contaminates two realised returns -- the one into it and the one out of it. This table had no numeric constraint at all before.';

create or replace view public.vw_book_realised_returns as
with curve as (
  select (pec.ts at time zone 'America/New_York')::date as session_date,
         pec.equity,
         pec.data_quality
    from public.portfolio_equity_curve pec
   -- Two-sided on purpose. `equity > 0` alone admits NaN and +Infinity, both
   -- of which sort above every finite value; the upper bound is what refuses
   -- them. pec_finite_ck guards the table, and this guards the view against a
   -- future source that is not this table.
   where pec.equity > 0
     and pec.equity < 'Infinity'::numeric
),
lagged as (
  select c.session_date,
         c.equity,
         c.data_quality,
         lag(c.equity)       over (order by c.session_date) as prev_equity,
         lag(c.data_quality) over (order by c.session_date) as prev_data_quality,
         lag(c.session_date) over (order by c.session_date) as prev_session_date
    from curve c
)
select l.session_date,
       l.prev_session_date,
       l.equity,
       l.prev_equity,
       ln(l.equity / l.prev_equity)                                       as log_return,
       (l.data_quality = 'settled' and l.prev_data_quality = 'settled')   as usable,
       l.data_quality,
       l.prev_data_quality
  from lagged l
 where l.prev_equity is not null;

comment on view public.vw_book_realised_returns is
  'Daily log return of the book from portfolio_equity_curve, dated on the New York session and never on the UTC cast. `usable` is false whenever EITHER endpoint is a stale_snapshot -- the return out of a carried level is as fabricated as the return into it (C1, 2026-09-09). Non-finite levels are excluded by a two-sided range.';
comment on column public.vw_book_realised_returns.usable is
  'Both endpoints settled. Filter on this for any return computation; read the false rows to say what was withheld.';

-- ---------- 3. write the missing confidences, do not skip the run ----------

create or replace function public.atlas_write_var_backtest(
  p_logic_version text      default 'v1',
  p_confs         numeric[] default array[0.90, 0.95, 0.99]
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_log_id     bigint;
  v_as_of      date;
  v_cvar_as_of date;
  v_written    int := 0;
  v_present    int := 0;
  v_n          int;
  v_conf       numeric;
begin
  insert into public.sync_log (function_name, source, status, started_at)
  values ('atlas_write_var_backtest', 'pg_cron', 'running', clock_timestamp())
  returning id into v_log_id;

  select max(f.date) into v_as_of
  from public.vw_factor_return_panel f where f.complete_z;

  select max(c.as_of) into v_cvar_as_of from public.book_regime_cvar c;

  if v_as_of is null or v_cvar_as_of is distinct from v_as_of then
    update public.sync_log
       set status = 'skipped', finished_at = clock_timestamp(),
           details = jsonb_build_object(
             'reason', 'no regime cvar snapshot for the latest panel session',
             'as_of', v_as_of,
             'cvar_as_of', v_cvar_as_of)
     where id = v_log_id;
    return;
  end if;

  select count(*) into v_present
  from public.var_backtest_runs r
  where r.as_of = v_as_of and r.logic_version = p_logic_version;

  -- Every requested confidence is attempted, every time. A level already
  -- written is skipped by ON CONFLICT, not by abandoning the whole run.
  foreach v_conf in array p_confs loop
    with ins as (
      insert into public.var_backtest_runs
        (as_of, cvar_as_of, logic_version, leg, basis, axis_key, conf,
         window_start, window_end, n_obs, exceptions,
         var_pred_daily, cvar_pred_daily, cvar_pred_on_exceptions,
         cvar_realised_daily, sd_pred_daily, sd_realised_daily,
         sd_factor_window, sd_residual_window,
         kupiec_lr, kupiec_reject_05, kupiec_reject_01, betas_estimated_at)
      select b.as_of, b.cvar_as_of, p_logic_version, b.leg, b.basis, b.axis_key, b.conf,
             b.window_start, b.window_end, b.n_obs, b.exceptions,
             b.var_pred_daily, b.cvar_pred_daily, b.cvar_pred_on_exceptions,
             b.cvar_realised_daily, b.sd_pred_daily, b.sd_realised_daily,
             b.sd_factor_window, b.sd_residual_window,
             b.kupiec_lr,
             b.kupiec_lr > 3.841459,
             b.kupiec_lr > 6.634897,
             b.betas_estimated_at
      from public.atlas_var_backtest(v_conf) b
      on conflict do nothing
      returning 1
    )
    select count(*) into v_n from ins;
    v_written := v_written + v_n;
  end loop;

  if v_written > 0 then
    update public.sync_log
       set status = 'success', finished_at = clock_timestamp(),
           details = jsonb_build_object(
             'as_of', v_as_of, 'cvar_as_of', v_cvar_as_of,
             'rows_written', v_written, 'rows_present_before', v_present,
             'confs', to_jsonb(p_confs), 'logic_version', p_logic_version)
     where id = v_log_id;
  elsif v_present > 0 then
    update public.sync_log
       set status = 'skipped', finished_at = clock_timestamp(),
           details = jsonb_build_object(
             'reason', 'every requested confidence already written for this as_of',
             'as_of', v_as_of, 'rows_present_before', v_present,
             'confs', to_jsonb(p_confs))
     where id = v_log_id;
  else
    update public.sync_log
       set status = 'error', finished_at = clock_timestamp(),
           details = jsonb_build_object(
             'reason', 'produced no rows and none present',
             'as_of', v_as_of, 'cvar_as_of', v_cvar_as_of)
     where id = v_log_id;
    raise warning 'atlas_write_var_backtest produced no rows for as_of %', v_as_of;
  end if;
end;
$fn$;

comment on function public.atlas_write_var_backtest(text, numeric[]) is
  'Nightly writer for var_backtest_runs. Gates on book_regime_cvar holding a snapshot for the session being graded -- the dependency itself, not the upstream job''s status, which is `skipped` on a legitimate idempotent re-run. Attempts every requested confidence on every run; ON CONFLICT skips a level already written rather than abandoning the run, which is safe because this key is derived from data and not from a clustering. Refuses by UPDATEing its own sync_log row, never by RAISE.';

revoke execute on function public.atlas_write_var_backtest(text, numeric[]) from public, anon, authenticated;
