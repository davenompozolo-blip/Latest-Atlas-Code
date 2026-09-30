-- Step 2 (memo v2 §4) — the cash-flow return engine.
--
-- Engine only: no surface reads any of this yet. It computes, per position,
-- the dated cash-flow schedule, the money-weighted return over it, and what
-- that same schedule would have earned in a comparable. Steps 3-5 consume it.
--
-- Applied to production as a sequence of migrations while the design was being
-- corrected against live data; this file is the resulting final state and is
-- replayable on its own.
--
-- ============================================================================
-- The organising idea (memo v2 §1)
-- ============================================================================
-- Do not compute a position's return and a peer's return separately and
-- difference them. Compute what the position's OWN cash-flow schedule would
-- have earned in the comparable: same dollars, same dates, same window,
-- different symbol. That is `atlas_counterfactual` below.
--
-- ============================================================================
-- Five things live data forced, none of which were in the plan
-- ============================================================================
--
-- 1. MWR must be solved over the holding period, not annualised.
--    An annualised root leaves any sane bracket on a short window: CRWV
--    (-6.35% over 2 days) fell below -0.9999 and OILK (+3572% over 3 days)
--    rose above 100, so a numeric-conditioning failure was being reported as
--    an undefined rate. Normalising the exponents to the window puts every one
--    in [0, 1]; the annualised figure is derived from that root instead.
--
-- 2. The terminal mark is dated at the VALUATION date, never the price date.
--    KMTUY's last close is 161 days old, and it has buys three months after
--    it. Dating the mark at the price date put it mid-schedule, which added
--    sign changes and returned -79.27% MWR on a position whose undiscounted
--    flows sum to +$956 — and valued shares at a price struck before they were
--    bought.
--
-- 3. The ledger must be reconciled against the broker per position.
--    Four names disagree, by exact round lots: PBR -500 sh, GDX -100 sh,
--    NPSNY +27 sh, plus OILK's missing opening. These are absent transactions,
--    not drift. A cash-flow return over a schedule missing a 500-share buy is
--    not approximately right, it is unanswerable.
--
-- 4. `asset_class` is 'us_option', not 'option'.
--    Equality missed every contract. Both the class prefix and the OCC symbol
--    shape are now tested — either alone has been wrong here. (The same
--    equality test in `vw_performance_suite` is only saved by starting from
--    `positions`, where these expired in March.)
--
-- 5. Own-return and counterfactual are priced on different bases.
--    The position is priced at fills; a comparable has no fills, so it is
--    priced at closes. Differencing them directly folds execution quality into
--    what the module calls stock selection — and that is not a rounding error:
--    SNDK 18.71pp, AMD 11.93pp, TSLA 9.90pp. Every divergent name has multiple
--    sells; positions with none match to the last decimal. So the engine also
--    publishes the position priced at closes, and the head-to-head decomposes:
--
--        selection = cf(me, peer)            - position_mwr_close_basis_pct
--        execution = position_mwr_period_pct - position_mwr_close_basis_pct
--
-- ============================================================================


-- ----------------------------------------------------------------------------
-- atlas_xirr — annualised money-weighted return, ACT/365
--
-- Retained as the conventional XIRR (it matches Excel's documented reference
-- to nine decimals). The engine itself uses atlas_mwr_period; this is here for
-- callers that genuinely want an annualised rate over arbitrary flows.
--
-- Bisection, not Newton: n is at most ~30 flows, so iterations are free, and
-- bisection cannot diverge or depend on a seed guess the way Newton does on
-- the sign-flipping schedules a partially-sold position produces.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atlas_xirr(
    p_dates   date[],
    p_amounts numeric[]
) RETURNS double precision
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    n       int;
    t0      date;
    lo      double precision := -0.9999;
    hi      double precision := 100.0;
    mid     double precision;
    f_lo    double precision;
    f_hi    double precision;
    f_mid   double precision;
    has_pos boolean := false;
    has_neg boolean := false;
    i       int;
    iter    int;
