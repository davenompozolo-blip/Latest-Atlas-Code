-- A3.0 -- theme schema. No detection logic; that is A3.1.
--
-- A3 themes are macro states -- "is AI capex a live regime" -- and are a
-- different entity from position_themes, which tags holdings. A theme can be
-- live with no holdings in it and vice versa, so neither is derived from the
-- other and the join between them is deferred until there is something on both
-- sides to join.

create table if not exists public.regime_themes (
  theme_key    text primary key,
  label        text not null,
  driver_class text not null,
  description  text not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint regime_themes_driver_ck check (driver_class in
    ('supply_geopolitical','monetary_financial','fiscal_dominance','productivity_capex')),
  constraint regime_themes_desc_ck check (btrim(description) <> '')
);

comment on table public.regime_themes is
  'A3 macro regime themes. A claim about the world, not a portfolio tag -- '
  'position_themes is the separate object that maps holdings to themes.';

-- Every threshold, window and horizon is a row. Calibration is data, which is
-- what makes a v1 recalibration a new row set rather than a code change.
create table if not exists public.regime_theme_triggers (
  theme_key       text not null references public.regime_themes(theme_key) on delete cascade,
  trigger_key     text not null,
  role            text not null,
  -- The A3.0 field list has series_key and axis_key only, but A3.1's trigger
  -- sets name `rsp_spy` and the A3.0 energy exhaustion rule names XLE/XLU --
  -- both RATIO PAIRS, which are neither a macro series nor a factor axis. A
  -- third operand kind is therefore required rather than optional, and making
  -- the kind explicit is what lets the engine be a dispatch rather than a
  -- guess about which column happens to be filled in.
  operand_kind    text not null,
  series_key      text references public.macro_series(series_key),
  axis_key        text references public.factor_axes(axis_key),
  pair_key        text references public.ratio_pairs(pair_key),
  -- What the operand's value MEANS, so a row is legible without reading the
  -- engine. A flag beside a number nobody checks is not a safeguard; a measure
  -- name beside a threshold is, because the engine dispatches on it.
  measure         text not null,
  operator        text not null,
  threshold       numeric not null,
  threshold_units text not null,
  baseline_window int,
  hold_sessions   int,
  logic_version   text not null,
  notes           text not null,
  primary key (theme_key, trigger_key, logic_version),

  constraint rtt_role_ck check (role in
    ('emergence','absorption','abort','exhaustion','confirmation')),
  constraint rtt_operand_kind_ck check (operand_kind in ('series','axis','pair')),
  constraint rtt_operator_ck check (operator in ('gte','lte','abs_gte','retrace_gt')),
  constraint rtt_units_ck check (threshold_units in ('bp','pct','sigma','ratio')),
  constraint rtt_measure_ck check (measure in (
    'series_level_vs_baseline_mean',  -- series latest vs mean of prior baseline_window sessions
    'axis_score_20d_z',               -- factor_axis_scores.score_20d_z, already in sigma
    'pair_logret_z',                  -- pair log-ratio move over baseline_window, in sigma
    'retrace_of_episode_move')),      -- share of the episode's own move given back
  -- Exactly one operand, and it must be the one operand_kind names. Without
  -- this a row can carry two operands and the engine silently picks one.
  constraint rtt_one_operand_ck check (
    (case when series_key is not null then 1 else 0 end
   + case when axis_key   is not null then 1 else 0 end
   + case when pair_key   is not null then 1 else 0 end) = 1
    and (operand_kind <> 'series' or series_key is not null)
    and (operand_kind <> 'axis'   or axis_key   is not null)
    and (operand_kind <> 'pair'   or pair_key   is not null)),
  constraint rtt_retrace_ck check (
    operator <> 'retrace_gt'
    or (measure = 'retrace_of_episode_move' and threshold_units = 'pct'
        and threshold > 0 and threshold <= 100)),
  constraint rtt_measure_units_ck check (
    (measure <> 'axis_score_20d_z' or threshold_units = 'sigma')
    and (measure <> 'pair_logret_z' or threshold_units = 'sigma')
    and (measure <> 'series_level_vs_baseline_mean' or threshold_units in ('bp','pct'))),
  constraint rtt_baseline_ck check (baseline_window is null or baseline_window > 0),
  constraint rtt_hold_ck check (hold_sessions is null or hold_sessions >= 0),
  -- The spec asks for "why this number" on every row. A nullable free-text
  -- column that can hold '' is a column nobody fills in.
  constraint rtt_notes_ck check (btrim(notes) <> '')
);

