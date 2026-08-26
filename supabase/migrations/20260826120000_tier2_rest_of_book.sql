-- Step 4 §8.4 — Tier 2: the rest-of-book counterfactual.
--
-- Rev. B §2.3 replaced the cluster-median comparison as the *primary* basis
-- after measurement killed its premise. The brief assumed a book of
-- overlapping names where every position fights for its place against
-- substitutes; the book is single names, ADRs, sector ETFs, bond funds and
-- commodity trackers, and at rho 0.75 the median position's entire cluster is
-- one name. Loosening the threshold to manufacture peers was rejected — a
-- name at rho 0.66 is the sector-label claim the brief already threw out,
-- with a number attached.
--
-- So the alternative is the book itself. Every dollar in GDX is a dollar not
-- spread across the other 62 positions, and that comparison is always
-- available, needs no peer, and answers the brief more literally than the
-- cluster version did.
--
-- Built Tier 2 before Tier 1 deliberately (rev. B §8): it covers everything
-- and depends on nothing outside the book, so if the cluster tier proves as
-- thin in practice as it did in measurement, the module still works.
--
-- Coverage as built: **56 of 57 open positions**, 82 of 86 including closed.
-- The only open position without a score is KMTUY, whose mark is 164 days old
-- — the same refusal the return engine already makes, not a new gap.
--
-- ## Three pieces
--
-- 1. `mv_book_daily_weights`  — (date, asset): prevailing weight, price
--    return, and their product.
-- 2. `mv_book_ex_index`       — per asset, a total-return index of the rest
--    of the book with that asset removed.
-- 3. `atlas_counterfactual_book(asset)` — the position's own cash-flow
--    schedule run into that index.
--
-- ## Why returns come from bars, not from the nav view's close
--
-- `vw_position_nav_daily` carries a close per position-day, but it is a
-- LATERAL top-1 `price_date <= cal_date`, so a name with no bar that day
-- carries its last one forward. Differencing carried closes reports a 0.00%
-- move for a name that did not trade — which is publishing a move off a dead
-- print, the exact thing this repo already refuses to do in `nexus_holdings`.
--
-- Returns here are therefore bar-to-bar out of `price_history`. A name with no
-- bar on a date simply has no row that date and is renormalised out of the
-- book return, so it neither contributes a fabricated zero nor distorts the
-- weights. In practice this is close to a no-op — surviving weight is >= 0.9998
-- on all 165 days — but the construction is what makes the number defensible,
-- not the size of the correction.
--
-- ## Why 63 exclusions cost one scan
--
-- Computing "the book without asset i" independently for each i is O(n^2 * T).
-- It does not need to be. With S(t) = sum(w_j * r_j) and F(t) = sum(w_j) over
-- the names priced that day,
--
--     r_ex_i(t) = (S(t) - w_i(t) * r_i(t)) / (F(t) - w_i(t))
--
-- so one pass over `mv_book_daily_weights` yields every exclusion. 8,732 rows
-- in, 14,190 out, and the whole 86-position counterfactual runs in 543 ms —
-- inside service_role's 300s budget many times over, and materialised anyway
-- because it calls a plpgsql bisection per position and has no business in a
-- page load.
--
-- The guard is `F - w_i >= 0.02`: the rest of the book is not an alternative
-- when the excluded name IS most of the book.
--
-- Sanity, on 2026-08-25 (whole book +21.86% over the window):
--
--     ex-AMD    +17.94%   removing a big winner costs 3.9pp   correct
--     ex-GOOGL  +21.87%   a name that performed in line       correct
--     ex-TSM    +21.16%
--
-- ## The correlate (rev. B §2.5)
--
-- `best_correlate_rho` is carried per row so the diversification finding is a
-- time series rather than a one-off measurement. Scoped to the **open book**:
-- §2.5 asks how differentiated this book is, and a name that has been sold is
-- not an alternative you hold.
--
-- Measured on that basis, 24 of 57 open positions have no correlate above
-- 0.65 and the median position's best correlate is **0.662**. Rev. B §2.1
-- reported a median of 0.771 over 63 positions with non-held candidates in
-- scope. Both are true; they answer different questions, and the held-only
-- reading is the one §2.5 asks for. It is also the less flattering of the two,
-- which strengthens rev. B's conclusion rather than weakening it.
--
-- 18 open positions have a best correlate at or above 0.75 — closely matching
-- rev. B's ~19 estimate for cluster eligibility before the n >= 5 rule is
-- applied in step 5.
--
-- ## A coverage fact that is not a diversification fact
--
-- `universe_correlations` holds ~420 symbols of a ~1,500-name universe and
-- **is not guaranteed to include the book**: coverage of the open book moved
-- 71 -> 70 -> 67 over three days as the cap churned. Today exactly one open
-- position is missing (KMTUY, whose feed is dark, so it has no returns to
-- correlate) and nothing is lost. But a held name silently dropping out of the
-- matrix would read as "no close peer" when it means "not measured", so
-- `absent_from_matrix` is published to keep the two apart. Worth watching; not
-- blocking, and not fixed here.

