-- ============================================================
-- Carry the gate to the reader, and stop laundering a NULL into a 0.00%
-- ------------------------------------------------------------
-- Companion to 20260921080000, which gated `vw_portfolio_home`. That gate
-- reaches `vw_nexus_holdings` through `mv_nexus_holdings` for the daily
-- figure, because `round(NULL, 3)` is NULL -- but NOT for the five-day one:
--
--     mv_nexus_holdings:
--       round(p.daily_change_pct * 100, 3)                  AS daily_return_pct
--       round(COALESCE(p.return_5d_pct, 0) * 100, 3)        AS five_day_return_pct
--                        ^^^^^^^^^^^^^^^^^
--
-- That COALESCE turns "this name has no usable five-day move" into "this name
-- moved exactly 0.00% over five sessions", which is a measurement rather than
-- an absence. It is LIVE TODAY, independent of staleness:
-- SOXX261016P00500000 is a put with ZERO price bars and the flagship
-- publishes `0.000` for its five-day return.
--
-- ## Why the fix lands here and not on the matview
--
-- `mv_nexus_holdings` has six dependants, so changing it is a
-- `DROP MATERIALIZED VIEW ... CASCADE` rebuild of the lot. `CREATE OR REPLACE
-- VIEW` on `vw_nexus_holdings` reaches every consumer of these two columns --
-- the same argument that fixed `fwd_pe` here in 20260906083659 rather than on
-- the matview.
--
-- `mv_nexus_holdings.five_day_return_pct` therefore KEEPS its COALESCE and is
-- now read by nothing. Do not consume it believing a 0.000 is a measurement.
--
-- ## The two columns move from the matview snapshot to the live view
--
-- They are now read from `ph` (the live `vw_portfolio_home`) rather than from
-- `m`. This view ALREADY does that for `unrealised_return_pct` and `theme`, so
-- it joins an existing pattern rather than inventing one -- and it is what
-- makes the gate airtight: the figure and the `move_publishable` flag now come
-- from the same row of the same view and cannot disagree about a name. Sourcing
-- the number from a 10-minute-old snapshot while gating it on a live flag is
-- precisely the two-sources failure this codebase keeps recording.
--
-- The arithmetic is unchanged, proven rather than asserted. Against the live
-- book, 17 of 64 rows differed on the shadow:
--
--   * 1 is the SOXX put, `0.000` -> NULL. That is the defect.
--   * 16 are mark drift since the last matview refresh, at most 0.110pp. All
--     63 publishable rows reproduce the matview's OWN stored figures EXACTLY
--     (63/63, both columns) from the matview's own stored `current_price`
--     against the same bar closes, and exactly those 16 rows are the ones
--     whose `current_price` has moved since. Same formula, later instant.
--
--   A first attempt asserted the daily and five-day shifts would be equal.
--   They are not, and the checker was wrong rather than the data: a mark move
--   dP shifts the two by dP/prev_close and dP/close_5d, which differ whenever
--   the five-day move is not zero.
--
-- ## Appended columns
--
-- `last_bar_date`, `price_days_old` and `move_publishable` are published so a
-- surface can say WHY a move is absent instead of rendering a dash that reads
-- like a measurement.
--
-- Patched textually against `pg_get_viewdef` with all three anchors asserted
-- to match exactly once, and guarded on `move_publishable` so a re-run is a
-- no-op. Column names, order and types on the shared 36-column prefix are
-- identical -- checked before applying, since CREATE OR REPLACE VIEW cannot
-- reorder or retype.
-- ============================================================

DO $patch$
DECLARE
  src text; out_s text;

  -- A. the two move columns come from the gated live view, not the matview.
  a_old text := E'            m.daily_return_pct,\n            m.five_day_return_pct,\n';
  a_new text := E'            round(ph.daily_change_pct * 100::numeric, 3) AS daily_return_pct,\n            round(ph.return_5d_pct * 100::numeric, 3) AS five_day_return_pct,\n';

  -- B. carry the freshness columns through the w CTE.
  b_old text := E'            mk.median_fwd_pe AS market_fwd_pe_src\n';
  b_new text := E'            mk.median_fwd_pe AS market_fwd_pe_src,\n            ph.last_bar_date AS last_bar_date_src,\n            ph.price_days_old AS price_days_old_src,\n            COALESCE(ph.move_publishable, false) AS move_publishable_src\n';

  -- C. publish them.
  c_old text := E'        END AS fwd_pe_premium_pct\n   FROM w';
  c_new text := E'        END AS fwd_pe_premium_pct,\n    last_bar_date_src AS last_bar_date,\n    price_days_old_src AS price_days_old,\n    move_publishable_src AS move_publishable\n   FROM w';

  nms text[] := ARRAY['A','B','C'];
  olds text[];
  i int;
BEGIN
  src := pg_get_viewdef('public.vw_nexus_holdings'::regclass, true);

  IF position('move_publishable' in src) > 0 THEN
      RAISE NOTICE 'vw_nexus_holdings already carries the stale-move gate; nothing to patch';
      RETURN;
  END IF;

  olds := ARRAY[a_old, b_old, c_old];
  FOR i IN 1..3 LOOP
      IF (length(src) - length(replace(src, olds[i], ''))) / length(olds[i]) <> 1 THEN
          RAISE EXCEPTION 'anchor % matched % times, expected exactly 1', nms[i],
                (length(src) - length(replace(src, olds[i], ''))) / length(olds[i]);
      END IF;
  END LOOP;

  out_s := replace(replace(replace(src, a_old, a_new), b_old, b_new), c_old, c_new);
  IF out_s = src THEN RAISE EXCEPTION 'patch produced no change'; END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.vw_nexus_holdings AS ' || out_s;
END
$patch$;

COMMENT ON COLUMN public.vw_nexus_holdings.price_days_old IS
    'Age in days of the latest stored 1d bar. NULL when the name has no bar at '
    'all. Published so a surface can state why a move is absent.';

COMMENT ON COLUMN public.vw_nexus_holdings.move_publishable IS
    'False when the latest stored bar is older than 7 days or carries no usable '
    'close. daily_return_pct and five_day_return_pct are NULL exactly when this '
    'is false. Both are read from the live vw_portfolio_home, NOT from '
    'mv_nexus_holdings, so the figures and this flag come from one row and '
    'cannot disagree -- and so the matview COALESCE that reported a missing '
    'five-day move as 0.000 is bypassed.';
