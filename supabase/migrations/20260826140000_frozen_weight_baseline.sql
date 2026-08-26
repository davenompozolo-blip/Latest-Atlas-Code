-- Step 4 §8.6 — the frozen-weight baseline. Same engine, alternative schedule.
--
-- The do-nothing book: every position as opened - every fill on its first buy
-- day - held untouched to one shared valuation date. Never added to, never
-- trimmed. Differenced against what was actually traded it gives
-- `trading_effect_pct`, which rev. B §4 calls the one number answering "did my
-- trading help".
--
-- A closed position is still held in the frozen world. That is the point:
-- selling is a trading decision, and this is what it gets graded against.
-- Which is also why the valuation date is a parameter rather than each
-- position picking its own mark - the book-level figure is only additive if
-- every frozen leg is valued on the same day.
--
-- The frozen leg is solved through `atlas_mwr_period`, the same bisection as
-- every other leg. For a two-flow schedule that equals the price return and
-- the solver is redundant; running it anyway is what "same engine" means, and
-- keeps the two figures the same statistic so their difference is meaningful.
--
-- ## Result
--
--   traded book   +11.37%
--   frozen book   +12.73%
--   trading effect  -1.37pp        over 77 comparable positions
--
-- Per position: 36 trades helped, 41 hurt, mean -2.33pp, median 0.00pp. So
-- most trades did nothing and the tail is mildly negative — the do-nothing
-- book wins by a little. Exactly the finding §4 says the column exists for.
--
-- Best and worst:
--   GILD  traded +92.23%  frozen +19.26%   +72.97pp
--   AMD          +189.40%        +146.29%  +43.11pp
--   SGRP         -27.96%          -66.91%  +38.95pp   (sold early, correctly)
--   HMY          -28.97%          +12.20%  -41.17pp
--   COP          +11.03%          +44.54%  -33.51pp
--
-- ## A corporate-action defect this found
--
-- The first run published **DD at +229.75%** frozen, against a tape that went
-- 122 -> 136 over the same period. Not a solver problem: DD's ledger fills are
-- at 41.24, 49.48 and 47.06 while the tape reads 122-148 on those same dates,
-- and its final fill at 138.75 matches the tape exactly. An unadjusted
-- corporate action has left the ledger and `price_history` **pricing
-- different shares**, at roughly 1:3.
--
-- Anything multiplying ledger quantity by tape price is fabricated for such a
-- name. Swept across the book: **DD is the only equity affected** (9 of 10
-- fills off basis). The three other hits are option contracts, where one fill
-- against a thin contract tape can differ by a lot without either being wrong,
-- so options are excluded from the check - testing the class prefix AND the
-- OCC symbol shape, per CLAUDE.md, because either alone has been wrong here.
--
-- DD is closed, so no open position is affected today and no published return
-- is wrong right now. But the return engine's own terminal mark is quantity
-- times tape close, so an OPEN position with this defect would carry a wrong
-- `position_mwr_period_pct` too. `vw_position_price_basis` is written as a
-- shared check for exactly that reason, and the frozen leg refuses on it with
-- `basis_mismatch` and a stated ratio rather than guessing an adjustment
-- factor. A fabricated benchmark is worse than a missing one, because the
-- traded book is graded against it.
--
-- Not wired into `vw_position_returns` here - that is a change to a published
-- number and belongs in its own step, not smuggled into the baseline.

-- ============================================================
-- Does the ledger price the same shares the tape does?
-- ============================================================

