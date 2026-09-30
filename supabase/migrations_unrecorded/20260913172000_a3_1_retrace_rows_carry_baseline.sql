-- A retrace row measures how much of the theme's own move has been given back,
-- so it needs to know what "the move" is -- and for a macro series that is the
-- level against a baseline, which means the row needs the same baseline_window
-- as the emergence row on the same operand. Leaving it NULL would force the
-- engine to go and find the emergence row that happens to share the operand,
-- which is a lookup by coincidence rather than by data.
--
-- Sigma operands (axis, pair) need no baseline: the z IS the move, measured
-- from its own zero, so those retrace rows keep baseline_window NULL.

update public.regime_theme_triggers t
   set baseline_window = e.baseline_window
  from public.regime_theme_triggers e
 where t.measure = 'retrace_of_episode_move'
   and t.operand_kind = 'series'
   and t.baseline_window is null
   and e.theme_key = t.theme_key
   and e.logic_version = t.logic_version
   and e.role = 'emergence'
   and e.series_key = t.series_key
   and e.baseline_window is not null;

-- tariff's abort row is on T5YIFR and its emergence row on the same series
-- carries 60; energy's abort is on BRENT against 120; fiscal's abort is on
-- DGS10 against 60 and its exhaustion on T10Y2Y against 60. All four resolve.
do $$
declare n int;
begin
  select count(*) into n from public.regime_theme_triggers
   where measure = 'retrace_of_episode_move' and operand_kind = 'series'
     and baseline_window is null;
  if n > 0 then
    raise exception 'A3.1: % series retrace row(s) still have no baseline_window', n;
  end if;
end $$;
