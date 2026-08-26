-- Step 4 close-out — §1 preflight, §2 price-basis gate, §3 matrix coverage.
--
-- ## §1 — the memo's freshness concern was already met; the coherence one was not
--
-- §1.1 asks for a new `atlas_last_trading_day()` because a gate comparing to
-- `CURRENT_DATE` would refuse the job every Saturday. That failure cannot
-- happen: the gate shipped in 20260826150000 already compares against the
-- existing `atlas_last_traded_day()`, which is SPY's max price_date with
-- search_path pinned. A second function under a near-identical name is a thing
-- to keep in sync forever, so this reuses the existing one. (The proposed body
-- would also not run — it reads `price_history.symbol`, and price_history is
-- keyed by asset_id; the existing function joins through `assets` correctly.)
--
-- §1.2 is the real gap and the memo is right that it is the one that matters.
-- The 2026-08-24 phantom rows carried a CURRENT snapshot date. Freshness
-- passes them cleanly. Only reconciling broker against ledger catches them.
--
-- ## Each gate is scoped so it CAN pass
--
-- §1.2 as literally written — "every symbol in `positions` must reconcile to a
-- non-zero ledger quantity, and the quantities must agree" — would refuse this
-- job every night forever. Measured against production it fails on 12 rows,
-- none of them phantoms, in two permanent classes:
--
--   * both sides hold, sizes disagree: GDX (-100) and PBR (-500), broker
--     history predating the 2025-12-29 ledger start. Already gated per
--     position by the engine as `ledger_mismatch`.
--   * closed at broker, ledger residual: 10 rows, 9 expired option contracts.
--     Expiry is not a transaction, so the ledger keeps the opening buy with no
--     closing row. Not a defect at all.
--
-- So `ledger_coherence` is scoped to the PHANTOM signature — broker reports a
-- non-zero holding the ledger says was sold out — which is exactly the 08-24
-- shape and the only one of the three that poisons an append-only history.
-- The other two are reported in the detail. Same reasoning as CLAUDE.md's rule
-- that a red light which can never go green is one you learn to ignore.
--
-- ## §3 — held names are already pinned; the cap was never the cause
--
-- `refresh_universe_correlations` already builds its symbol set as
-- `held UNION liquid(LIMIT p_max_symbols) UNION 'SPY'`, so held names are
-- unconditionally included and the 400 cap applies to the candidate remainder
-- exactly as §3 asks. The proposed `LIMIT 400 - count(held)` would in fact
-- shrink the candidate pool.
--
-- KMTUY is absent for a different reason: 7 bars in the 120-day window against
-- the 60-bar `p_min_days` minimum, so no pair is mathematically possible. That
-- is a fact about its feed, not about the cap — and it is the same dark feed
-- that already makes it `stale_mark`. Pinning cannot fix it.
--
-- `matrix_coverage` therefore refuses only for a name with a LIVE feed that is
-- still missing — a real coverage failure that would silently flip peer_basis
-- from cluster to book. A name absent on a thin feed is reported, not refused:
-- the engine already refuses it per position, so it carries peer_basis 'none'
-- and no tier is being quietly downgraded.
--
-- Absent from the matrix today: **KMTUY only**. One, not three.
--
-- ## §2 — gated in the engine, with its own status value
--
-- `basis_mismatch` is a distinct `engine_status`, not folded into
-- `stale_mark`, on rev. B §3's argument: stale_mark self-heals when the feed
-- returns, a basis mismatch needs a corporate-action adjustment and never
-- does. Ranked after `ledger_mismatch` (if the quantities disagree nothing
-- downstream is safe) and before the rest.
--
-- DD moves measured -> basis_mismatch, carrying the observed ratio. Measured
-- positions 82 -> 81.

-- ============================================================
-- §1.2 substrate
-- ============================================================

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
SELECT COALESCE(b.asset_id, l.asset_id)                      AS asset_id,
       a.symbol,
       b.broker_qty,
       l.ledger_qty,
       (COALESCE(b.broker_qty,0) - COALESCE(l.ledger_qty,0)) AS qty_diff,
       -- Tolerance is fractional-share dust, not a round lot. The breaks this
       -- exists to catch were -500, -100, +27 and a missing opening.
       (abs(COALESCE(b.broker_qty,0) - COALESCE(l.ledger_qty,0)) <= 0.01) AS reconciles
  FROM broker b
  FULL OUTER JOIN ledger l ON l.asset_id = b.asset_id
  JOIN public.assets a ON a.id = COALESCE(b.asset_id, l.asset_id)
 WHERE COALESCE(b.broker_qty,0) <> 0 OR COALESCE(l.ledger_qty,0) <> 0;

COMMENT ON VIEW public.vw_position_reconciliation IS
 'Per-position broker quantity (positions at the latest snapshot) against ledger quantity (summed vw_position_cash_flows deltas). The coherence half of the verdict preflight: the 2026-08-24 phantom rows carried a CURRENT snapshot date and were wrong in content, so a date comparison passes them and only this reconciliation catches them.';

GRANT SELECT ON public.vw_position_reconciliation TO anon, authenticated, service_role;

-- ============================================================
-- §3 coverage
-- ============================================================

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

ALTER TABLE public.book_risk_daily
  ADD COLUMN IF NOT EXISTS positions_in_matrix          int,
  ADD COLUMN IF NOT EXISTS positions_absent_from_matrix int;

COMMENT ON COLUMN public.book_risk_daily.positions_absent_from_matrix IS
 'Open positions with no correlation row. Carried nightly so a held name leaving the matrix is visible as a trend, not discovered when a peer_basis silently flips from cluster to book.';

-- ============================================================
-- §2 verdict_status vocabulary
-- ============================================================

ALTER TABLE public.position_verdicts
  DROP CONSTRAINT IF EXISTS position_verdicts_status_ck;
ALTER TABLE public.position_verdicts
  ADD CONSTRAINT position_verdicts_status_ck
  CHECK (verdict_status IN ('measured','one_sided','stale_mark','ledger_mismatch','basis_mismatch'));

COMMENT ON COLUMN public.position_verdicts.verdict_status IS
 'measured | one_sided | stale_mark | ledger_mismatch | basis_mismatch. Rev. B §3: every refusal on this book is a data-integrity refusal, never a solver failure. stale_mark self-heals when the feed returns; ledger_mismatch and basis_mismatch do not.';
