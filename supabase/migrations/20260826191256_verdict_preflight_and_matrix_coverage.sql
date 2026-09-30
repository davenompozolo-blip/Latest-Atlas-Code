-- §1.2 substrate: per-position ledger vs broker reconciliation, on exactly the
-- basis vw_position_returns already uses for `ledger_mismatch`.
CREATE OR REPLACE VIEW public.vw_position_reconciliation AS
WITH broker AS (
    SELECT DISTINCT ON (p.asset_id) p.asset_id, p.quantity AS broker_qty
      FROM public.positions p
     WHERE p.as_of_date = (SELECT max(as_of_date) FROM public.positions)
     ORDER BY p.asset_id, p.as_of_date DESC
),
ledger AS (
    SELECT c.asset_id, sum(c.qty_delta) AS ledger_qty
      FROM public.vw_position_cash_flows c
     WHERE c.flow_kind <> 'mark'
     GROUP BY c.asset_id
)
SELECT COALESCE(b.asset_id, l.asset_id)                     AS asset_id,
       a.symbol,
       b.broker_qty,
       l.ledger_qty,
       (COALESCE(b.broker_qty,0) - COALESCE(l.ledger_qty,0)) AS qty_diff,
       -- Tolerance is fractional-share dust, not a round lot. The four breaks
       -- this exists to catch were -500, -100, +27 and a missing opening.
       (abs(COALESCE(b.broker_qty,0) - COALESCE(l.ledger_qty,0)) <= 0.01) AS reconciles
  FROM broker b
  FULL OUTER JOIN ledger l ON l.asset_id = b.asset_id
  JOIN public.assets a ON a.id = COALESCE(b.asset_id, l.asset_id)
 WHERE COALESCE(b.broker_qty,0) <> 0 OR COALESCE(l.ledger_qty,0) <> 0;

COMMENT ON VIEW public.vw_position_reconciliation IS
 'Per-position broker quantity (positions at the latest snapshot) against ledger quantity (summed vw_position_cash_flows deltas). The coherence half of the verdict preflight: the 2026-08-24 phantom rows carried a CURRENT snapshot date and were wrong in content, so a date comparison passes them and only this reconciliation catches them.';

GRANT SELECT ON public.vw_position_reconciliation TO anon, authenticated, service_role;


-- §3: held names absent from the correlation matrix, and WHY.
-- `refresh_universe_correlations` already pins held names unconditionally
-- (`select symbol from held UNION select symbol from liquid LIMIT p_max_symbols`),
-- so the 400 cap applies to the candidate remainder already. A held name can
-- still be absent when it has too few bars in the correlation window to produce
-- a pair - which is a fact about the feed, not about the cap. The two cases
-- need separating, because only one of them is anomalous.
CREATE OR REPLACE VIEW public.vw_held_symbols_absent_from_matrix AS
WITH latest AS (SELECT max(as_of_date) AS d FROM public.universe_correlations),
grid AS (
    SELECT min(price_date) AS lo FROM (
        SELECT DISTINCT price_date FROM public.price_history
         WHERE "interval" = '1d' ORDER BY price_date DESC LIMIT 120) g
),
held AS (
    SELECT DISTINCT a.symbol, p.asset_id
      FROM public.positions p JOIN public.assets a ON a.id = p.asset_id
     WHERE p.as_of_date = (SELECT max(as_of_date) FROM public.positions)
       AND p.quantity IS NOT NULL AND p.quantity <> 0
)
SELECT h.symbol,
       h.asset_id,
       (SELECT max(ph.price_date) FROM public.price_history ph
         WHERE ph.asset_id = h.asset_id AND ph."interval" = '1d') AS last_bar,
       (SELECT count(*) FROM public.price_history ph, grid
         WHERE ph.asset_id = h.asset_id AND ph."interval" = '1d'
           AND ph.price_date >= grid.lo) AS bars_in_window,
       -- refresh_universe_correlations requires p_min_days (60) common
       -- observations to emit a pair. Under that, no pair is possible.
       ((SELECT count(*) FROM public.price_history ph, grid
          WHERE ph.asset_id = h.asset_id AND ph."interval" = '1d'
            AND ph.price_date >= grid.lo) < 60) AS feed_too_thin
  FROM held h
 WHERE NOT EXISTS (
        SELECT 1 FROM public.universe_correlations c, latest
         WHERE c.as_of_date = latest.d
           AND (c.symbol_1 = h.symbol OR c.symbol_2 = h.symbol));

COMMENT ON VIEW public.vw_held_symbols_absent_from_matrix IS
 'Open positions with no row in the latest universe_correlations snapshot. `feed_too_thin` separates the two causes: under 60 bars in the 120-day window means no pair is mathematically possible (the engine already refuses such a name as stale_mark), while an absent name WITH a live feed is a real coverage failure and refuses the verdict job.';

GRANT SELECT ON public.vw_held_symbols_absent_from_matrix TO anon, authenticated, service_role;


-- §3: coverage as a time series rather than something noticed when it breaks.
ALTER TABLE public.book_risk_daily
  ADD COLUMN IF NOT EXISTS positions_in_matrix          int,
  ADD COLUMN IF NOT EXISTS positions_absent_from_matrix int;

COMMENT ON COLUMN public.book_risk_daily.positions_absent_from_matrix IS
 'Open positions with no correlation row. Carried nightly so a held name leaving the matrix is visible as a trend, not discovered when a peer_basis silently flips from cluster to book.';
