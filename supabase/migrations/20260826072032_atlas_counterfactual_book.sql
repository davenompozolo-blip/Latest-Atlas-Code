CREATE OR REPLACE FUNCTION public.atlas_counterfactual_book(p_asset_id uuid)
RETURNS TABLE(
    cf_capital_deployed_usd numeric,
    cf_proceeds_usd         numeric,
    cf_terminal_value_usd   numeric,
    cf_net_pnl_usd          numeric,
    cf_mwr_period_pct       double precision,
    cf_status               text,
    cf_reason               text)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
    r            record;
    book_qty     numeric := 0;
    units        numeric := 0;
    frac         numeric;
    idx          numeric;
    units_sold   numeric;
    dollars      numeric;
    cf_dates     date[]    := '{}';
    cf_amounts   numeric[] := '{}';
    deployed     numeric := 0;
    proceeds     numeric := 0;
    terminal     numeric := 0;
    mark_dt      date;
    mark_idx_dt  date;
    mark_idx     numeric;
    fail         text := NULL;
    fail_reason  text := NULL;
BEGIN
    -- The position's own mark date pins the window, exactly as the peer
    -- counterfactual does: both legs must be valued on the same day or the
    -- difference between them is partly a difference of date.
    SELECT max(c.flow_date) FILTER (WHERE c.flow_kind = 'mark')
      INTO mark_dt
      FROM vw_position_cash_flows c WHERE c.asset_id = p_asset_id;

    FOR r IN
        SELECT c.flow_date, c.flow_kind, c.qty_delta, c.flow_usd
          FROM vw_position_cash_flows c
         WHERE c.asset_id = p_asset_id AND c.flow_kind <> 'mark'
         ORDER BY c.flow_date, c.flow_kind
    LOOP
        SELECT x.ex_index INTO idx
          FROM mv_book_ex_index x
         WHERE x.asset_id = p_asset_id AND x.price_date <= r.flow_date
         ORDER BY x.price_date DESC LIMIT 1;

        IF idx IS NULL OR idx <= 0 THEN
            fail := 'no_book_index';
            fail_reason := 'rest-of-book index undefined on or before ' || r.flow_date::text;
            EXIT;
        END IF;

        IF r.flow_kind = 'buy' THEN
            dollars    := -r.flow_usd;
            units      := units + dollars / idx;
            deployed   := deployed + dollars;
            cf_dates   := cf_dates   || r.flow_date;
            cf_amounts := cf_amounts || (-dollars);
            book_qty   := book_qty + r.qty_delta;
        ELSE
            IF book_qty <= 0 THEN
                fail := 'incomplete_ledger';
                fail_reason := 'sell with no recorded holding on ' || r.flow_date::text;
                EXIT;
            END IF;
            frac       := LEAST(abs(r.qty_delta) / book_qty, 1.0);
            units_sold := units * frac;
            units      := units - units_sold;
            proceeds   := proceeds + units_sold * idx;
            cf_dates   := cf_dates   || r.flow_date;
            cf_amounts := cf_amounts || (units_sold * idx);
            book_qty   := book_qty + r.qty_delta;
        END IF;
    END LOOP;

    IF fail IS NOT NULL THEN
        RETURN QUERY SELECT NULL::numeric, NULL::numeric, NULL::numeric,
                            NULL::numeric, NULL::double precision, fail, fail_reason;
        RETURN;
    END IF;

    IF mark_dt IS NOT NULL AND units > 0 THEN
        SELECT x.ex_index, x.price_date INTO mark_idx, mark_idx_dt
          FROM mv_book_ex_index x
         WHERE x.asset_id = p_asset_id AND x.price_date <= mark_dt
         ORDER BY x.price_date DESC LIMIT 1;

        IF mark_idx IS NULL THEN
            RETURN QUERY SELECT NULL::numeric, NULL::numeric, NULL::numeric,
                                NULL::numeric, NULL::double precision,
                                'no_book_index'::text,
                                ('rest-of-book index undefined on or before mark ' || mark_dt::text)::text;
            RETURN;
        END IF;
        -- Same 7-day gate the peer leg uses. The book index only stops moving
        -- if the whole book stops pricing, so this should never fire - but an
        -- alternative valued off a stale index is the exact defect this
        -- sequence exists to remove, and a gate that never fires costs nothing.
        IF (mark_dt - mark_idx_dt) > 7 THEN
            RETURN QUERY SELECT NULL::numeric, NULL::numeric, NULL::numeric,
                                NULL::numeric, NULL::double precision,
                                'book_stale_mark'::text,
                                ('rest-of-book index ' || (mark_dt - mark_idx_dt)::text || ' days old')::text;
            RETURN;
        END IF;

        terminal   := units * mark_idx;
        cf_dates   := cf_dates   || mark_dt;
        cf_amounts := cf_amounts || terminal;
    END IF;

    cf_capital_deployed_usd := round(deployed, 2);
    cf_proceeds_usd         := round(proceeds, 2);
    cf_terminal_value_usd   := round(terminal, 2);
    cf_net_pnl_usd          := round(proceeds + terminal - deployed, 2);
    cf_mwr_period_pct       := public.atlas_mwr_period(cf_dates, cf_amounts);
    cf_status := CASE WHEN cf_mwr_period_pct IS NULL THEN 'no_rate' ELSE 'measured' END;
    cf_reason := CASE WHEN cf_mwr_period_pct IS NULL
                      THEN 'no sign change or unbracketed root' END;

    RETURN QUERY SELECT cf_capital_deployed_usd, cf_proceeds_usd,
                        cf_terminal_value_usd, cf_net_pnl_usd, cf_mwr_period_pct,
                        cf_status, cf_reason;
END;
$function$;

COMMENT ON FUNCTION public.atlas_counterfactual_book(uuid) IS
 'Tier 2 (step 4 addendum rev. B §2.3): runs a position''s own cash-flow schedule into the REST OF THE BOOK at prevailing weights instead of into a correlated peer. Available for every position, needs no peer - which matters because this book has none: 17 of 63 positions have no correlate above rho 0.65 and the median cluster at rho 0.75 is one name. Answers "did this earn its slot against my own alternatives", which is the more literal reading of the brief anyway: every dollar in a name is a dollar not spread across the other 62.';