-- ============================================================
-- 1. Prevailing weights and daily returns
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS public.mv_book_daily_weights CASCADE;

CREATE MATERIALIZED VIEW public.mv_book_daily_weights AS
WITH held AS (
    SELECT DISTINCT asset_id FROM public.vw_position_nav_daily
),
px AS (
    SELECT ph.asset_id, ph.price_date, ph.close,
           lag(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date) AS prev_close
      FROM public.price_history ph
      JOIN held h ON h.asset_id = ph.asset_id
     WHERE ph."interval" = '1d'
       AND ph.price_date >= (SELECT min(price_date) - 10 FROM public.vw_position_nav_daily)
),
ret AS (
    SELECT asset_id, price_date, (close / prev_close - 1)::numeric AS r
      FROM px
     WHERE prev_close > 0
),
wt AS (
    SELECT n.asset_id, n.symbol, n.price_date,
           (n.position_value / NULLIF(sum(n.position_value) OVER (PARTITION BY n.price_date), 0))::numeric AS w
      FROM public.vw_position_nav_daily n
     WHERE n.position_value IS NOT NULL
)
SELECT w.price_date,
       w.asset_id,
       w.symbol,
       w.w,
       r.r,
       (w.w * r.r) AS wr
  FROM wt w
  JOIN ret r ON r.asset_id = w.asset_id AND r.price_date = w.price_date;

CREATE UNIQUE INDEX mv_book_daily_weights_uniq
    ON public.mv_book_daily_weights (price_date, asset_id);
CREATE INDEX mv_book_daily_weights_asset_idx
    ON public.mv_book_daily_weights (asset_id, price_date);

COMMENT ON MATERIALIZED VIEW public.mv_book_daily_weights IS
 'Per (date, held asset): prevailing weight, that day''s price return, and their product. Substrate for the Tier 2 rest-of-book counterfactual (step 4 addendum rev. B §2.3). Returns come from consecutive price_history bars, never from a carried-forward close - a name with no bar that day has no row and is renormalised out, rather than publishing a zero move off a dead print.';

GRANT SELECT ON public.mv_book_daily_weights TO anon, authenticated, service_role;

-- ============================================================
-- 2. The rest-of-book index, one per excluded asset
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS public.mv_book_ex_index CASCADE;

CREATE MATERIALIZED VIEW public.mv_book_ex_index AS
WITH day AS (
    SELECT price_date, sum(w) AS f, sum(wr) AS s
      FROM public.mv_book_daily_weights
     GROUP BY price_date
),
universe AS (
    SELECT DISTINCT asset_id, symbol FROM public.mv_book_daily_weights
),
grid AS (
    SELECT u.asset_id, u.symbol, d.price_date, d.f, d.s,
           COALESCE(m.w, 0::numeric)  AS w_i,
           COALESCE(m.wr, 0::numeric) AS wr_i,
           (m.asset_id IS NOT NULL)   AS present
      FROM universe u
      CROSS JOIN day d
      LEFT JOIN public.mv_book_daily_weights m
             ON m.asset_id = u.asset_id AND m.price_date = d.price_date
),
ex AS (
    SELECT g.*,
           CASE
               -- The rest of the book is not defined when the excluded name
               -- IS most of the book. 2% of surviving weight is the floor.
               WHEN (g.f - g.w_i) < 0.02 THEN NULL::numeric
               ELSE (g.s - g.wr_i) / (g.f - g.w_i)
           END AS r_ex
      FROM grid g
)
SELECT asset_id,
       symbol,
       price_date,
       r_ex,
       present            AS asset_priced_that_day,
       (f - w_i)          AS surviving_weight,
       exp(sum(ln(1 + r_ex)) OVER (PARTITION BY asset_id ORDER BY price_date
                                   ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW))
                          AS ex_index
  FROM ex
 WHERE r_ex IS NOT NULL AND r_ex > -1;

CREATE UNIQUE INDEX mv_book_ex_index_uniq
    ON public.mv_book_ex_index (asset_id, price_date);

COMMENT ON MATERIALIZED VIEW public.mv_book_ex_index IS
 'Tier 2 substrate (step 4 addendum rev. B §2.3): for each held asset, a total-return index of THE REST OF THE BOOK at prevailing weights, with that asset excluded. Computed by the identity r_ex = (S - w_i*r_i) / (F - w_i) off one pass of mv_book_daily_weights, so all 63 exclusions cost one scan rather than 63. NULL where the excluded name leaves under 2% of surviving weight - a rest-of-book that is almost nothing is not an alternative.';

GRANT SELECT ON public.mv_book_ex_index TO anon, authenticated, service_role;

-- ============================================================
-- 3. The counterfactual
-- ============================================================
--
-- Mirrors `atlas_counterfactual` exactly - buys are dollar-matched, sells are
-- fraction-matched, and the window is pinned to the position's own mark date
-- so that the difference between the two legs is not partly a difference of
-- date. The only change is what the schedule buys: units of the rest-of-book
-- index instead of shares of a peer.

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
 'Tier 2 (step 4 addendum rev. B §2.3): runs a position''s own cash-flow schedule into the REST OF THE BOOK at prevailing weights instead of into a correlated peer. Available for every position, needs no peer - which matters because this book has none: 24 of 57 open positions have no correlate above rho 0.65 and the median cluster at rho 0.75 is one name. Answers "did this earn its slot against my own alternatives", which is the more literal reading of the brief anyway: every dollar in a name is a dollar not spread across the other 62.';

