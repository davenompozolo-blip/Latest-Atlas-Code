CREATE OR REPLACE VIEW public.vw_position_price_basis AS
WITH fills AS (
    SELECT c.asset_id, c.symbol, c.flow_date, c.unit_price
      FROM public.vw_position_cash_flows c
      JOIN public.assets a ON a.id = c.asset_id
     WHERE c.flow_kind <> 'mark'
       AND c.unit_price > 0
       -- Options are excluded. A single fill against a thin contract tape can
       -- differ from the close by a lot without either being wrong, and
       -- CLAUDE.md's rule applies: test the class prefix AND the OCC symbol
       -- shape, because either alone has been wrong here before.
       AND COALESCE(a.asset_class, '') NOT LIKE 'us_option%'
       AND c.symbol !~ '^[A-Z]+[0-9]{6}[CP][0-9]{8}$'
),
rated AS (
    SELECT f.asset_id, f.symbol, f.flow_date, f.unit_price,
           (SELECT ph.close FROM public.price_history ph
             WHERE ph.asset_id = f.asset_id AND ph."interval" = '1d'
               AND ph.price_date <= f.flow_date
             ORDER BY ph.price_date DESC LIMIT 1) AS tape_close
      FROM fills f
),
r AS (
    SELECT asset_id, symbol, flow_date, unit_price, tape_close,
           unit_price / tape_close AS ratio
      FROM rated
     WHERE tape_close > 0
)
SELECT asset_id,
       symbol,
       count(*)                                                    AS fills_checked,
       count(*) FILTER (WHERE ratio NOT BETWEEN 0.7 AND 1.4)       AS fills_off_basis,
       min(ratio)                                                  AS min_ratio,
       max(ratio)                                                  AS max_ratio,
       (count(*) FILTER (WHERE ratio NOT BETWEEN 0.7 AND 1.4) = 0) AS basis_ok
  FROM r
 GROUP BY asset_id, symbol;

COMMENT ON VIEW public.vw_position_price_basis IS
 'Does the ledger price the same shares price_history does? Compares every fill''s unit_price against the tape close on that date. A fill is intraday so it can differ from the close by a few percent; it cannot differ by a factor. Where it does, an unadjusted corporate action has put the ledger and the tape on different share bases, and any figure multiplying ledger quantity by tape price is fabricated. Found by the frozen-weight baseline publishing DD at +229.75%: 9 of its 10 fills sit at ~1:3 to the tape (41-49 against 122-136), while its final fill at 138.75 matches - a spin-off the price feed adjusted for and the ledger did not. DD is closed, so no open position is affected today. Options are excluded: one fill against a thin contract tape can legitimately differ by a lot.';

GRANT SELECT ON public.vw_position_price_basis TO anon, authenticated, service_role;
