CREATE OR REPLACE FUNCTION public.atlas_counterfactual_frozen(
    p_asset_id       uuid,
    p_valuation_date date DEFAULT NULL)
RETURNS TABLE(
    frozen_entry_date        date,
    frozen_qty               numeric,
    frozen_capital_usd       numeric,
    frozen_terminal_usd      numeric,
    frozen_mark_price        numeric,
    frozen_mark_date         date,
    frozen_return_pct        double precision,
    frozen_status            text,
    frozen_reason            text)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
    val_dt    date;
    d0        date;
    qty0      numeric;
    usd0      numeric;
    px        numeric;
    px_dt     date;
BEGIN
    -- Default valuation date is the book's own as-of: the newest mark any
    -- position carries. Passing it explicitly keeps every position on ONE
    -- date, which is what makes the book-level frozen figure additive.
    val_dt := COALESCE(
        p_valuation_date,
        (SELECT max(c.flow_date) FROM vw_position_cash_flows c WHERE c.flow_kind = 'mark'));

    -- The opening position: every fill on the first day it was bought. A
    -- position opened across three fills in one morning opened once.
    SELECT c.flow_date, sum(c.qty_delta), -sum(c.flow_usd)
      INTO d0, qty0, usd0
      FROM vw_position_cash_flows c
     WHERE c.asset_id = p_asset_id AND c.flow_kind = 'buy'
       AND c.flow_date = (SELECT min(c2.flow_date) FROM vw_position_cash_flows c2
                           WHERE c2.asset_id = p_asset_id AND c2.flow_kind = 'buy')
     GROUP BY c.flow_date;

    IF d0 IS NULL OR qty0 IS NULL OR qty0 <= 0 OR usd0 IS NULL OR usd0 <= 0 THEN
        RETURN QUERY SELECT NULL::date, NULL::numeric, NULL::numeric, NULL::numeric,
                            NULL::numeric, NULL::date, NULL::double precision,
                            'no_opening_buy'::text,
                            'no priced opening purchase in the ledger'::text;
        RETURN;
    END IF;

    SELECT ph.close, ph.price_date INTO px, px_dt
      FROM price_history ph
     WHERE ph.asset_id = p_asset_id AND ph."interval" = '1d'
       AND ph.price_date <= val_dt
     ORDER BY ph.price_date DESC LIMIT 1;

    IF px IS NULL OR px <= 0 THEN
        RETURN QUERY SELECT d0, qty0, round(usd0,2), NULL::numeric,
                            NULL::numeric, NULL::date, NULL::double precision,
                            'no_price'::text,
                            ('no close on or before ' || val_dt::text)::text;
        RETURN;
    END IF;

    -- Same 7-day staleness gate the rest of the engine uses. A do-nothing
    -- baseline marked off a dead print is a fabricated benchmark, and it would
    -- be the number the traded book gets graded against.
    IF (val_dt - px_dt) > 7 THEN
        RETURN QUERY SELECT d0, qty0, round(usd0,2), NULL::numeric,
                            px, px_dt, NULL::double precision,
                            'stale_mark'::text,
                            ('mark ' || (val_dt - px_dt)::text || ' days old')::text;
        RETURN;
    END IF;

    frozen_entry_date   := d0;
    frozen_qty          := qty0;
    frozen_capital_usd  := round(usd0, 2);
    frozen_terminal_usd := round(qty0 * px, 2);
    frozen_mark_price   := px;
    frozen_mark_date    := px_dt;
    -- Solved through the same bisection as every other leg, so the traded and
    -- frozen figures are the same statistic and their difference means
    -- something. For a two-flow schedule this equals the price return; running
    -- it through the solver anyway is what "same engine, alternative schedule"
    -- means, and keeps the two comparable if the schedule ever grows.
    frozen_return_pct   := public.atlas_mwr_period(
                               ARRAY[d0, px_dt]::date[],
                               ARRAY[-usd0, qty0 * px]::numeric[]);
    frozen_status := CASE WHEN frozen_return_pct IS NULL THEN 'no_rate' ELSE 'measured' END;
    frozen_reason := CASE WHEN frozen_return_pct IS NULL
                          THEN 'no sign change or unbracketed root' END;

    RETURN QUERY SELECT frozen_entry_date, frozen_qty, frozen_capital_usd,
                        frozen_terminal_usd, frozen_mark_price, frozen_mark_date,
                        frozen_return_pct, frozen_status, frozen_reason;
END;
$function$;

COMMENT ON FUNCTION public.atlas_counterfactual_frozen(uuid, date) IS
 'The do-nothing baseline (step 4 addendum rev. B §4, §5): the position as opened - every fill on its first buy day - held untouched to the book''s valuation date. Never added to, never trimmed. Differenced against the traded money-weighted return it gives trading_effect_pct, the one number answering "did my trading help". A closed position is still held in the frozen world, which is the point: selling early is a trading decision and this is what it is graded against.';
