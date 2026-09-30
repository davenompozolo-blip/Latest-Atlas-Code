-- Two corrections to the cash-flow view.
--
-- 1. Option detection. `asset_class` is **'us_option'**, not 'option', so a
--    filter on equality missed every contract. `vw_performance_suite` carries
--    the same equality test and is only saved by starting from `positions`,
--    where these expired in March. Test both the class prefix and the OCC
--    symbol shape - either alone has been wrong here.
--
-- 2. Dust. PROSY's broker quantity is 0.00001183 shares - the position is gone,
--    and the memo says so ("PROSY has left the book"). A `net_qty > 1e-9`
--    threshold called that open and hung a 147-day-stale mark on it. Mark only
--    when the residual is worth at least $1: a share count cannot tell dust
--    from a position without knowing the price.

CREATE OR REPLACE VIEW public.vw_position_cash_flows AS
 WITH flows AS (
     SELECT t.asset_id,
        a.symbol,
        t.transaction_date::date AS flow_date,
        CASE WHEN lower(t.transaction_type) ~~ '%sell%' THEN 'sell' ELSE 'buy' END AS flow_kind,
        CASE WHEN lower(t.transaction_type) ~~ '%sell%'
             THEN -abs(t.quantity)
             ELSE  abs(t.quantity) END AS qty_delta,
        CASE WHEN lower(t.transaction_type) ~~ '%sell%'
             THEN  (abs(t.quantity) * t.price - COALESCE(t.fees, 0))
             ELSE -(abs(t.quantity) * t.price + COALESCE(t.fees, 0)) END AS flow_usd,
        t.price AS unit_price
       FROM vw_filled_transactions t
         JOIN assets a ON a.id = t.asset_id
      WHERE a.symbol <> '$CASH'::text
        AND t.quantity IS NOT NULL
        AND abs(t.quantity) > 0
 ), net AS (
     SELECT flows.asset_id, flows.symbol,
        sum(flows.qty_delta) AS net_qty,
        max(flows.flow_date) AS last_trade_date
       FROM flows GROUP BY flows.asset_id, flows.symbol
 ), mark AS (
     SELECT n.asset_id, n.symbol, n.net_qty,
        px.close, px.price_date,
        GREATEST(public.atlas_last_traded_day(), n.last_trade_date) AS mark_date
       FROM net n
       CROSS JOIN LATERAL ( SELECT ph.close, ph.price_date
              FROM price_history ph
             WHERE ph.asset_id = n.asset_id AND ph."interval" = '1d'::text
             ORDER BY ph.price_date DESC
            LIMIT 1) px
      WHERE n.net_qty > 0 AND n.net_qty * px.close >= 1.0::numeric
 )
 SELECT f.asset_id, f.symbol, f.flow_date, f.flow_kind, f.qty_delta, f.flow_usd,
        f.unit_price, NULL::int AS mark_days_old, NULL::date AS mark_price_date
   FROM flows f
 UNION ALL
 SELECT m.asset_id, m.symbol, m.mark_date, 'mark'::text, 0::numeric,
        m.net_qty * m.close, m.close,
        (public.atlas_last_traded_day() - m.price_date)::int, m.price_date
   FROM mark m;

COMMENT ON VIEW public.vw_position_cash_flows IS
 'Dated cash flows per position from the filled ledger, plus a terminal mark-to-market row (flow_kind=''mark'') for open positions worth at least $1, dated at the valuation date - never at the price date, which for a stale feed can precede later trades. `mark_price_date` and `mark_days_old` say how old the price behind the mark is.';
