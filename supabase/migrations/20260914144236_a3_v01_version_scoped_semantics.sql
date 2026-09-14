-- A3 v0.1-structural, part 5. Version-scope the two semantic changes.
--
-- A DEFECT IN MY OWN PART 4, caught before running anything on it.
--
-- The conjunction window and the abort scope were applied UNCONDITIONALLY, so
-- the corrected engine would have changed what `v0-uncalibrated` means too --
-- and `regime_theme_states` holds 18,538 rows of v0 history that is
-- append-only and cannot be restated. A stored series that the current code can
-- no longer reproduce is exactly the failure `logic_version` exists to prevent,
-- and A3.1 section 9.3 makes determinism the contract.
--
-- The ruling places `conjunction_window` on `regime_themes`, which is right --
-- per-theme calibration is a real thing to want later. What that placement does
-- not carry is WHICH RULE SET a given run is evaluating under. This table adds
-- that, and nothing else:
--
--   v0-uncalibrated   window 1, abort from dormant allowed  -- the original
--                     semantics, preserved verbatim so the backfill the ruling
--                     was decided on stays reproducible.
--   v0.1-structural   the theme's own conjunction_window, abort from
--                     emerging/established only.
--
-- An unknown logic_version defaults to the OLD semantics, deliberately: a
-- version nobody has described should behave as the engine always did, not
-- inherit whatever the newest correction happens to be.

create table if not exists public.regime_logic_versions (
  logic_version       text primary key,
  use_conjunction_window boolean not null default false,
  abort_from_dormant  boolean not null default true,
  notes               text not null,
  created_at          timestamptz not null default now(),
  constraint rlv_notes_nonblank_ck check (btrim(notes) <> '')
);

comment on table public.regime_logic_versions is
  'Which rule SEMANTICS each logic_version evaluates under, as opposed to which thresholds. Without this, a semantic correction silently restates every prior version''s stored history. Unknown versions default to the pre-2026-09-13 behaviour.';

insert into public.regime_logic_versions
  (logic_version, use_conjunction_window, abort_from_dormant, notes)
values
  ('v0-uncalibrated', false, true,
   'Original semantics, frozen. Emergence required all rows mid-hold on the SAME session; '
   || 'abort fired from any state including dormant. Preserved verbatim so the backfill the '
   || '2026-09-13 ruling was decided on remains reproducible -- 18,538 append-only rows.'),
  ('v0.1-structural', true, false,
   'Ruling of 2026-09-13, sections 2 and 6. Emergence rows may complete their holds anywhere '
   || 'inside regime_themes.conjunction_window sessions of each other; abort fires only from '
   || 'emerging or established. NO THRESHOLD VALUE DIFFERS FROM v0 -- that is what the name records.')
on conflict (logic_version) do nothing;

revoke all on public.regime_logic_versions from anon, authenticated;