BEGIN
    n := array_length(p_dates, 1);
    IF n IS NULL OR n < 2 THEN RETURN NULL; END IF;
    IF array_length(p_amounts, 1) IS DISTINCT FROM n THEN RETURN NULL; END IF;

    FOR i IN 1..n LOOP
        IF p_dates[i] IS NULL OR p_amounts[i] IS NULL THEN RETURN NULL; END IF;
        IF p_amounts[i] > 0 THEN has_pos := true; END IF;
        IF p_amounts[i] < 0 THEN has_neg := true; END IF;
    END LOOP;
    IF NOT (has_pos AND has_neg) THEN RETURN NULL; END IF;

    t0 := p_dates[1];

    f_lo := 0; f_hi := 0;
    FOR i IN 1..n LOOP
        f_lo := f_lo + p_amounts[i]::double precision
                     / power(1 + lo, (p_dates[i] - t0)::double precision / 365.0);
        f_hi := f_hi + p_amounts[i]::double precision
                     / power(1 + hi, (p_dates[i] - t0)::double precision / 365.0);
    END LOOP;
    IF f_lo * f_hi > 0 THEN RETURN NULL; END IF;

    FOR iter IN 1..200 LOOP
        mid := (lo + hi) / 2.0;
        f_mid := 0;
        FOR i IN 1..n LOOP
            f_mid := f_mid + p_amounts[i]::double precision
                          / power(1 + mid, (p_dates[i] - t0)::double precision / 365.0);
        END LOOP;
        IF f_mid = 0 THEN RETURN mid; END IF;
        IF f_lo * f_mid < 0 THEN hi := mid; ELSE lo := mid; f_lo := f_mid; END IF;
    END LOOP;

    RETURN (lo + hi) / 2.0;
END;
$$;

COMMENT ON FUNCTION public.atlas_xirr(date[], numeric[]) IS
 'Annualised money-weighted return (XIRR) over dated cash flows, ACT/365. Sign convention: money out negative, money in positive. NULL when the rate is undefined - no sign change, or a root not bracketed in [-0.9999, 100].';


-- ----------------------------------------------------------------------------
-- atlas_mwr_period — money-weighted return over the holding period
--
-- Exponents normalised to the window, so the solved rate IS the period return:
-- well conditioned at any window length, and for a single flow pair it
-- collapses exactly to the simple return. See note 1 above.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atlas_mwr_period(
    p_dates   date[],
    p_amounts numeric[]
) RETURNS double precision
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    n       int;
    t0      date;
    t1      date;
    span    double precision;
    lo      double precision := -0.999999;
    hi      double precision := 10000000.0;
    mid     double precision;
    f_lo    double precision;
    f_hi    double precision;
    f_mid   double precision;
    has_pos boolean := false;
    has_neg boolean := false;
    i       int;
    iter    int;
BEGIN
    n := array_length(p_dates, 1);
    IF n IS NULL OR n < 2 THEN RETURN NULL; END IF;
    IF array_length(p_amounts, 1) IS DISTINCT FROM n THEN RETURN NULL; END IF;

    t0 := p_dates[1];
    t1 := p_dates[1];
    FOR i IN 1..n LOOP
        IF p_dates[i] IS NULL OR p_amounts[i] IS NULL THEN RETURN NULL; END IF;
        IF p_dates[i] < t0 THEN t0 := p_dates[i]; END IF;
        IF p_dates[i] > t1 THEN t1 := p_dates[i]; END IF;
        IF p_amounts[i] > 0 THEN has_pos := true; END IF;
        IF p_amounts[i] < 0 THEN has_neg := true; END IF;
    END LOOP;
    IF NOT (has_pos AND has_neg) THEN RETURN NULL; END IF;

    span := (t1 - t0)::double precision;
    IF span <= 0 THEN RETURN NULL; END IF;

    f_lo := 0; f_hi := 0;
    FOR i IN 1..n LOOP
        f_lo := f_lo + p_amounts[i]::double precision
                     / power(1 + lo, (p_dates[i] - t0)::double precision / span);
        f_hi := f_hi + p_amounts[i]::double precision
                     / power(1 + hi, (p_dates[i] - t0)::double precision / span);
    END LOOP;
    IF f_lo * f_hi > 0 THEN RETURN NULL; END IF;

    FOR iter IN 1..300 LOOP
        mid := (lo + hi) / 2.0;
        -- converged: the remaining interval is far below reporting precision
        EXIT WHEN (hi - lo) <= 1e-12 * GREATEST(1.0, abs(mid));
        f_mid := 0;
        FOR i IN 1..n LOOP
            f_mid := f_mid + p_amounts[i]::double precision
                          / power(1 + mid, (p_dates[i] - t0)::double precision / span);
        END LOOP;
        IF f_mid = 0 THEN RETURN mid; END IF;
        IF f_lo * f_mid < 0 THEN hi := mid; ELSE lo := mid; f_lo := f_mid; END IF;
    END LOOP;

    RETURN (lo + hi) / 2.0;
