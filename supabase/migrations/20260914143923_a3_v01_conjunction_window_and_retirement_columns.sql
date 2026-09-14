-- A3 v0.1-structural, part 1 of 4. Owner ruling of 2026-09-13, master spec
-- section 10.3 decision 3. NO THRESHOLD VALUE CHANGES ANYWHERE IN THIS SET.
--
-- Two columns, both required by the ruling.
--
-- `conjunction_window` (ruling section 2). The engine implemented "all emergence rows
-- hold, each for its hold_sessions" as SAME-SESSION simultaneity of three
-- rolling holds. That is far stricter than the words describe and was never
-- consciously chosen. The backfill shows the cost exactly: fiscal's three rows
-- cleared their own 30-session holds inside 2023 -- at 32, 33 and 55 -- and the
-- conjunction never held on one session. Peak strength 0.699.
--
-- Macro variables lead and lag each other by weeks. Requiring a long-end level
-- move, a steepening and a flat breakeven to be simultaneously mid-hold is close
-- to requiring they move in lockstep, which is not what the rule says.
--
-- It is a ROW and not a constant so it is calibratable later without a code
-- change -- the same discipline the thresholds themselves are held to.
--
-- `retired_reason` / `retired_at` (ruling section 3). `active` alone records THAT a
-- theme is off and not WHY, and a theme retired for an unsatisfiable rule is a
-- different fact from one paused for a feed outage. The CHECK makes an
-- unexplained retirement unstorable rather than merely discouraged.

alter table public.regime_themes
  add column if not exists conjunction_window int not null default 90;

alter table public.regime_themes
  add column if not exists retired_reason text,
  add column if not exists retired_at      timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'regime_themes_conjunction_window_ck') then
    alter table public.regime_themes
      add constraint regime_themes_conjunction_window_ck
      check (conjunction_window between 1 and 500);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'regime_themes_retirement_ck') then
    alter table public.regime_themes
      add constraint regime_themes_retirement_ck
      check (active or (retired_reason is not null and btrim(retired_reason) <> ''));
  end if;
end $$;

comment on column public.regime_themes.conjunction_window is
  'Sessions within which every emergence row must have completed its own hold_sessions for emergence to be satisfied. 90 per the 2026-09-13 ruling. The previous behaviour was same-session simultaneity, i.e. an effective window of 1, which was an implementation default rather than a design decision.';
comment on column public.regime_themes.retired_reason is
  'Why a theme is inactive. NOT NULL-when-inactive by CHECK: active=false without a reason is unstorable.';
