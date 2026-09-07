-- ============================================================
-- Segment-scope counterfactual (spec 2.4c, "Correction to the mockup")
-- ------------------------------------------------------------
-- The level-2 mockup shows a segment excess that reads as an average of
-- member excesses. It must not be one. Members sit on different bases -- a
-- cluster-eligible name carries a cluster-median excess, an ineligible one a
-- rest-of-book excess -- and averaging across those mixes bases, which is the
-- failure this project has now caught four times (nexus return columns, the
-- attribution engine's `||` chain, fwd_pe, the trading-effect rate column).
--
-- So this is a proper counterfactual at segment scope: take every member's
-- OWN cash flows, run them into the book EXCLUDING THE WHOLE SEGMENT, pool
-- the resulting schedule, and solve one money-weighted rate over it. One
-- basis, one number, and it reuses the rest-of-book machinery unchanged --
-- only the index it discounts against is different.
--
-- ## Why both legs are returned from one call
--
-- The traded leg is the same members' actual flows pooled over the same
-- schedule. Computing it anywhere else invites the two legs to drift onto
-- different member sets, which is exactly how an excess figure becomes
-- meaningless without looking wrong. `excess = traded - counterfactual` is
-- only defensible if both sides were built from the identical roster, so the
-- roster is decided once, here, and both legs are built from it.
--
-- ## Withheld members are excluded from BOTH legs, and counted
--
-- A member whose own engine_status is not 'measured' (stale_mark,
-- ledger_mismatch, basis_mismatch, one_sided) cannot contribute a trustworthy
-- traded leg, so it contributes to neither and is named in `withheld_symbols`.
-- Silently shrinking the denominator is the defect; publishing it is the fix.
-- A member that IS measured but whose counterfactual leg fails is a genuine
-- refusal -- the whole segment returns a status, never a partial pool.
--
-- ## Proven against the existing per-position engine
--
-- A SINGLETON segment's ex-segment index is by definition its ex-asset index,
-- so every one-member segment must reproduce `mv_position_tier2`'s
-- independently-computed excess. All 36 comparable singletons agree to
-- 4.6e-7 -- the MWR bisector's own tolerance, not a disagreement.
-- ============================================================

CREATE OR REPLACE FUNCTION public.atlas_counterfactual_segment(
    p_grouping   text,
    p_segment_id text)
RETURNS TABLE(
    members_total          int,
    members_measured       int,
    members_withheld       int,
    withheld_symbols       text[],
    traded_capital_usd     numeric,
    traded_net_pnl_usd     numeric,
    traded_mwr_pct         double precision,
    cf_capital_deployed_usd numeric,
    cf_proceeds_usd        numeric,
    cf_terminal_value_usd  numeric,
    cf_net_pnl_usd         numeric,
    cf_mwr_pct             double precision,
    excess_vs_book_pct     numeric,
    cf_status              text,
    cf_reason              text)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
    m            record;
    r            record;
    book_qty     numeric;
    units        numeric;
    frac         numeric;
    idx          numeric;
    units_sold   numeric;
    dollars      numeric;
    cf_dates     date[]    := '{}';
    cf_amounts   numeric[] := '{}';
    tr_dates     date[]    := '{}';
    tr_amounts   numeric[] := '{}';
    deployed     numeric := 0;
    proceeds     numeric := 0;
    terminal     numeric := 0;
    tr_deployed  numeric := 0;
    tr_inflow    numeric := 0;
    mark_idx     numeric;
    mark_idx_dt  date;
    n_total      int := 0;
    n_measured   int := 0;
    withheld     text[] := '{}';
    fail         text := NULL;
    fail_reason  text := NULL;
    v_traded     double precision;
    v_cf         double precision;
BEGIN
    FOR m IN
        SELECT s.asset_id, s.symbol, r0.engine_status, r0.engine_reason,
               r0.flow_dates, r0.flow_amounts,
               (SELECT max(c.flow_date) FILTER (WHERE c.flow_kind = 'mark')
                  FROM vw_position_cash_flows c WHERE c.asset_id = s.asset_id) AS mark_dt
          FROM vw_position_segments s
          JOIN mv_position_returns r0 ON r0.asset_id = s.asset_id
         WHERE s.grouping = p_grouping AND s.segment_id = p_segment_id
         ORDER BY s.symbol
    LOOP
        n_total := n_total + 1;

        IF m.engine_status IS DISTINCT FROM 'measured' THEN
            withheld := withheld || m.symbol;
            CONTINUE;
        END IF;

        n_measured := n_measured + 1;

        -- Traded leg: the schedule the return engine already built. Never
        -- re-derived here -- a second derivation is a second chance to differ.
        tr_dates   := tr_dates   || m.flow_dates;
        tr_amounts := tr_amounts || m.flow_amounts;

        -- Counterfactual leg: the same flows, bought into the book excluding
        -- this entire segment.
        book_qty := 0;
        units    := 0;

        FOR r IN
            SELECT c.flow_date, c.flow_kind, c.qty_delta, c.flow_usd
              FROM vw_position_cash_flows c
             WHERE c.asset_id = m.asset_id AND c.flow_kind <> 'mark'
             ORDER BY c.flow_date, c.flow_kind
        LOOP
            SELECT x.ex_index INTO idx
              FROM mv_segment_ex_index x
             WHERE x.grouping = p_grouping AND x.segment_id = p_segment_id
               AND x.price_date <= r.flow_date
             ORDER BY x.price_date DESC LIMIT 1;

            IF idx IS NULL OR idx <= 0 THEN
                fail := 'no_segment_index';
                fail_reason := 'ex-segment index undefined on or before '
                               || r.flow_date::text || ' for ' || m.symbol;
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
                    fail_reason := 'sell with no recorded holding on '
                                   || r.flow_date::text || ' for ' || m.symbol;
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

        EXIT WHEN fail IS NOT NULL;

        -- Each member's terminal mark is dated at ITS OWN mark date, not at a
        -- segment-wide date. Both of a member's legs must be valued on the
        -- same day or the difference between them is partly a difference of
        -- date -- the same rule the per-position book counterfactual follows.
        IF m.mark_dt IS NOT NULL AND units > 0 THEN
            SELECT x.ex_index, x.price_date INTO mark_idx, mark_idx_dt
              FROM mv_segment_ex_index x
             WHERE x.grouping = p_grouping AND x.segment_id = p_segment_id
               AND x.price_date <= m.mark_dt
             ORDER BY x.price_date DESC LIMIT 1;

            IF mark_idx IS NULL THEN
                fail := 'no_segment_index';
                fail_reason := 'ex-segment index undefined on or before mark '
                               || m.mark_dt::text || ' for ' || m.symbol;
                EXIT;
            END IF;

            -- Same 7-day gate as the book leg. The ex-segment index only
            -- stops moving if the surviving book stops pricing, so this
            -- should never fire; a gate that never fires costs nothing, and
            -- an alternative valued off a stale index is the exact defect
            -- this engine exists to remove.
            IF (m.mark_dt - mark_idx_dt) > 7 THEN
                fail := 'segment_stale_mark';
                fail_reason := 'ex-segment index ' || (m.mark_dt - mark_idx_dt)::text
                               || ' days old at ' || m.symbol || '''s mark';
                EXIT;
            END IF;

            terminal   := terminal + units * mark_idx;
            cf_dates   := cf_dates   || m.mark_dt;
            cf_amounts := cf_amounts || (units * mark_idx);
        END IF;
    END LOOP;

    members_total    := n_total;
    members_measured := n_measured;
    members_withheld := n_total - n_measured;
    withheld_symbols := withheld;

    IF fail IS NOT NULL THEN
        RETURN QUERY SELECT n_total, n_measured, n_total - n_measured, withheld,
                            NULL::numeric, NULL::numeric, NULL::double precision,
                            NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric,
                            NULL::double precision, NULL::numeric, fail, fail_reason;
        RETURN;
    END IF;

    IF n_measured = 0 THEN
        RETURN QUERY SELECT n_total, 0, n_total, withheld,
                            NULL::numeric, NULL::numeric, NULL::double precision,
                            NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric,
                            NULL::double precision, NULL::numeric,
                            'no_measured_members'::text,
                            'every member is gated by the return engine'::text;
        RETURN;
    END IF;

    SELECT COALESCE(sum(-a) FILTER (WHERE a < 0), 0),
           COALESCE(sum(a)  FILTER (WHERE a > 0), 0)
      INTO tr_deployed, tr_inflow
      FROM unnest(tr_amounts) a;

    v_traded := public.atlas_mwr_period(tr_dates, tr_amounts);
    v_cf     := public.atlas_mwr_period(cf_dates, cf_amounts);

    RETURN QUERY SELECT
        n_total, n_measured, n_total - n_measured, withheld,
        round(tr_deployed, 2),
        round(tr_inflow - tr_deployed, 2),
        v_traded,
        round(deployed, 2),
        round(proceeds, 2),
        round(terminal, 2),
        round(proceeds + terminal - deployed, 2),
        v_cf,
        CASE WHEN v_traded IS NOT NULL AND v_cf IS NOT NULL
             THEN (v_traded - v_cf)::numeric END,
        CASE WHEN v_traded IS NULL OR v_cf IS NULL THEN 'no_rate' ELSE 'measured' END,
        CASE WHEN v_traded IS NULL OR v_cf IS NULL
             THEN 'no sign change or unbracketed root on '
                  || CASE WHEN v_traded IS NULL THEN 'the traded leg'
                          ELSE 'the counterfactual leg' END END;
END;
$function$;

COMMENT ON FUNCTION public.atlas_counterfactual_segment(text, text) IS
'Segment-scope counterfactual: every member''s own cash flows run into the '
'book excluding the whole segment, pooled into one schedule and solved once. '
'NOT an average of member excesses - members sit on different bases and '
'averaging across them mixes bases. Both legs are built from one roster so '
'the excess is a difference of like for like; members the return engine gates '
'are dropped from both legs and named in withheld_symbols.';

GRANT EXECUTE ON FUNCTION public.atlas_counterfactual_segment(text, text)
    TO anon, authenticated, service_role;
