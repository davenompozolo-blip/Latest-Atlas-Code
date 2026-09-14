-- A3 v0.1-structural, part 2 of 4. The corrected trigger set.
--
-- COPIED FROM v0-uncalibrated WITH EXACTLY ONE CHANGE, and every threshold,
-- unit, baseline window and hold length carried across untouched. The copy is
-- verified row-for-row at the end of this migration; if any numeric value
-- differs the migration raises and nothing is written.
--
-- WHY A NEW logic_version RATHER THAN AN UPDATE. Editing the v0 rows in place
-- would restate what v0 meant, and v0's output is the evidence the ruling was
-- made on. `logic_version` exists precisely so a recalibration is a new series
-- rather than a rewrite of history. v0-uncalibrated stays exactly as it was.
--
-- The name is `v0.1-structural` and not `v1` deliberately: it is the record
-- that no number was tuned.
--
-- THE ONE CHANGE (ruling section 1). `energy_dislocation.emg_cyclical_positive` moves
-- from role `emergence` to role `confirmation`.
--
-- A3.1 section 4 says in terms: "Confirmation is not gating. A theme can emerge
-- without confirmation... never let it block a state transition." A3.0 then
-- seeded this row as an EMERGENCE row. Both cannot stand.
--
-- The backfill priced the contradiction: in 2022 Brent cleared +57.1% against a
-- 25% bar and T5YIFR cleared +45.5bp against a 20bp bar, and energy did not
-- emerge because a SIGN TEST WITH NO MAGNITUDE held 37 of its required 40
-- sessions. A sign test flips on noise -- its longest run in 23 years is 91
-- sessions -- so demanding 40 consecutive from it made the least specific row
-- in the theme its strictest gate. That is the opposite of what a bare
-- qualifier reads like.
--
-- NOTE, and it is deliberate: energy already carries `cfm_cyclical` at
-- >= 0.5 sigma, so after this move the theme has two confirmation rows on the
-- same axis and the 0-sigma one is nested inside the 0.5-sigma one. That is
-- redundancy, not conflict -- evidence now distinguishes "positive" from
-- "strongly positive" -- and removing a row was not authorised by the ruling.

insert into public.regime_theme_triggers
  (theme_key, trigger_key, role, operand_kind, series_key, axis_key, pair_key,
   measure, operator, threshold, threshold_units, baseline_window, hold_sessions,
   logic_version, notes)
select t.theme_key,
       t.trigger_key,
       case when t.theme_key = 'energy_dislocation'
             and t.trigger_key = 'emg_cyclical_positive'
            then 'confirmation' else t.role end,
       t.operand_kind, t.series_key, t.axis_key, t.pair_key,
       t.measure, t.operator, t.threshold, t.threshold_units,
       t.baseline_window, t.hold_sessions,
       'v0.1-structural',
       case when t.theme_key = 'energy_dislocation'
             and t.trigger_key = 'emg_cyclical_positive'
            then 'Moved emergence -> confirmation, 2026-09-13 ruling section 1. A3.1 section 4 '
              || 'says confirmation never gates; seeding this as emergence contradicted '
              || 'that. A bare sign test held 37 of 40 required sessions in 2022 and '
              || 'blocked a theme whose magnitude rows had both cleared. Threshold '
              || 'unchanged at 0 sigma.'
            else coalesce(t.notes, '') end
from public.regime_theme_triggers t
where t.logic_version = 'v0-uncalibrated'
on conflict do nothing;

-- Prove the copy changed nothing but the one role. A migration that claims "no
-- threshold values change" and is not checked is an assertion, not a fact.
do $$
declare
  v_numeric_diffs int;
  v_role_diffs    int;
  v_missing       int;
begin
  select count(*) into v_numeric_diffs
  from public.regime_theme_triggers a
  join public.regime_theme_triggers b
    on b.theme_key = a.theme_key and b.trigger_key = a.trigger_key
   and b.logic_version = 'v0.1-structural'
  where a.logic_version = 'v0-uncalibrated'
    and (a.threshold       is distinct from b.threshold
      or a.threshold_units is distinct from b.threshold_units
      or a.baseline_window is distinct from b.baseline_window
      or a.hold_sessions   is distinct from b.hold_sessions
      or a.operator        is distinct from b.operator
      or a.measure         is distinct from b.measure
      or a.operand_kind    is distinct from b.operand_kind
      or a.series_key      is distinct from b.series_key
      or a.axis_key        is distinct from b.axis_key
      or a.pair_key        is distinct from b.pair_key);

  select count(*) into v_role_diffs
  from public.regime_theme_triggers a
  join public.regime_theme_triggers b
    on b.theme_key = a.theme_key and b.trigger_key = a.trigger_key
   and b.logic_version = 'v0.1-structural'
  where a.logic_version = 'v0-uncalibrated' and a.role is distinct from b.role;

  select (select count(*) from public.regime_theme_triggers where logic_version='v0-uncalibrated')
       - (select count(*) from public.regime_theme_triggers where logic_version='v0.1-structural')
    into v_missing;

  if v_numeric_diffs <> 0 then
    raise exception 'v0.1-structural changed % threshold/operator/operand values; the ruling authorises none', v_numeric_diffs;
  end if;
  if v_role_diffs <> 1 then
    raise exception 'expected exactly 1 role change (energy emg_cyclical_positive), found %', v_role_diffs;
  end if;
  if v_missing <> 0 then
    raise exception 'row count differs between versions by %', v_missing;
  end if;
end $$;