CREATE OR REPLACE VIEW public.vw_position_price_basis AS
WITH fills AS (
    SELECT c.asset_id, c.symbol, c.flow_date, c.unit_price
      FROM public.vw_position_cash_flows c
      JOIN public.assets a ON a.id = c.asset_id
     WHERE c.flow_kind <> 'mark'
       AND c.unit_price > 0
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

-- ============================================================
-- The frozen leg
-- ============================================================

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
    basis     record;
BEGIN
    -- Default valuation date is the book's own as-of: the newest mark any
    -- position carries. Passing it explicitly keeps every position on ONE
    -- date, which is what makes the book-level frozen figure additive.
    val_dt := COALESCE(
        p_valuation_date,
        (SELECT max(c.flow_date) FROM vw_position_cash_flows c WHERE c.flow_kind = 'mark'));

    -- The frozen leg is ledger quantity times tape price, so it is only
    -- meaningful if the two price the same shares. DD's do not: an unadjusted
    -- spin-off leaves its fills at ~1:3 to its tape, and multiplying through
    -- published +229.75% for a name whose tape went 122 -> 136. Refuse rather
    -- than guess a ratio - a fabricated benchmark is worse than a missing one,
    -- because the traded book gets graded against it.
    SELECT * INTO basis FROM vw_position_price_basis b WHERE b.asset_id = p_asset_id;
    IF basis.asset_id IS NOT NULL AND NOT basis.basis_ok THEN
        RETURN QUERY SELECT NULL::date, NULL::numeric, NULL::numeric, NULL::numeric,
                            NULL::numeric, NULL::date, NULL::double precision,
                            'basis_mismatch'::text,
                            (basis.fills_off_basis::text || ' of ' || basis.fills_checked::text ||
                             ' fills price a different share basis from the tape (ratio ' ||
                             round(basis.min_ratio, 3)::text || '-' ||
                             round(basis.max_ratio, 3)::text || ')')::text;
        RETURN;
    END IF;

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
    -- something.
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

-- ============================================================
-- Position and book surfaces
-- ============================================================

CREATE OR REPLACE VIEW public.vw_position_frozen AS
SELECT r.asset_id,
       r.symbol,
       r.position_state,
       r.engine_status,
       r.position_mwr_period_pct,
       f.frozen_entry_date,
       f.frozen_qty,
       f.frozen_capital_usd,
       f.frozen_terminal_usd,
       f.frozen_mark_date,
       f.frozen_return_pct::numeric              AS frozen_weight_return_pct,
       f.frozen_status,
       f.frozen_reason,
       -- Both legs or nothing. A "trading effect" with one side missing is
       -- not a small error, it is not a number.
       CASE WHEN r.engine_status = 'measured'
                 AND f.frozen_status = 'measured'
                 AND r.position_mwr_period_pct IS NOT NULL
                 AND f.frozen_return_pct IS NOT NULL
            THEN (r.position_mwr_period_pct - f.frozen_return_pct)::numeric
       END AS trading_effect_pct
  FROM public.mv_position_returns r
  CROSS JOIN LATERAL public.atlas_counterfactual_frozen(r.asset_id) f;

COMMENT ON VIEW public.vw_position_frozen IS
 'The do-nothing baseline per position (step 4 addendum rev. B §4): the position as opened, held untouched to the book valuation date, against what was actually traded. 77 of 82 measured positions are comparable; 36 trades helped, 41 hurt, mean -2.33pp, median 0.00pp.';

GRANT SELECT ON public.vw_position_frozen TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW public.vw_book_frozen_baseline AS
WITH val AS (
    SELECT max(c.flow_date) AS val_dt
      FROM public.vw_position_cash_flows c WHERE c.flow_kind = 'mark'
),
-- The two legs must cover the SAME positions or the difference measures
-- coverage rather than trading. Restricted to names where both are measurable.
eligible AS (
    SELECT p.asset_id, p.frozen_entry_date, p.frozen_capital_usd, p.frozen_terminal_usd
      FROM public.vw_position_frozen p
     WHERE p.trading_effect_pct IS NOT NULL
),
traded_flows AS (
    SELECT c.flow_date AS d, c.flow_usd AS amt
      FROM public.vw_position_cash_flows c
      JOIN eligible e ON e.asset_id = c.asset_id
),
frozen_flows AS (
    SELECT e.frozen_entry_date AS d, (-e.frozen_capital_usd) AS amt FROM eligible e
    UNION ALL
    SELECT (SELECT val_dt FROM val), e.frozen_terminal_usd FROM eligible e
),
traded AS (
    SELECT array_agg(d ORDER BY d) ds, array_agg(amt ORDER BY d) amts FROM traded_flows
),
frozen AS (
    SELECT array_agg(d ORDER BY d) ds, array_agg(amt ORDER BY d) amts FROM frozen_flows
)
SELECT (SELECT val_dt FROM val)                                     AS as_of,
       (SELECT count(*) FROM eligible)                              AS positions_compared,
       public.atlas_mwr_period(t.ds, t.amts)::numeric               AS traded_book_return_pct,
       public.atlas_mwr_period(f.ds, f.amts)::numeric               AS frozen_book_return_pct,
       (public.atlas_mwr_period(t.ds, t.amts)
        - public.atlas_mwr_period(f.ds, f.amts))::numeric           AS trading_effect_pct,
       (SELECT count(*) FROM public.mv_position_tier1 WHERE cluster_eligible)
                                                                    AS positions_cluster_eligible,
       (SELECT count(*) FROM public.mv_position_tier2
         WHERE position_state = 'open'
           AND (best_correlate_rho IS NULL OR best_correlate_rho < 0.65))
                                                                    AS positions_no_correlate
  FROM traded t, frozen f;

COMMENT ON VIEW public.vw_book_frozen_baseline IS
 'Book-level do-nothing baseline (step 4 addendum rev. B §5), and the two §2.5 diversification counts. The frozen book is every position at its opening size, never added to, never trimmed, valued on one shared date - which is why atlas_counterfactual_frozen takes the valuation date as a parameter rather than each position picking its own. Both legs cover the same position set: a difference computed over different sets measures coverage, not trading.';

GRANT SELECT ON public.vw_book_frozen_baseline TO anon, authenticated, service_role;
