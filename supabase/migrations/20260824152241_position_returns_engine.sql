-- Per-position return engine (memo v2 §4 step 2). Engine only: no surface
-- reads this yet.
--
-- MWR (money-weighted, XIRR over the real schedule) is the ranking input.
-- TWR is context. For a single-name position TWR is just the stock's return
-- over the holding window, independent of the flows - which is exactly why
-- MWR is the interesting number: the gap between them is the timing of the
-- adds and trims, and nothing else.
--
-- `position_state` and mark staleness are separate facts, per §2.6:
--   closed    - net quantity is zero. Realised P&L is exact from the ledger
--               whatever the feed is doing; there is no mark to be stale.
--   open      - carries a terminal mark, so the rate is only as good as the
--               last close. `mark_days_old` says how good.
-- Nothing is gated here. The engine publishes the number and the age; the
-- verdict layer (step 4) decides what is reportable.

CREATE OR REPLACE VIEW public.vw_position_returns AS
 WITH cf AS (
     SELECT * FROM vw_position_cash_flows
 ), agg AS (
     SELECT cf.asset_id, cf.symbol,
        min(cf.flow_date) FILTER (WHERE cf.flow_kind <> 'mark') AS first_flow_date,
        max(cf.flow_date) FILTER (WHERE cf.flow_kind <> 'mark') AS last_trade_date,
        max(cf.flow_date) AS schedule_end_date,
        max(cf.mark_days_old) AS mark_days_old,
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
 ), windowed AS (
     SELECT a.*,
        p0.close AS window_open_price,
        p1.close AS window_close_price
       FROM agg a
       LEFT JOIN LATERAL ( SELECT ph.close FROM price_history ph
              WHERE ph.asset_id = a.asset_id AND ph."interval" = '1d'::text
                AND ph.price_date <= a.first_flow_date
              ORDER BY ph.price_date DESC LIMIT 1) p0 ON true
       LEFT JOIN LATERAL ( SELECT ph.close FROM price_history ph
              WHERE ph.asset_id = a.asset_id AND ph."interval" = '1d'::text
                AND ph.price_date <= a.schedule_end_date
              ORDER BY ph.price_date DESC LIMIT 1) p1 ON true
 )
 SELECT w.asset_id,
    w.symbol,
    CASE WHEN w.is_open THEN 'open'::text ELSE 'closed'::text END AS position_state,
    w.first_flow_date,
    w.last_trade_date,
    w.schedule_end_date,
    (w.schedule_end_date - w.first_flow_date)::int AS days_held,
    w.n_buys,
    w.n_sells,
    round(w.net_qty, 8) AS net_qty,
    round(w.capital_deployed_usd, 2) AS capital_deployed_usd,
    round(COALESCE(w.proceeds_usd, 0), 2) AS proceeds_usd,
    round(COALESCE(w.terminal_value_usd, 0), 2) AS terminal_value_usd,
    round(w.net_pnl_usd, 2) AS net_pnl_usd,
    CASE WHEN w.capital_deployed_usd > 0
         THEN round(w.net_pnl_usd / w.capital_deployed_usd, 6) END AS simple_return_pct,
    public.atlas_xirr(w.flow_dates, w.flow_amounts) AS position_mwr_pct,
    CASE WHEN w.window_open_price > 0
         THEN round(w.window_close_price / w.window_open_price - 1, 6) END AS position_twr_pct,
    w.window_open_price,
    w.window_close_price,
    w.mark_days_old,
    w.flow_dates,
    w.flow_amounts
   FROM windowed w;

COMMENT ON VIEW public.vw_position_returns IS
 'Cash-flow-matched return engine per position: MWR (XIRR over the real dated schedule, the ranking input), TWR (the stock over the holding window, context), realised P&L and capital deployed. Publishes mark staleness rather than gating on it - the verdict layer decides what is reportable.';
