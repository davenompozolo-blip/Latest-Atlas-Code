-- MWR is an annualised rate, so a short window explodes it exactly the way
-- `annualised_return` did before the 90-day floor: AMGN, held 7 days for a
-- +6.18% move, produced **+2,182.99% MWR**; AMD's +54.75% became +829.49%.
--
-- The memo names `position_mwr_pct` as the ranking input, and nulling it below
-- 90 days would leave 14 positions unrankable. So publish both roots of the
-- same number:
--
--   position_mwr_pct        annualised. Context. Comparable across positions
--                           only where the window supports annualising, which
--                           `mwr_annualisable` states.
--   position_mwr_period_pct de-annualised back to the actual holding period.
--                           Always well-behaved, always comparable, and the
--                           number to rank on. For a single-flow position it
--                           collapses to the simple return, as it should:
--                           AMGN 6.18%.
--
-- No gating here. The engine publishes the figure and the quality flag; the
-- verdict layer at step 4 decides what is reportable - the same division of
-- duty as `mark_days_old`.
--
-- Columns appended, not inserted: CREATE OR REPLACE VIEW cannot reorder.

CREATE OR REPLACE VIEW public.vw_position_returns AS
 WITH cf AS (
     SELECT * FROM vw_position_cash_flows
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
 ), windowed AS (
     SELECT a.*,
        p0.close AS window_open_price,
        p1.close AS window_close_price,
        public.atlas_xirr(a.flow_dates, a.flow_amounts) AS mwr
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
    w.mwr AS position_mwr_pct,
    CASE WHEN w.window_open_price > 0
         THEN round(w.window_close_price / w.window_open_price - 1, 6) END AS position_twr_pct,
    w.window_open_price,
    w.window_close_price,
    w.mark_days_old,
    w.flow_dates,
    w.flow_amounts,
    -- de-annualised to the real holding period: the ranking input
    CASE WHEN w.mwr IS NOT NULL AND (w.schedule_end_date - w.first_flow_date) > 0
         THEN round((power(1 + w.mwr, (w.schedule_end_date - w.first_flow_date)::double precision / 365.0) - 1)::numeric, 6)
    END AS position_mwr_period_pct,
    ((w.schedule_end_date - w.first_flow_date) >= 90) AS mwr_annualisable,
    w.mark_price_date
   FROM windowed w;

COMMENT ON VIEW public.vw_position_returns IS
 'Cash-flow-matched return engine per position. `position_mwr_period_pct` (money-weighted over the real holding period) is the ranking input; `position_mwr_pct` is its annualised form and is only comparable where `mwr_annualisable`. TWR is the stock over the window - the gap between TWR and MWR is the timing of the adds and trims. Publishes quality flags rather than gating; the verdict layer decides what is reportable.';
