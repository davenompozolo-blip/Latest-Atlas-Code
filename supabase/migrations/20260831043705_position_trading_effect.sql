-- ============================================================
-- The per-position trading-effect drill-down
-- memo v2 close-out §5.1 — "keep `trading_effect_pct` per row for drill-down"
-- ------------------------------------------------------------
-- Rates do not add up; dollars do. `vw_book_frozen_baseline` is an MWR over
-- POOLED cash flows, not a weighted average of per-position rates, so nothing
-- weights `trading_effect_pct` back to −1.03pp. What decomposes exactly is
-- money: traded gain minus frozen gain, additive across positions,
-- -$4,033.51 on 2026-08-28. Both are published; dollars are the sort key.
--
-- Dollars and rates disagree per position (TSM +$372 / −6.7pp) because the
-- traded path deployed more capital than the frozen one. `effects_disagree`
-- marks those rows rather than letting a reader assume one question.
--
-- Reads live `vw_position_frozen`, NOT `position_verdicts`: the verdict
-- history is open-book only (57 rows) while the baseline compares 77, and the
-- 21 closed exits absent from it carry −$4,020.58 of the −$4,033.49.
--
-- An untouched position's effect is zero by construction; the MWR solver
-- returns ~1e-7. Snapped on a STRUCTURAL test (one transaction, still open),
-- never a magnitude floor — the largest untouched residual (4.66e-7) is an
-- order of magnitude ABOVE the smallest real traded effect (3.98e-8), so any
-- threshold catching the noise would erase real measurements.
-- `structural_zero_breach` refuses to snap anything past 100× the observed
-- residual, because at that size the classification is wrong.
--
-- Comparability is the engine's gate, read not re-derived. Reasons come off
-- the frozen side too: four OTC ADRs read `measured` on the position and
-- `stale_mark` on the counterfactual.
-- ============================================================

CREATE OR REPLACE VIEW public.vw_position_trading_effect AS
WITH val AS (
    SELECT max(c.flow_date) AS as_of
      FROM public.vw_position_cash_flows c
     WHERE c.flow_kind = 'mark'
), flows AS (
    SELECT c.asset_id,
           sum(c.flow_usd)                                            AS traded_gain_usd,
           sum(CASE WHEN c.flow_usd < 0 THEN -c.flow_usd ELSE 0 END)  AS traded_capital_usd,
           count(*) FILTER (WHERE c.qty_delta > 0)                    AS n_buys,
           count(*) FILTER (WHERE c.qty_delta < 0)                    AS n_sells,
           min(c.flow_date) FILTER (WHERE c.qty_delta > 0)            AS first_buy_date,
           max(c.flow_date) FILTER (WHERE c.qty_delta <> 0)           AS last_trade_date
      FROM public.vw_position_cash_flows c
     GROUP BY c.asset_id
), base AS (
    SELECT f.asset_id,
           f.symbol,
           f.position_state,
           f.engine_status,
           f.frozen_status,
           f.frozen_reason,
           f.frozen_entry_date,
           f.frozen_capital_usd,
           f.frozen_terminal_usd,
           f.frozen_mark_date,
           f.position_mwr_period_pct,
           f.frozen_weight_return_pct,
           f.trading_effect_pct                                       AS raw_effect_pct,
           coalesce(fl.n_buys, 0)                                     AS n_buys,
           coalesce(fl.n_sells, 0)                                    AS n_sells,
           fl.first_buy_date,
           fl.last_trade_date,
           fl.traded_capital_usd,
           fl.traded_gain_usd,
           (f.frozen_terminal_usd - f.frozen_capital_usd)             AS frozen_gain_usd,
           (fl.traded_gain_usd - (f.frozen_terminal_usd - f.frozen_capital_usd))
                                                                      AS raw_effect_usd,
           CASE
               WHEN f.position_state <> 'open'                           THEN 'exit'
               WHEN coalesce(fl.n_buys, 0) + coalesce(fl.n_sells, 0) > 1 THEN 'resized'
               ELSE 'untouched'
           END                                                        AS trade_kind
      FROM public.vw_position_frozen f
      LEFT JOIN flows fl ON fl.asset_id = f.asset_id
)
SELECT b.asset_id,
       b.symbol,
       b.position_state,
       (SELECT val.as_of FROM val)                                    AS as_of,
       b.trade_kind,
       b.n_buys,
       b.n_sells,
       b.first_buy_date,
       b.last_trade_date,
       b.frozen_entry_date,
       b.frozen_mark_date,

       (b.raw_effect_pct IS NOT NULL)                                 AS comparable,
       CASE
           WHEN b.raw_effect_pct IS NOT NULL          THEN NULL
           WHEN b.engine_status <> 'measured'         THEN b.engine_status
           WHEN b.frozen_status <> 'measured'         THEN b.frozen_status
           ELSE 'unmeasurable'
       END                                                            AS unmeasurable_reason,
       CASE WHEN b.raw_effect_pct IS NULL THEN b.frozen_reason END    AS unmeasurable_detail,

       CASE WHEN b.raw_effect_pct IS NULL THEN NULL ELSE b.traded_capital_usd END
                                                                      AS traded_capital_usd,
       CASE WHEN b.raw_effect_pct IS NULL THEN NULL ELSE b.frozen_capital_usd END
                                                                      AS frozen_capital_usd,
       CASE WHEN b.raw_effect_pct IS NULL THEN NULL ELSE b.traded_gain_usd END
                                                                      AS traded_gain_usd,
       CASE WHEN b.raw_effect_pct IS NULL THEN NULL ELSE b.frozen_gain_usd END
                                                                      AS frozen_gain_usd,
       CASE
           WHEN b.raw_effect_pct IS NULL THEN NULL
           WHEN b.trade_kind = 'untouched' AND abs(b.raw_effect_usd) <= 0.50 THEN 0::numeric
           ELSE b.raw_effect_usd
       END                                                            AS trading_effect_usd,

       b.position_mwr_period_pct                                      AS traded_return_pct,
       b.frozen_weight_return_pct                                     AS frozen_return_pct,
       CASE
           WHEN b.raw_effect_pct IS NULL THEN NULL
           WHEN b.trade_kind = 'untouched' AND abs(b.raw_effect_pct) <= 0.0001 THEN 0::numeric
           ELSE b.raw_effect_pct
       END                                                            AS trading_effect_pct,

       (b.raw_effect_pct IS NOT NULL
        AND b.trade_kind <> 'untouched'
        AND b.raw_effect_usd <> 0 AND b.raw_effect_pct <> 0
        AND sign(b.raw_effect_usd) <> sign(b.raw_effect_pct))         AS effects_disagree,

       (b.trade_kind = 'untouched'
        AND b.raw_effect_pct IS NOT NULL
        AND (abs(b.raw_effect_usd) > 0.50 OR abs(b.raw_effect_pct) > 0.0001))
                                                                      AS structural_zero_breach
  FROM base b;

COMMENT ON VIEW public.vw_position_trading_effect IS
    'Per-position drill-down under the do-nothing baseline (memo v2 5.1). '
    'trading_effect_usd is additive across positions and ties to the book; '
    'trading_effect_pct is the engine rate and does NOT sum to the book MWR. '
    'Rank on dollars. Reads live vw_position_frozen, not position_verdicts, '
    'because the verdict history is open-book only and the closed exits carry '
    'essentially the whole book effect.';

GRANT SELECT ON public.vw_position_trading_effect TO anon, authenticated;
