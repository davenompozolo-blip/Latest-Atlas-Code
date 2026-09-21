-- ============================================================
-- A stale bar must not publish a move -- at the engine this time
-- ------------------------------------------------------------
-- `vw_portfolio_home.daily_change_pct` is
--
--     (live broker mark - latest stored 1d bar close) / that close
--
-- The mark is refreshed every five minutes by `sync_alpaca_positions`. The
-- BAR is the half that goes stale. So a name whose price feed has stopped
-- keeps publishing a "daily" move which is really the entire drift since its
-- last print -- and the number grows as the feed stays dark, so it looks more
-- like news the longer it has been wrong.
--
-- KMTUY did exactly this: 2.13% of book on a bar 179 days old, publishing
-- +6.3% as today's move. It reached the flagship holdings table, the Theme
-- cut and the bench docket, because all three descend from this view:
--
--   vw_portfolio_home -> mv_nexus_holdings -> vw_nexus_holdings
--                                          -> mv_bench_contribution
--
-- `nexus_holdings` has enforced this rule since 2026-08-18 and this side of
-- the house never got it. That entry's reasoning is unchanged and is reused
-- rather than re-derived:
--
--   * SEVEN days, not the four-day `stale` badge. Four is right for badging a
--     row and too tight to null a NUMBER on -- a Thursday close before a
--     Friday holiday is five days old by Tuesday.
--   * ONE CTE decides publishability, never a predicate repeated per column,
--     so `daily_change_pct` and `return_5d_pct` cannot disagree about whether
--     the same name has a usable move.
--   * `price_days_old` is published so a consumer can say WHY a figure is
--     absent. A flag beside a number nobody checks is not a safeguard; if the
--     data cannot support the figure, the figure is NULL.
--
-- ## Why here and not at the readers
--
-- A gate applied at the consumer is missed by the next consumer -- the
-- argument that put the price-basis gate in the return engine rather than per
-- surface. Three known readers today and nothing stopping a fourth.
--
-- ## The five-day return takes the same gate
--
-- The oldest bar in a five-bar window cannot be fresher than the newest one,
-- so a stale rn=1 bar makes BOTH figures claims about a tape that stopped.
--
-- ## Anchored to the price date, not the position date
--
-- Near miss worth recording: `latest_prices.price_date` is
-- `COALESCE(lp.as_of_date, rp.price_date)` -- the POSITION snapshot date,
-- which is `current_date` for every held row. Gating on the column already
-- called `price_date` would have shipped a gate that can never fire, the
-- fourth instance of that shape in this codebase. The anchor is the
-- `ranked_prices` rn = 1 row -- the same bar that produces `prev_close`.
--
-- ## How it is applied
--
-- Patched textually against `pg_get_viewdef`, the idiom this view family
-- already uses (20260811150000, 20260906083659), so the remaining ~7.7k
-- characters stay byte-identical and there is no transcription of a dumped
-- definition. Every anchor is asserted to match exactly once, so a replay
-- against a different base fails loudly instead of quietly producing
-- something else. Guarded on `move_publishable` so a re-run is a no-op.
--
-- CREATE OR REPLACE, not DROP CASCADE: the three new columns are APPENDED and
-- the two changed columns keep their names, positions and types.
-- ============================================================

DO $patch$
DECLARE
  src text; out_s text;

  -- A. the rn=1 row carries its own date, and one CTE decides publishability.
  a_old text := E'            ranked_prices.close AS prev_close\n           FROM ranked_prices\n          WHERE ranked_prices.rn = 1\n        ), five_day_prices AS (\n';
  a_new text := E'            ranked_prices.close AS prev_close,\n            ranked_prices.price_date AS last_bar_date\n           FROM ranked_prices\n          WHERE ranked_prices.rn = 1\n        ), move_gate AS (\n         SELECT pdp0.asset_id,\n            pdp0.last_bar_date,\n            (CURRENT_DATE - pdp0.last_bar_date) AS price_days_old,\n            (pdp0.prev_close IS NOT NULL AND pdp0.prev_close > 0::numeric AND (CURRENT_DATE - pdp0.last_bar_date) <= 7) AS move_publishable\n           FROM prev_day_prices pdp0\n        ), five_day_prices AS (\n';

  -- B. the daily move is withheld when the bar cannot support it.
  b_old text := E'            WHEN pdp.prev_close IS NOT NULL AND pdp.prev_close > 0::numeric THEN (lp.current_price - pdp.prev_close) / pdp.prev_close\n';
  b_new text := E'            WHEN COALESCE(mg.move_publishable, false) THEN (lp.current_price - pdp.prev_close) / pdp.prev_close\n';

  -- C. same gate on the five-day move.
  c_old text := E'            WHEN fdp.close_5d IS NOT NULL AND fdp.close_5d > 0::numeric THEN (lp.current_price - fdp.close_5d) / fdp.close_5d\n';
  c_new text := E'            WHEN COALESCE(mg.move_publishable, false) AND fdp.close_5d IS NOT NULL AND fdp.close_5d > 0::numeric THEN (lp.current_price - fdp.close_5d) / fdp.close_5d\n';

  -- D. appended columns, so a consumer can state why a move is absent.
  d_old text := E'    nav.short_mv AS short_market_value\n   FROM latest_pos p\n';
  d_new text := E'    nav.short_mv AS short_market_value,\n    mg.last_bar_date,\n    mg.price_days_old,\n    COALESCE(mg.move_publishable, false) AS move_publishable\n   FROM latest_pos p\n';

  -- E. the join.
  e_old text := E'     LEFT JOIN prev_day_prices pdp ON pdp.asset_id = p.asset_id\n';
  e_new text := E'     LEFT JOIN prev_day_prices pdp ON pdp.asset_id = p.asset_id\n     LEFT JOIN move_gate mg ON mg.asset_id = p.asset_id\n';

  anchors text[][] := ARRAY[['A','B','C','D','E']];
  olds text[];
  i int;
BEGIN
  src := pg_get_viewdef('public.vw_portfolio_home'::regclass, true);

  IF position('move_publishable' in src) > 0 THEN
      RAISE NOTICE 'vw_portfolio_home already carries the stale-move gate; nothing to patch';
      RETURN;
  END IF;

  olds := ARRAY[a_old, b_old, c_old, d_old, e_old];
  FOR i IN 1..5 LOOP
      IF (length(src) - length(replace(src, olds[i], ''))) / length(olds[i]) <> 1 THEN
          RAISE EXCEPTION 'anchor % matched % times, expected exactly 1',
                anchors[1][i],
                (length(src) - length(replace(src, olds[i], ''))) / length(olds[i]);
      END IF;
  END LOOP;

  out_s := replace(replace(replace(replace(replace(
             src, a_old, a_new), b_old, b_new), c_old, c_new), d_old, d_new), e_old, e_new);
  IF out_s = src THEN RAISE EXCEPTION 'patch produced no change'; END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.vw_portfolio_home AS ' || out_s;
END
$patch$;

COMMENT ON COLUMN public.vw_portfolio_home.price_days_old IS
    'Age in days of the latest stored 1d bar for this asset, measured from the '
    'rn=1 row of ranked_prices -- NOT from price_date, which is the position '
    'snapshot date and is current_date for every held row. Published so a '
    'consumer can state why a move is absent rather than rendering a dash that '
    'reads like a measurement.';

COMMENT ON COLUMN public.vw_portfolio_home.move_publishable IS
    'False when the latest stored bar is older than 7 days or carries no usable '
    'close. daily_change_pct and return_5d_pct are NULL exactly when this is '
    'false -- one gate, so the two figures cannot disagree about the same name.';
