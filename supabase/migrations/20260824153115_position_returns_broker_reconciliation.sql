DROP VIEW IF EXISTS public.vw_position_returns;

-- Per-position cash-flow return engine (memo v2 §4 step 2). Engine only.
--
-- Refusals are first-class. The engine publishes a figure only when the
-- schedule behind it is complete and the mark supportable; otherwise it
-- publishes the reason and NULLs the number.
--
--   ledger_mismatch    The ledger's net quantity disagrees with the broker's.
--                      This is the real completeness test - a per-position
--                      version of what `nav_reconciliation` does at book level
--                      - and the divergences are exact round lots, so these
--                      are missing individual transactions, not drift:
--                        PBR    ledger -374.17 vs broker  125.83  = -500 sh
--                        GDX    ledger  -35.11 vs broker   64.89  = -100 sh
--                        NPSNY  ledger  109.25 vs broker   82.25  =  +27 sh
--                        OILK   ledger -970.89 vs broker    0     (opening)
--                      A cash-flow return over a schedule missing a 500-share
--                      buy is not approximately right, it is unanswerable.
--                      This is the memo's `insufficient_history`.
--   incomplete_ledger  Running quantity goes negative. Kept as a second test
--                      because it needs no broker row and so still covers a
--                      fully-closed name.
--   stale_mark         Open, mark price more than 7 days old. House rule since
--                      2026-08-18: a figure the data cannot support is NULL,
--                      not a number beside a flag. §2.6 `one_sided` - capital
--                      deployed and mark age stay published so the verdict
--                      layer can say "the peers returned X, your position is
--                      unpriced since Y".
--   no_rate            No sign change, or a root not bracketed.
--
-- Options are excluded: no peer set in `universe_correlations`, and two of the
-- contracts are sell-to-open shorts whose IRR sign convention inverts.
--
-- `position_mwr_period_pct` is the ranking input. `position_mwr_pct` is its
-- annualised form, published only past 90 days held - MWR is annualised by
-- construction and a 7-day window turned AMGN's +6.18% into +2,182.99%.