END;
$$;

COMMENT ON FUNCTION public.atlas_mwr_period(date[], numeric[]) IS
 'Money-weighted return over the holding period (not annualised), solved by bisection with exponents normalised to the window so it is well conditioned at any window length. Money out negative, money in positive. NULL where the rate is undefined.';


-- ----------------------------------------------------------------------------
-- vw_position_cash_flows — the dated schedule, plus a terminal mark
--
-- Same-day flows stay separate rather than netted: XIRR is indifferent, and
-- the ledger genuinely fills one order across several prints (UAE's June 4
-- entry is four rows), so netting would destroy the record without simplifying
-- anything. See note 2 for the mark date, and note 5 in the returns view for
-- why the mark is worth at least $1 before it is written at all.
-- ----------------------------------------------------------------------------
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


-- ----------------------------------------------------------------------------
-- atlas_counterfactual — the matched comparable
--
-- Deliberately per-peer. §2.4 scores a position against the CLUSTER MEDIAN, so
-- the caller runs this across cluster members and takes the median; the same
-- primitive gives best-in-cluster (the regret number) for free.
--
-- Buys dollar-matched, sells fraction-matched, and the asymmetry is the point:
--   * a buy is "I deployed $X on this date" — the comparable deploys the same
--     $X at its close that day;
--   * a sell dollar-matched can demand more value than the comparable holds,
--     whenever it fell further than the position did, driving peer quantity
--     negative and silently turning the comparable into a short. Selling the
--     same FRACTION is always well defined and expresses the same decision —
--     "I took half off the table".
--
-- The window is pinned to the position's mark date, not the peer's, so both
-- legs of the head-to-head cover exactly the same days.
-- ----------------------------------------------------------------------------
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
    r            record;
    book_qty     numeric := 0;
    peer_qty     numeric := 0;
    frac         numeric;
    peer_close   numeric;
    peer_sold    numeric;
    dollars      numeric;
    cf_dates     date[]    := '{}';
    cf_amounts   numeric[] := '{}';
    deployed     numeric := 0;
    proceeds     numeric := 0;
    terminal     numeric := 0;
    mark_dt      date;
    peer_mark_dt date;
    peer_mark_px numeric;
    fail         text := NULL;
    fail_reason  text := NULL;
BEGIN
    SELECT a.symbol INTO peer_symbol FROM assets a WHERE a.id = p_peer_asset_id;
    IF peer_symbol IS NULL THEN
        RETURN QUERY SELECT NULL::text, NULL::numeric, NULL::numeric, NULL::numeric,
                            NULL::numeric, NULL::double precision,
                            'no_peer'::text, 'peer asset not found'::text;
        RETURN;
    END IF;

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


-- ----------------------------------------------------------------------------
-- vw_position_returns — the engine's output, one row per position
--
-- Refusals are first-class. `engine_status` is never NULL and the figures are
-- NULL unless it reads 'measured':
--   ledger_mismatch    ledger net quantity disagrees with the broker's (note 3)
--   incomplete_ledger  running quantity goes negative — kept as a second test
--                      because it needs no broker row, so it still covers a
--                      fully-closed name
--   stale_mark         open, mark price more than 7 days old. §2.6 one_sided:
--                      capital deployed and mark age stay published so the
--                      verdict layer can say "the peers returned X, your
--                      position is unpriced since Y"
--   no_rate            no sign change, or a root not bracketed
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.vw_position_returns;

