-- MP-6b: atlas_write_regime_cvar fills per AXIS, not per snapshot.
--
-- The writer checked for ANY row at (account, as_of, logic_version, conf) and
-- wrote nothing when one existed. So a snapshot missing one axis -- an axis
-- whose atlas_regime_cvar returned no rows that night -- could never be
-- repaired by a re-run, and the re-run logged 'skipped, already written' over
-- an incomplete set; the VaR backtest, which gates on the date existing, would
-- then grade against it. "One existing row skipped every confidence level"
-- (2026-09-15) in a new place. Raised by CodeRabbit on PR #837.
--
-- Now each axis is written if it has no rows, so a re-run completes a partial
-- snapshot. The key (account, as_of, logic_version, axis, bucket, conf) comes
-- from the panel date and the fixed factor_axes set, so it survives
-- recomputation and a per-axis skip is safe. Axes still absent after the run
-- are named in sync_log.details.axes_missing and the run is graded 'partial',
-- never 'skipped'.
--
-- A textual patch against the live body with every anchor asserted exactly
-- once, the idiom this view family uses, so a replay against a different base
-- fails loudly.
do $mig$
declare
  v_def text := pg_get_functiondef('public.atlas_write_regime_cvar(text,numeric)'::regprocedure);
  v_a1  text := E'      if v_present = 0 then\n        foreach v_axis in array v_axes loop\n          with ins as (';
  v_r1  text := E'      foreach v_axis in array v_axes loop\n        if not exists (select 1 from public.book_regime_cvar x\n                        where x.portfolio_id = r.id and x.as_of = v_as_of\n                          and x.logic_version = p_logic_version and x.conf = p_conf\n                          and x.axis_key = v_axis) then\n          with ins as (';
  v_a2  text := E'          v_written := v_written + v_n;\n        end loop;\n      end if;\n';
  v_r2  text := E'          v_written := v_written + v_n;\n        end if;\n      end loop;\n\n      select coalesce(array_agg(a order by a), ''{}'') into v_missing\n        from unnest(v_axes) a\n       where not exists (select 1 from public.book_regime_cvar x\n                          where x.portfolio_id = r.id and x.as_of = v_as_of\n                            and x.logic_version = p_logic_version and x.conf = p_conf\n                            and x.axis_key = a);\n';
  v_a3  text := E'      if v_written > 0 then\n        update public.sync_log\n           set status = ''success''';
  v_r3  text := E'      if cardinality(v_missing) > 0 and (v_written > 0 or v_present > 0) then\n        update public.sync_log\n           set status = ''partial'', finished_at = clock_timestamp(),\n               details = details || jsonb_build_object(\n                 ''as_of'', v_as_of, ''rows_written'', v_written, ''rows_present'', v_present,\n                 ''axes_missing'', to_jsonb(v_missing), ''conf'', p_conf,\n                 ''logic_version'', p_logic_version)\n         where id = v_log_id;\n      elsif v_written > 0 then\n        update public.sync_log\n           set status = ''success''';
  v_a4  text := E'declare\n';
  v_n   int;
begin
  if position('v_missing' in v_def) > 0 then
    raise exception 'atlas_write_regime_cvar already carries the per-axis fill';
  end if;
  foreach v_a1 in array array[v_a1, v_a2, v_a3] loop
    v_n := (length(v_def) - length(replace(v_def, v_a1, ''))) / length(v_a1);
    if v_n <> 1 then raise exception 'anchor matched % times: %', v_n, left(v_a1, 60); end if;
  end loop;
  v_a1 := E'      if v_present = 0 then\n        foreach v_axis in array v_axes loop\n          with ins as (';
  v_def := replace(v_def, v_a1, v_r1);
  v_def := replace(v_def, v_a2, v_r2);
  v_def := replace(v_def, v_a3, v_r3);
  -- first declare block only
  v_def := regexp_replace(v_def, E'\ndeclare\n', E'\ndeclare\n  v_missing text[];\n');
  execute v_def;
end
$mig$;