CREATE VIEW public.vw_position_returns AS
 WITH cf AS (
     SELECT c.* FROM vw_position_cash_flows c
       JOIN assets a ON a.id = c.asset_id
      WHERE COALESCE(lower(a.asset_class), '') NOT LIKE '%option%'
        AND a.symbol !~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'
 ), broker AS (
     SELECT DISTINCT ON (p.asset_id) p.asset_id, p.quantity AS broker_qty
       FROM positions p
      WHERE p.as_of_date >= (SELECT max(positions.as_of_date) - 2 FROM positions)
      ORDER BY p.asset_id, p.as_of_date DESC
 ), runq AS (
     SELECT z.asset_id, min(z.running) AS min_running
       FROM ( SELECT cf.asset_id,
                sum(cf.qty_delta) OVER (PARTITION BY cf.asset_id
                     ORDER BY cf.flow_date, cf.flow_kind
                     ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running
                FROM cf WHERE cf.flow_kind <> 'mark') z
      GROUP BY z.asset_id
 ), agg AS (
     SELECT cf.asset_id, cf.symbol,
        min(cf.flow_date) FILTER (WHERE cf.flow_kind <> 'mark') AS first_flow_date,
        max(cf.flow_date) FILTER (WHERE cf.flow_kind <> 'mark') AS last_trade_date,
        max(cf.flow_date) AS schedule_end_date,
        max(cf.mark_days_old) AS mark_days_old,
        max(cf.mark_price_date) AS mark_price_date,
        count(*) FILTER (WHERE cf.flow_kind = 'buy')  AS n_buys,
        count(*) FILTER (WHERE cf.flow_kind = 'sell') AS n_sells,
        bool_or(cf.flow_kind = 'mark') AS is_open,
        sum(cf.qty_delta) FILTER (WHERE cf.flow_kind <> 'mark') AS net_qty,
        sum(-cf.flow_usd) FILTER (WHERE cf.flow_kind = 'buy')  AS capital_deployed_usd,
        sum(cf.flow_usd)  FILTER (WHERE cf.flow_kind = 'sell') AS proceeds_usd,
        sum(cf.flow_usd)  FILTER (WHERE cf.flow_kind = 'mark') AS terminal_value_usd,
        sum(cf.flow_usd) AS net_pnl_usd,
        array_agg(cf.flow_date ORDER BY cf.flow_date, cf.flow_kind) AS flow_dates,
        array_agg(cf.flow_usd  ORDER BY cf.flow_date, cf.flow_kind) AS flow_amounts
       FROM cf
      GROUP BY cf.asset_id, cf.symbol
 ), calc AS (
     SELECT a.*,
        (r.min_running >= -1e-6::numeric) AS ledger_complete,
        COALESCE(b.broker_qty, 0::numeric) AS broker_qty,
        (abs(COALESCE(b.broker_qty, 0::numeric) - a.net_qty)
            <= GREATEST(0.01::numeric, abs(a.net_qty) * 0.001::numeric)) AS broker_reconciles,
        (a.schedule_end_date - a.first_flow_date)::int AS days_held,
        p0.close AS window_open_price,
        p1.close AS window_close_price,
        public.atlas_mwr_period(a.flow_dates, a.flow_amounts) AS mwr_period
       FROM agg a
       JOIN runq r ON r.asset_id = a.asset_id
       LEFT JOIN broker b ON b.asset_id = a.asset_id
       LEFT JOIN LATERAL ( SELECT ph.close FROM price_history ph
              WHERE ph.asset_id = a.asset_id AND ph."interval" = '1d'::text
                AND ph.price_date <= a.first_flow_date
              ORDER BY ph.price_date DESC LIMIT 1) p0 ON true
       LEFT JOIN LATERAL ( SELECT ph.close FROM price_history ph
              WHERE ph.asset_id = a.asset_id AND ph."interval" = '1d'::text
                AND ph.price_date <= a.schedule_end_date
              ORDER BY ph.price_date DESC LIMIT 1) p1 ON true
 ), graded AS (
     SELECT c.*,
        CASE
            WHEN NOT c.broker_reconciles                         THEN 'ledger_mismatch'
            WHEN NOT c.ledger_complete                           THEN 'incomplete_ledger'
            WHEN c.is_open AND COALESCE(c.mark_days_old, 0) > 7  THEN 'stale_mark'
            WHEN c.mwr_period IS NULL                            THEN 'no_rate'
            ELSE 'measured'
        END AS engine_status
       FROM calc c
 )
 SELECT g.asset_id,
    g.symbol,
    CASE WHEN g.is_open THEN 'open'::text ELSE 'closed'::text END AS position_state,
    g.engine_status,
    CASE g.engine_status
        WHEN 'ledger_mismatch'   THEN 'ledger ' || round(g.net_qty, 4)::text || ' sh vs broker ' || round(g.broker_qty, 4)::text
        WHEN 'incomplete_ledger' THEN 'running quantity reaches ' || round(g.net_qty, 4)::text
        WHEN 'stale_mark'        THEN 'mark_days_old=' || g.mark_days_old::text
        WHEN 'no_rate'           THEN 'no sign change or unbracketed root'
        ELSE NULL::text
    END AS engine_reason,
    g.first_flow_date,
    g.last_trade_date,
    g.schedule_end_date,
    g.days_held,
    g.n_buys,
    g.n_sells,
    round(g.net_qty, 8) AS net_qty,
    round(g.broker_qty, 8) AS broker_qty,
    round(g.capital_deployed_usd, 2) AS capital_deployed_usd,
    round(COALESCE(g.proceeds_usd, 0), 2) AS proceeds_usd,
    round(COALESCE(g.terminal_value_usd, 0), 2) AS terminal_value_usd,
    CASE WHEN g.engine_status IN ('measured', 'no_rate')
         THEN round(g.net_pnl_usd, 2) END AS net_pnl_usd,
    CASE WHEN g.engine_status IN ('measured', 'no_rate') AND g.capital_deployed_usd > 0
         THEN round(g.net_pnl_usd / g.capital_deployed_usd, 6) END AS simple_return_pct,
    CASE WHEN g.engine_status = 'measured'
         THEN round(g.mwr_period::numeric, 6) END AS position_mwr_period_pct,
    CASE WHEN g.engine_status = 'measured' AND g.days_held >= 90
         THEN round((power(1 + g.mwr_period, 365.0 / g.days_held) - 1)::numeric, 6) END AS position_mwr_pct,
    (g.days_held >= 90) AS mwr_annualisable,
    CASE WHEN g.engine_status = 'measured' AND g.window_open_price > 0
         THEN round(g.window_close_price / g.window_open_price - 1, 6) END AS position_twr_pct,
    g.window_open_price,
    g.window_close_price,
    g.mark_days_old,
    g.mark_price_date,
    g.ledger_complete,
    g.broker_reconciles,
    g.flow_dates,
    g.flow_amounts
   FROM graded g;

COMMENT ON VIEW public.vw_position_returns IS
 'Cash-flow-matched return engine per position. `position_mwr_period_pct` (money-weighted over the real holding period) is the ranking input; `position_mwr_pct` is its annualised form, published only past 90 days held. Figures are NULL unless engine_status = ''measured'' - see engine_reason. Reconciles the ledger against the broker per position. Options excluded.';