CREATE VIEW public.vw_position_returns AS
 WITH cf AS (
     SELECT c.* FROM vw_position_cash_flows c
       JOIN assets a ON a.id = c.asset_id
      WHERE COALESCE(lower(a.asset_class), '') NOT LIKE '%option%'
        AND a.symbol !~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'
 ), broker AS (
     SELECT DISTINCT ON (p.asset_id) p.asset_id, p.quantity AS broker_qty
       FROM positions p
      WHERE p.as_of_date >= (SELECT max(positions.as_of_date) - 2 FROM positions)
      ORDER BY p.asset_id, p.as_of_date DESC
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
        sum(cf.qty_delta) FILTER (WHERE cf.flow_kind <> 'mark') AS net_qty,
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
        COALESCE(b.broker_qty, 0::numeric) AS broker_qty,
        (abs(COALESCE(b.broker_qty, 0::numeric) - a.net_qty)
            <= GREATEST(0.01::numeric, abs(a.net_qty) * 0.001::numeric)) AS broker_reconciles,
        (a.schedule_end_date - a.first_flow_date)::int AS days_held,
        p0.close AS window_open_price,
        p1.close AS window_close_price,
        public.atlas_mwr_period(a.flow_dates, a.flow_amounts) AS mwr_period,
        self_cf.cf_mwr_period_pct AS mwr_close_basis
       FROM agg a
       JOIN runq r ON r.asset_id = a.asset_id
       LEFT JOIN broker b ON b.asset_id = a.asset_id
       LEFT JOIN LATERAL public.atlas_counterfactual(a.asset_id, a.asset_id) self_cf ON true
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
            WHEN NOT c.broker_reconciles                         THEN 'ledger_mismatch'
            WHEN NOT c.ledger_complete                           THEN 'incomplete_ledger'
            WHEN c.is_open AND COALESCE(c.mark_days_old, 0) > 7  THEN 'stale_mark'
            WHEN c.mwr_period IS NULL                            THEN 'no_rate'
            ELSE 'measured'
        END AS engine_status
       FROM calc c
 )
 SELECT g.asset_id,
    g.symbol,
    CASE WHEN g.is_open THEN 'open'::text ELSE 'closed'::text END AS position_state,
    g.engine_status,
    CASE g.engine_status
        WHEN 'ledger_mismatch'   THEN 'ledger ' || round(g.net_qty, 4)::text || ' sh vs broker ' || round(g.broker_qty, 4)::text
        WHEN 'incomplete_ledger' THEN 'running quantity reaches ' || round(g.net_qty, 4)::text
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
    round(g.broker_qty, 8) AS broker_qty,
    round(g.capital_deployed_usd, 2) AS capital_deployed_usd,
    round(COALESCE(g.proceeds_usd, 0), 2) AS proceeds_usd,
    round(COALESCE(g.terminal_value_usd, 0), 2) AS terminal_value_usd,
    CASE WHEN g.engine_status IN ('measured', 'no_rate')
         THEN round(g.net_pnl_usd, 2) END AS net_pnl_usd,
    CASE WHEN g.engine_status IN ('measured', 'no_rate') AND g.capital_deployed_usd > 0
         THEN round(g.net_pnl_usd / g.capital_deployed_usd, 6) END AS simple_return_pct,
    CASE WHEN g.engine_status = 'measured'
         THEN round(g.mwr_period::numeric, 6) END AS position_mwr_period_pct,
    CASE WHEN g.engine_status = 'measured'
         THEN round(g.mwr_close_basis::numeric, 6) END AS position_mwr_close_basis_pct,
    CASE WHEN g.engine_status = 'measured' AND g.mwr_close_basis IS NOT NULL
         THEN round((g.mwr_period - g.mwr_close_basis)::numeric, 6) END AS execution_effect_pp,
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
    g.broker_reconciles,
    g.flow_dates,
    g.flow_amounts
   FROM graded g;

COMMENT ON VIEW public.vw_position_returns IS
 'Cash-flow-matched return engine per position. `position_mwr_period_pct` is the true (fill-priced) money-weighted return over the holding period and the ranking input. `position_mwr_close_basis_pct` is the same position priced at closes - the like-for-like baseline a counterfactual must be differenced against, so that selection is not contaminated by execution; their gap is `execution_effect_pp`. Figures NULL unless engine_status = ''measured''.';
