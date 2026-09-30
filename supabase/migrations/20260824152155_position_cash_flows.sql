-- The dated cash-flow schedule per position, plus a terminal mark-to-market.
-- Sign convention: money out of pocket negative, money in positive.
--
-- Same-day flows are kept as separate rows rather than netted. XIRR is
-- indifferent, and the ledger genuinely fills one order across several prints
-- (UAE's June 4 entry is four rows), so netting would destroy the record
-- without simplifying the maths.
--
-- The terminal row is a *mark*, not a trade: it closes the schedule at the
-- position's latest available close so an open position has a computable rate.
-- Its staleness is published as `mark_days_old` because for the OTC ADRs that
-- close is months old - the consumer decides whether the rate is reportable
-- (memo v2 §2.6 `one_sided`), and this view never makes that call by silently
-- marking at a dead price.

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
     SELECT flows.asset_id, flows.symbol, sum(flows.qty_delta) AS net_qty
       FROM flows GROUP BY flows.asset_id, flows.symbol
 ), mark AS (
     SELECT n.asset_id, n.symbol, n.net_qty, px.close, px.price_date
       FROM net n
       CROSS JOIN LATERAL ( SELECT ph.close, ph.price_date
              FROM price_history ph
             WHERE ph.asset_id = n.asset_id AND ph."interval" = '1d'::text
             ORDER BY ph.price_date DESC
            LIMIT 1) px
      WHERE n.net_qty > 1e-9::numeric
 )
 SELECT f.asset_id, f.symbol, f.flow_date, f.flow_kind, f.qty_delta, f.flow_usd,
        f.unit_price, NULL::int AS mark_days_old
   FROM flows f
 UNION ALL
 SELECT m.asset_id, m.symbol, m.price_date, 'mark'::text, 0::numeric,
        m.net_qty * m.close, m.close, (CURRENT_DATE - m.price_date)::int
   FROM mark m;

COMMENT ON VIEW public.vw_position_cash_flows IS
 'Dated cash flows per position from the filled ledger, plus a terminal mark-to-market row (flow_kind=''mark'') for positions still open. Money out negative, money in positive. `mark_days_old` is set on the mark row only.';