create index if not exists regime_theme_triggers_theme_role_idx
  on public.regime_theme_triggers (theme_key, logic_version, role);

comment on table public.regime_theme_triggers is
  'One row per threshold. Seeded at logic_version = v0-uncalibrated because the '
  'numbers are authored, not derived; a recalibration is a NEW logic_version row '
  'set with the old retained, never an update.';

-- Append-only. A row records what was known on as_of under logic_version.
create table if not exists public.regime_theme_states (
  theme_key     text not null references public.regime_themes(theme_key) on delete cascade,
  as_of         date not null,
  logic_version text not null,
  state         text not null,
  strength      numeric,
  evidence      jsonb not null,
  computed_at   timestamptz not null default now(),
  primary key (theme_key, as_of, logic_version),
  constraint rts_state_ck check (state in
    ('dormant','emerging','established','exhausted','aborted')),
  -- strength is a mean of clipped ratios times a held fraction, so out of range
  -- is a defect in the engine, not a reading. Master spec 9.3 says stop and
  -- report; a CHECK is how it stops.
  constraint rts_strength_ck check (strength is null or (strength >= 0 and strength <= 1)),
  -- A state with no evidence cannot be audited three months from now, which is
  -- the entire point of shadow mode.
  constraint rts_evidence_ck check (jsonb_typeof(evidence) = 'object' and evidence <> '{}'::jsonb)
);

create table if not exists public.regime_theme_transitions (
  theme_key     text not null references public.regime_themes(theme_key) on delete cascade,
  as_of         date not null,
  logic_version text not null,
  from_state    text not null,
  to_state      text not null,
  triggered_by  jsonb not null,
  computed_at   timestamptz not null default now(),
  primary key (theme_key, as_of, logic_version),
  constraint rtx_change_ck check (from_state <> to_state)
);

comment on table public.regime_theme_transitions is
  'One row per state change. The table a Bench thesis eventually references to '
  'know the regime state it was written under. Nothing consumes it yet; it '
  'exists so history accumulates from day one rather than being reconstructed '
  'later from a state series never designed to support it.';

-- Append-only by trigger, as book_factor_betas is.
create or replace function public.atlas_append_only_guard()
 returns trigger language plpgsql as $guard$
begin
  raise exception '% is append-only: % refused on (%)',
    tg_table_name, tg_op, tg_table_name
    using hint = 'A recalibration is a new logic_version row set, never an update.';
end;
$guard$;

drop trigger if exists regime_theme_states_append_only on public.regime_theme_states;
create trigger regime_theme_states_append_only
  before update or delete on public.regime_theme_states
  for each row execute function public.atlas_append_only_guard();

drop trigger if exists regime_theme_transitions_append_only on public.regime_theme_transitions;
create trigger regime_theme_transitions_append_only
  before update or delete on public.regime_theme_transitions
  for each row execute function public.atlas_append_only_guard();

-- Shadow mode: nothing in the browser reads these. No anon/authenticated read
-- policy, deliberately -- the panel is A5 and is gated on 90 days of history.
alter table public.regime_themes            enable row level security;
alter table public.regime_theme_triggers    enable row level security;
alter table public.regime_theme_states      enable row level security;
alter table public.regime_theme_transitions enable row level security;

create policy regime_themes_service on public.regime_themes
  for all to service_role using (true) with check (true);
create policy regime_theme_triggers_service on public.regime_theme_triggers
  for all to service_role using (true) with check (true);
create policy regime_theme_states_service on public.regime_theme_states
  for all to service_role using (true) with check (true);
create policy regime_theme_transitions_service on public.regime_theme_transitions
  for all to service_role using (true) with check (true);
