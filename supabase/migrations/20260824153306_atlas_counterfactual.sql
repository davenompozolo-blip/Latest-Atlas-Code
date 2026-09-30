-- The matched counterfactual (memo v2 §1): what this position's own cash-flow
-- schedule would have earned in a comparable. Same dollars, same dates, same
-- holding window, different symbol.
--
-- This is the primitive, deliberately per-peer. §2.4 scores a position against
-- the *cluster median*, so the caller runs this across cluster members and
-- takes the median of the results; and the same primitive gives
-- best-in-cluster (the regret number) for free.
--
-- Buys are dollar-matched, sells are fraction-matched, and the asymmetry is
-- deliberate:
--   * A buy is "I deployed $X on this date" - the counterfactual deploys the
--     same $X at the peer's close that day.
--   * A sell dollar-matched can demand more value than the counterfactual
--     holds, whenever the peer fell further than the position did, which drives
--     peer quantity negative and silently turns the comparable into a short.
--     Selling the same *fraction* of the holding is always well defined and
--     expresses the same decision - "I took half off the table" - so it is the
--     honest match.
--
-- Refuses rather than approximates:
--   no_peer_price     the peer has no close on or before a flow date, so the
--                     counterfactual cannot be constructed at that point
--   peer_stale_mark   the peer's own mark is more than 7 days old
--   no_rate           the resulting schedule has no defined rate
--
-- The window is pinned to the position's mark date, not the peer's, so both
-- legs of the head-to-head cover exactly the same days.

CREATE OR REPLACE FUNCTION public.atlas_counterfactual(
    p_asset_id      uuid,
    p_peer_asset_id uuid
) RETURNS TABLE (
    peer_symbol             text,
    cf_capital_deployed_usd numeric,
    cf_proceeds_usd         numeric,
    cf_terminal_value_usd   numeric,
    cf_net_pnl_usd          numeric,
    cf_mwr_period_pct       double precision,
    cf_status               text,
    cf_reason               text
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    r              record;
    book_qty       numeric := 0;
    peer_qty       numeric := 0;
    frac           numeric;
    peer_close     numeric;
    peer_sold      numeric;
    dollars        numeric;
    cf_dates       date[]   := '{}';
    cf_amounts     numeric[] := '{}';
    deployed       numeric := 0;
    proceeds       numeric := 0;
    terminal       numeric := 0;
    mark_dt        date;
    peer_mark_dt   date;
    peer_mark_px   numeric;
    fail           text := NULL;
    fail_reason    text := NULL;
BEGIN
    SELECT a.symbol INTO peer_symbol FROM assets a WHERE a.id = p_peer_asset_id;
    IF peer_symbol IS NULL THEN
        RETURN QUERY SELECT NULL::text, NULL::numeric, NULL::numeric, NULL::numeric,
                            NULL::numeric, NULL::double precision,
                            'no_peer'::text, 'peer asset not found'::text;
        RETURN;
    END IF;

    -- the position's own mark date pins the window for both legs
    SELECT max(c.flow_date) FILTER (WHERE c.flow_kind = 'mark')
      INTO mark_dt
      FROM vw_position_cash_flows c WHERE c.asset_id = p_asset_id;

    FOR r IN
        SELECT c.flow_date, c.flow_kind, c.qty_delta, c.flow_usd
          FROM vw_position_cash_flows c
         WHERE c.asset_id = p_asset_id AND c.flow_kind <> 'mark'
         ORDER BY c.flow_date, c.flow_kind
    LOOP
        SELECT ph.close INTO peer_close
          FROM price_history ph
         WHERE ph.asset_id = p_peer_asset_id AND ph."interval" = '1d'
           AND ph.price_date <= r.flow_date
         ORDER BY ph.price_date DESC LIMIT 1;

        IF peer_close IS NULL OR peer_close <= 0 THEN
            fail := 'no_peer_price';
            fail_reason := 'peer has no close on or before ' || r.flow_date::text;
            EXIT;
        END IF;

        IF r.flow_kind = 'buy' THEN
            dollars    := -r.flow_usd;
            peer_qty   := peer_qty + dollars / peer_close;
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
            peer_sold  := peer_qty * frac;
            peer_qty   := peer_qty - peer_sold;
            proceeds   := proceeds + peer_sold * peer_close;
            cf_dates   := cf_dates   || r.flow_date;
            cf_amounts := cf_amounts || (peer_sold * peer_close);
            book_qty   := book_qty + r.qty_delta;
        END IF;
    END LOOP;

    IF fail IS NOT NULL THEN
        RETURN QUERY SELECT peer_symbol, NULL::numeric, NULL::numeric, NULL::numeric,
                            NULL::numeric, NULL::double precision, fail, fail_reason;
        RETURN;
    END IF;

    IF mark_dt IS NOT NULL AND peer_qty > 0 THEN
        SELECT ph.close, ph.price_date INTO peer_mark_px, peer_mark_dt
          FROM price_history ph
         WHERE ph.asset_id = p_peer_asset_id AND ph."interval" = '1d'
           AND ph.price_date <= mark_dt
         ORDER BY ph.price_date DESC LIMIT 1;

        IF peer_mark_px IS NULL THEN
            RETURN QUERY SELECT peer_symbol, NULL::numeric, NULL::numeric, NULL::numeric,
                                NULL::numeric, NULL::double precision,
                                'no_peer_price'::text,
                                ('peer has no close on or before mark ' || mark_dt::text)::text;
            RETURN;
        END IF;
        IF (mark_dt - peer_mark_dt) > 7 THEN
            RETURN QUERY SELECT peer_symbol, NULL::numeric, NULL::numeric, NULL::numeric,
                                NULL::numeric, NULL::double precision,
                                'peer_stale_mark'::text,
                                ('peer mark ' || (mark_dt - peer_mark_dt)::text || ' days old')::text;
            RETURN;
        END IF;

        terminal   := peer_qty * peer_mark_px;
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

    RETURN QUERY SELECT peer_symbol, cf_capital_deployed_usd, cf_proceeds_usd,
                        cf_terminal_value_usd, cf_net_pnl_usd, cf_mwr_period_pct,
                        cf_status, cf_reason;
END;
$$;

COMMENT ON FUNCTION public.atlas_counterfactual(uuid, uuid) IS
 'What a position''s own cash-flow schedule would have earned in a comparable: buys dollar-matched, sells fraction-matched, window pinned to the position''s mark date. The per-peer primitive behind the cluster-median score and the best-in-cluster regret number.';
