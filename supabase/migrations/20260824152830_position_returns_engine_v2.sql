DROP VIEW IF EXISTS public.vw_position_returns;

-- Per-position cash-flow return engine (memo v2 §4 step 2). Engine only.
--
-- Refusals are first-class. Four things can make a position's return
-- unanswerable rather than merely unflattering, and each is published as
-- `engine_status` with the figures NULLed:
--
--   incomplete_ledger  The running quantity goes negative - the book sold more
--                      than the ledger ever records buying, so the schedule is
--                      missing its opening flows and no rate is defined over
--                      it. Four names: OILK (-970.89 sh), PBR (-374.17),
--                      GDX (-35.11) and one option. PBR's first recorded flow
--                      is 2026-01-02, days after the ledger itself begins on
--                      2025-12-29 - these positions predate the history.
--                      This is the memo's `insufficient_history`.
--   stale_mark         Open, and the price behind the terminal mark is more
--                      than 7 days old. The house rule since 2026-08-18 is that
--                      a figure the data cannot support is NULL, not a number
--                      beside a flag; a return over 228 days resting on a
--                      161-day-old close is the strongest case of it yet. This
--                      is §2.6 `one_sided`: capital deployed and mark age are
--                      still published so the verdict layer can say "the peers
--                      returned X, your position is unpriced since Y".
--   no_rate            No sign change, or a root not bracketed.
--   measured           Everything else.
--
-- Options are excluded. The whole frame is equity comparables drawn from
-- `universe_correlations`; an option contract has no peer set there, and
-- `vw_performance_suite` already excludes expired ones. 9 contracts, all
-- closed, two of them sell-to-open shorts whose IRR sign convention inverts.
--
-- `position_mwr_period_pct` is the ranking input; the annualised figure is
-- derived from it, and `mwr_annualisable` says whether that derivation is
-- reportable (the same 90-day floor as `annualised_return`).

CREATE VIEW public.vw_position_returns AS
 WITH cf AS (
     SELECT c.* FROM vw_position_cash_flows c
       JOIN assets a ON a.id = c.asset_id
      WHERE COALESCE(lower(a.asset_class), '') <> 'option'
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
        sum(cf.qty_delta) AS net_qty,
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
        (a.schedule_end_date - a.first_flow_date)::int AS days_held,
        p0.close AS window_open_price,
        p1.close AS window_close_price,
        public.atlas_mwr_period(a.flow_dates, a.flow_amounts) AS mwr_period
       FROM agg a
       JOIN runq r ON r.asset_id = a.asset_id
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
            WHEN NOT c.ledger_complete                              THEN 'incomplete_ledger'
            WHEN c.is_open AND COALESCE(c.mark_days_old, 0) > 7     THEN 'stale_mark'
            WHEN c.mwr_period IS NULL                               THEN 'no_rate'
            ELSE 'measured'
        END AS engine_status
       FROM calc c
 )
 SELECT g.asset_id,
    g.symbol,
    CASE WHEN g.is_open THEN 'open'::text ELSE 'closed'::text END AS position_state,
    g.engine_status,
    CASE g.engine_status
        WHEN 'incomplete_ledger' THEN 'running quantity reaches ' || round(g.net_qty, 4)::text || ' - ledger predates the position'
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
    g.flow_dates,
    g.flow_amounts
   FROM graded g;

COMMENT ON VIEW public.vw_position_returns IS
 'Cash-flow-matched return engine per position. `position_mwr_period_pct` (money-weighted over the real holding period) is the ranking input; `position_mwr_pct` is its annualised form, published only past 90 days held. Return figures are NULL unless engine_status = ''measured'' - see engine_reason. Options excluded: no peer set in universe_correlations.';