-- ============================================================
-- 4. The Tier 2 surface
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS public.mv_position_tier2;
DROP VIEW IF EXISTS public.vw_position_tier2;

CREATE VIEW public.vw_position_tier2 AS
WITH latest_corr AS (
    SELECT max(as_of_date) AS d FROM public.universe_correlations
),
-- The counterpart set is the CURRENT book. Rev. B §2.5 asks how differentiated
-- this book is, so a name that has been sold is not a candidate correlate -
-- it is not an alternative you hold.
open_book AS (
    SELECT DISTINCT symbol FROM public.mv_position_returns WHERE position_state = 'open'
),
-- The matrix stores each pair once; read it both ways so a name is not
-- silently missing its own best correlate because it happened to be stored
-- as symbol_2.
pairs AS (
    SELECT c.symbol_1 AS sym, c.symbol_2 AS other, c.correlation AS rho
      FROM public.universe_correlations c, latest_corr l
     WHERE c.as_of_date = l.d AND c.correlation IS NOT NULL
       AND c.symbol_2 IN (SELECT symbol FROM open_book)
    UNION ALL
    SELECT c.symbol_2, c.symbol_1, c.correlation
      FROM public.universe_correlations c, latest_corr l
     WHERE c.as_of_date = l.d AND c.correlation IS NOT NULL
       AND c.symbol_1 IN (SELECT symbol FROM open_book)
),
best AS (
    SELECT DISTINCT ON (p.sym) p.sym, p.other, p.rho
      FROM pairs p
      JOIN open_book o ON o.symbol = p.sym
     WHERE p.other <> p.sym
     ORDER BY p.sym, p.rho DESC
)
SELECT r.asset_id,
       r.symbol,
       r.position_state,
       r.engine_status,
       r.engine_reason,
       r.position_mwr_period_pct,
       c.cf_mwr_period_pct                    AS cf_book_return_pct,
       c.cf_capital_deployed_usd              AS cf_book_capital_deployed_usd,
       c.cf_net_pnl_usd                       AS cf_book_net_pnl_usd,
       c.cf_status                            AS cf_book_status,
       c.cf_reason                            AS cf_book_reason,
       -- The Tier 2 score. NULL unless BOTH legs measured: a difference with
       -- one side missing is not a small error, it is not a number.
       CASE
           WHEN r.engine_status = 'measured'
            AND c.cf_status = 'measured'
            AND r.position_mwr_period_pct IS NOT NULL
            AND c.cf_mwr_period_pct IS NOT NULL
           THEN (r.position_mwr_period_pct - c.cf_mwr_period_pct)::numeric
       END                                    AS excess_vs_book_pct,
       b.rho                                  AS best_correlate_rho,
       b.other                                AS best_correlate_symbol,
       -- Distinguishes "no close peer" from "not in the matrix". The matrix
       -- covers ~420 of a 1,500-name universe and is not guaranteed to include
       -- the book, so absence is a coverage fact about the correlation job,
       -- not a diversification fact about the position.
       (r.position_state = 'open'
        AND NOT EXISTS (SELECT 1 FROM public.universe_correlations c2, latest_corr l2
                         WHERE c2.as_of_date = l2.d
                           AND (c2.symbol_1 = r.symbol OR c2.symbol_2 = r.symbol)))
                                              AS absent_from_matrix,
       (SELECT d FROM latest_corr)            AS correlation_as_of
  FROM public.mv_position_returns r
  CROSS JOIN LATERAL public.atlas_counterfactual_book(r.asset_id) c
  LEFT JOIN best b ON b.sym = r.symbol;

COMMENT ON VIEW public.vw_position_tier2 IS
 'Tier 2 of the ranking ladder (step 4 addendum rev. B §2.3-2.5): every position''s own money-weighted return against the same cash-flow schedule run into the rest of the book, plus its single best correlate within the open book. Covers every measurable position because it depends on nothing outside the book. Read mv_position_tier2 from a page; this view calls a plpgsql counterfactual per position.';

GRANT SELECT ON public.vw_position_tier2 TO anon, authenticated, service_role;

CREATE MATERIALIZED VIEW public.mv_position_tier2 AS
    SELECT t.*, now() AS computed_at FROM public.vw_position_tier2 t;

CREATE UNIQUE INDEX mv_position_tier2_asset_uniq ON public.mv_position_tier2 (asset_id);
CREATE INDEX mv_position_tier2_symbol_idx        ON public.mv_position_tier2 (symbol);

GRANT SELECT ON public.mv_position_tier2 TO anon, authenticated, service_role;

COMMENT ON MATERIALIZED VIEW public.mv_position_tier2 IS
 'Nightly snapshot of vw_position_tier2. Unique index on asset_id allows REFRESH ... CONCURRENTLY.';
