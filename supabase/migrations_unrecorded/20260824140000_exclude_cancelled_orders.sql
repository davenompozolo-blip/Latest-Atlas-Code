-- Cancelled orders were being counted as holdings (2026-08-24)
--
-- `transactions` holds 9 rows with `notes = 'canceled'` and `price IS NULL`.
-- They are cancelled orders — they never filled. Seven carry quantity 0 and are
-- harmless. **Two carry a real quantity and no price**, and every consumer
-- counted them:
--
--   IBIF  buy 1,500 @ NULL  2026-03-18  -> ledger says 1,500 shares held.
--                                          The broker has never held IBIF.
--   UAE   buy    50 @ NULL  2026-02-28  -> ledger says 150.58 shares held.
--                                          The broker says 100.58.
--
-- $975 of phantom market value, 0.60% of ledger NAV — under the 2% level at
-- which `nav_reconciliation` fails, so nothing ever went red.
--
-- The date damage is worse than the quantity damage. UAE's real first fill is
-- 2026-06-04; the cancelled order is dated 2026-02-28, and `first_buys` takes
-- the earliest row. So UAE published `entry_date = 2026-02-28` and
-- `days_held = 177` for a position held 81 days, which in turn:
--   * dated `entry_efficiency_score` to a March window it was never in;
--   * put it 3 days from `cut_candidate_flag`, which fires past 180 days —
--     it would have been proposed for sale on 84 days of ownership;
--   * cleared the 90-day annualisation floor added earlier today, so it
--     carried a CAGR the floor exists to withhold.
--
-- Six sites inherited it: `vw_position_nav_daily` (quantity), the four views
-- below, and `perf-panels-top.js:normaliseTx`, whose first-entry equity-curve
-- marker plots UAE's entry on 2026-02-28 at price 0 (`Number(t.price || 0)`).
-- Fixing the source fixes the client site too, with no JS change.
--
-- These 9 rows are legacy. They were created 2026-03-09..28 by an
-- orders-based import, alongside the 137 rows still carrying
-- `notes = 'filled'`. The live `sync_alpaca_transactions` requests
-- `activity_types: 'FILL'` and cannot produce them, so **no new cancelled rows
-- can arrive and the sync needs no change**. Nothing is deleted here either —
-- with the filter in place the rows are inert, and they are the only record
-- that those orders were ever placed.
--
-- The filter is `price IS NOT NULL`, not `notes <> 'canceled'`. Today the two
-- select exactly the same 9 rows, but a priceless row cannot participate in a
-- cost, a return or a cash flow whatever the broker chose to call it. Filter on
-- the property that makes the row unusable, not on the label.

-- ---------------------------------------------------------------------------
-- The single definition. Anything computing off the ledger reads this.
-- Columns are listed rather than `t.*` so a new column on `transactions`
-- cannot silently change this view's shape.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_filled_transactions AS
 SELECT t.id,
    t.portfolio_id,
    t.asset_id,
    t.transaction_type,
    t.quantity,
    t.price,
    t.fees,
    t.transaction_date,
    t.external_id,
    t.notes,
    t.metadata,
    t.created_at
   FROM public.transactions t
  WHERE t.price IS NOT NULL;

COMMENT ON VIEW public.vw_filled_transactions IS
 'Transactions that actually filled. Excludes rows with no price - cancelled '
 'orders carrying a quantity, which otherwise count as holdings and can date a '
 'position earlier than it was opened. Read this, not `transactions`, for any '
 'quantity, cost, return or cash-flow computation.';

-- ---------------------------------------------------------------------------
-- 1. vw_position_nav_daily — the quantity error itself
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_position_nav_daily AS
 WITH signed_transactions AS (
         SELECT t.portfolio_id,
            t.asset_id,
            t.transaction_date::date AS tx_date,
                CASE
                    WHEN lower(t.transaction_type) ~~ '%sell%'::text THEN - abs(t.quantity)
                    WHEN lower(t.transaction_type) ~~ '%buy%'::text THEN abs(t.quantity)
                    WHEN lower(t.transaction_type) = 'fill'::text THEN t.quantity
                    ELSE 0::numeric
                END AS signed_qty
           FROM vw_filled_transactions t
             JOIN assets a_1 ON a_1.id = t.asset_id
          WHERE a_1.symbol <> '$CASH'::text
        ), daily_net AS (
         SELECT signed_transactions.portfolio_id,
            signed_transactions.asset_id,
            signed_transactions.tx_date,
            sum(signed_transactions.signed_qty) AS net_qty
           FROM signed_transactions
          GROUP BY signed_transactions.portfolio_id, signed_transactions.asset_id, signed_transactions.tx_date
        ), cumulative_holdings AS (
         SELECT daily_net.portfolio_id,
            daily_net.asset_id,
            daily_net.tx_date,
            sum(daily_net.net_qty) OVER (PARTITION BY daily_net.portfolio_id, daily_net.asset_id ORDER BY daily_net.tx_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_qty
           FROM daily_net
        ), asset_lifespan AS (
         SELECT cumulative_holdings.portfolio_id,
            cumulative_holdings.asset_id,
            min(cumulative_holdings.tx_date) AS start_date
           FROM cumulative_holdings
          WHERE cumulative_holdings.running_qty <> 0::numeric
          GROUP BY cumulative_holdings.portfolio_id, cumulative_holdings.asset_id
        ), trading_days AS (
         SELECT DISTINCT price_history.price_date AS cal_date
           FROM price_history
          WHERE price_history."interval" = '1d'::text AND (price_history.asset_id IN ( SELECT asset_lifespan.asset_id
                   FROM asset_lifespan))
        ), holdings_grid AS (
         SELECT al.portfolio_id,
            al.asset_id,
            td.cal_date
           FROM asset_lifespan al
             JOIN trading_days td ON td.cal_date >= al.start_date AND td.cal_date <= CURRENT_DATE
        ), daily_holdings AS (
         SELECT hg.portfolio_id,
            hg.asset_id,
            hg.cal_date,
            q.running_qty AS quantity
           FROM holdings_grid hg
             LEFT JOIN LATERAL ( SELECT ch.running_qty
                   FROM cumulative_holdings ch
                  WHERE ch.portfolio_id = hg.portfolio_id AND ch.asset_id = hg.asset_id AND ch.tx_date <= hg.cal_date
                  ORDER BY ch.tx_date DESC
                 LIMIT 1) q ON true
        )
 SELECT dh.portfolio_id,
    dh.asset_id,
    a.symbol,
    a.asset_class,
    dh.cal_date AS price_date,
    COALESCE(dh.quantity, 0::numeric) AS quantity,
    px.close AS close_price,
    COALESCE(dh.quantity, 0::numeric) * px.close AS position_value
   FROM daily_holdings dh
     JOIN assets a ON a.id = dh.asset_id
     LEFT JOIN LATERAL ( SELECT ph.close
           FROM price_history ph
          WHERE ph.asset_id = dh.asset_id AND ph.price_date = dh.cal_date AND ph."interval" = '1d'::text
         LIMIT 1) px ON true
  WHERE COALESCE(dh.quantity, 0::numeric) <> 0::numeric;

-- ---------------------------------------------------------------------------
-- 2. vw_performance_suite — first_buys, the entry_date error
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_performance_suite AS
 WITH latest_pos_snapshot AS (
         SELECT DISTINCT ON (p.asset_id) p.asset_id,
            p.quantity, p.average_cost, p.market_value, p.as_of_date, p.side
           FROM positions p
             JOIN assets a_1 ON a_1.id = p.asset_id
          WHERE p.as_of_date >= (( SELECT max(positions.as_of_date) - 2 FROM positions))
            AND NOT (a_1.asset_class = 'option'::text AND a_1.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'::text AND to_date("substring"(a_1.symbol, '(\d{6})[CP]'::text), 'YYMMDD'::text) < CURRENT_DATE)
          ORDER BY p.asset_id, p.as_of_date DESC
        ), latest_pos AS (
         SELECT latest_pos_snapshot.asset_id, latest_pos_snapshot.quantity,
            latest_pos_snapshot.average_cost, latest_pos_snapshot.market_value,
            latest_pos_snapshot.as_of_date, latest_pos_snapshot.side
           FROM latest_pos_snapshot
          WHERE latest_pos_snapshot.quantity IS NOT NULL AND latest_pos_snapshot.quantity <> 0::numeric AND (latest_pos_snapshot.market_value IS NULL OR abs(latest_pos_snapshot.market_value) > 0.01)
        ), first_buys AS (
         SELECT DISTINCT ON (t.asset_id) t.asset_id,
            t.price AS tx_entry_price, t.transaction_date AS tx_entry_date
           FROM vw_filled_transactions t
             JOIN assets a_1 ON a_1.id = t.asset_id
          WHERE lower(t.transaction_type) ~~ '%buy%'::text AND a_1.symbol <> '$CASH'::text
          ORDER BY t.asset_id, t.transaction_date
        ), position_base AS (
         SELECT lp_1.asset_id, lp_1.market_value, lp_1.side,
            COALESCE(fb.tx_entry_price, lp_1.average_cost) AS entry_price,
            COALESCE(fb.tx_entry_date::date, lp_1.as_of_date) AS entry_date
           FROM latest_pos lp_1
             LEFT JOIN first_buys fb ON fb.asset_id = lp_1.asset_id
        ), post_entry_range AS (
         SELECT pb_1.asset_id,
            max(ph.high) AS high_30d_post_entry,
            min(ph.low) AS low_30d_post_entry
           FROM position_base pb_1
             LEFT JOIN price_history ph ON ph.asset_id = pb_1.asset_id AND ph."interval" = '1d'::text AND ph.price_date >= pb_1.entry_date AND ph.price_date <= (pb_1.entry_date + '30 days'::interval)
          GROUP BY pb_1.asset_id
        ), latest_prices AS (
         SELECT pb0.asset_id,
            t.close AS current_price,
            t.price_date AS last_price_date,
            CURRENT_DATE - t.price_date AS price_days_old,
            (CURRENT_DATE - t.price_date) <= 7 AS is_measurable
           FROM position_base pb0
             CROSS JOIN LATERAL ( SELECT ph.close, ph.price_date
                   FROM price_history ph
                  WHERE ph.asset_id = pb0.asset_id AND ph."interval" = '1d'::text
                  ORDER BY ph.price_date DESC
                 LIMIT 1) t
        ), sector_live AS (
         SELECT a_1.id AS asset_id,
            NULLIF(TRIM(BOTH FROM ec.payload ->> 'Sector'::text), ''::text) AS av_sector
           FROM assets a_1
             LEFT JOIN equity_cache ec ON ec.symbol = a_1.symbol AND ec.endpoint = 'overview'::text AND ec.expires_at > (now() - '48:00:00'::interval)
          WHERE (a_1.id IN ( SELECT position_base.asset_id FROM position_base))
        )
 SELECT a.symbol,
    a.name,
    COALESCE(sl.av_sector, a.sector, 'Other'::text) AS sector,
    pb.market_value,
    pb.side,
    pb.entry_price,
    pb.entry_date,
    lp.current_price,
    round((1::numeric - (pb.entry_price - per.low_30d_post_entry) / NULLIF(per.high_30d_post_entry - per.low_30d_post_entry, 0::numeric)) * 100::numeric, 1) AS entry_efficiency_score,
        CASE
            WHEN lp.is_measurable THEN (lp.current_price - pb.entry_price) / NULLIF(pb.entry_price, 0::numeric)
            ELSE NULL::numeric
        END AS total_return_pct,
        CASE
            WHEN lp.is_measurable AND (CURRENT_DATE - pb.entry_date) >= 90 THEN power(lp.current_price / NULLIF(pb.entry_price, 0::numeric), 365.0 / NULLIF(CURRENT_DATE - pb.entry_date, 0)::numeric) - 1::numeric
            ELSE NULL::numeric
        END AS annualised_return,
    CURRENT_DATE - pb.entry_date AS days_held,
        CASE
            WHEN NOT lp.is_measurable THEN NULL::boolean
            WHEN (CURRENT_DATE - pb.entry_date) > 180 AND ((lp.current_price - pb.entry_price) / NULLIF(pb.entry_price, 0::numeric)) < 0::numeric THEN true
            ELSE false
        END AS cut_candidate_flag,
    lp.last_price_date,
    lp.price_days_old,
        CASE
            WHEN lp.is_measurable THEN 'measured'::text
            ELSE 'not_measurable'::text
        END AS verdict_status,
        CASE
            WHEN lp.is_measurable THEN NULL::text
            ELSE 'price_days_old='::text || lp.price_days_old::text
        END AS status_reason
   FROM position_base pb
     JOIN assets a ON a.id = pb.asset_id
     JOIN latest_prices lp ON lp.asset_id = pb.asset_id
     LEFT JOIN post_entry_range per ON per.asset_id = pb.asset_id
     LEFT JOIN sector_live sl ON sl.asset_id = pb.asset_id
  ORDER BY (
        CASE
            WHEN lp.is_measurable AND (CURRENT_DATE - pb.entry_date) >= 90 THEN power(lp.current_price / NULLIF(pb.entry_price, 0::numeric), 365.0 / NULLIF(CURRENT_DATE - pb.entry_date, 0)::numeric) - 1::numeric
            ELSE NULL::numeric
        END) DESC NULLS LAST;

-- ---------------------------------------------------------------------------
-- 3. vw_bench_docket — the thesis clock (`days_held`)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_bench_docket AS
 WITH base AS (
         SELECT h.symbol, h.asset_name, h.sector,
            h.weight_pct AS actual_weight_pct,
            h.conviction_score,
            h.var_contribution_pct AS component_var_pct,
            h.unrealised_return_pct,
            h.max_drawdown_pct AS drawdown_pct,
            h.quality_grade, h.quant_signal, h.technical_signal,
            h.valuation_signal, h.macro_regime_fit
           FROM vw_nexus_holdings h
        ), conv AS (
         SELECT sum(base.conviction_score) AS conv_total,
            sum(base.actual_weight_pct) FILTER (WHERE base.conviction_score IS NOT NULL) AS invested_pct
           FROM base
          WHERE base.conviction_score IS NOT NULL
        ), first_buy AS (
         SELECT a.symbol,
            min(t.transaction_date)::date AS first_buy_date
           FROM vw_filled_transactions t
             JOIN assets a ON a.id = t.asset_id
          WHERE lower(t.transaction_type) ~~ '%buy%'::text
          GROUP BY a.symbol
        )
 SELECT b.symbol,
    b.asset_name,
    b.sector,
    b.actual_weight_pct,
    b.conviction_score,
        CASE
            WHEN b.conviction_score IS NULL THEN NULL::numeric
            ELSE round(c.invested_pct * b.conviction_score::numeric / NULLIF(c.conv_total, 0)::numeric, 3)
        END AS target_weight_pct,
        CASE
            WHEN b.conviction_score IS NULL THEN NULL::numeric
            ELSE round(b.actual_weight_pct - c.invested_pct * b.conviction_score::numeric / NULLIF(c.conv_total, 0)::numeric, 3)
        END AS weight_gap_pp,
        CASE
            WHEN abs(b.component_var_pct) < 0.25 THEN NULL::numeric
            ELSE round(b.unrealised_return_pct / b.component_var_pct, 2)
        END AS r_var,
    b.component_var_pct,
    b.unrealised_return_pct,
    b.drawdown_pct,
        CASE
            WHEN b.unrealised_return_pct < 0::numeric THEN round(b.actual_weight_pct * abs(b.unrealised_return_pct) / 100::numeric, 3)
            ELSE NULL::numeric
        END AS damage_pp,
    fb.first_buy_date,
        CASE
            WHEN fb.first_buy_date IS NULL THEN NULL::integer
            ELSE CURRENT_DATE - fb.first_buy_date
        END AS days_held,
    b.quality_grade,
    b.quant_signal,
    b.technical_signal,
    b.valuation_signal,
    b.macro_regime_fit
   FROM base b
     CROSS JOIN conv c
     LEFT JOIN first_buy fb ON fb.symbol = b.symbol;

-- ---------------------------------------------------------------------------
-- 4. vw_bench_contribution — `coverage_reason` must not call a cancelled
--    order a transaction history
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_bench_contribution AS
 WITH daily AS (
         SELECT v.price_date, v.symbol,
            sum(v.position_value) AS pos_val,
            max(v.close_price) AS close_price
           FROM vw_position_nav_daily v
          WHERE v.close_price IS NOT NULL AND v.position_value IS NOT NULL
          GROUP BY v.price_date, v.symbol
        ), nav AS (
         SELECT daily.price_date, sum(daily.pos_val) AS total_nav
           FROM daily GROUP BY daily.price_date
        ), seq AS (
         SELECT d.price_date, d.symbol, d.close_price,
            lag(d.close_price) OVER (PARTITION BY d.symbol ORDER BY d.price_date) AS prev_close,
            lag(d.pos_val) OVER (PARTITION BY d.symbol ORDER BY d.price_date) AS prev_pos_val,
            lag(n.total_nav) OVER (PARTITION BY d.symbol ORDER BY d.price_date) AS prev_nav
           FROM daily d
             JOIN nav n ON n.price_date = d.price_date
        ), contrib AS (
         SELECT seq.price_date, seq.symbol,
            (seq.close_price / seq.prev_close - 1::numeric) * (seq.prev_pos_val / seq.prev_nav) * 100::numeric AS contrib_pct
           FROM seq
          WHERE seq.prev_close > 0::numeric AND seq.prev_nav > 0::numeric AND seq.prev_pos_val IS NOT NULL
        ), last_day AS (
         SELECT max(contrib.price_date) AS d FROM contrib WHERE contrib.contrib_pct IS NOT NULL
        ), agg AS (
         SELECT contrib.symbol,
            round(COALESCE(sum(contrib.contrib_pct) FILTER (WHERE contrib.price_date = (( SELECT last_day.d FROM last_day))), 0::numeric), 3) AS contrib_today,
            round(sum(contrib.contrib_pct) FILTER (WHERE contrib.price_date >= date_trunc('year'::text, CURRENT_DATE::timestamp with time zone)::date), 3) AS contrib_ytd,
            round(sum(contrib.contrib_pct), 3) AS contrib_since_entry,
            min(contrib.price_date) AS series_start,
            max(contrib.price_date) AS series_end,
            count(*) AS observations
           FROM contrib
          WHERE contrib.contrib_pct IS NOT NULL
          GROUP BY contrib.symbol
        ), coverage AS (
         SELECT round(100.0 * sum(h_1.weight_pct) FILTER (WHERE a_1.symbol IS NOT NULL) / NULLIF(sum(h_1.weight_pct), 0::numeric), 2) AS nav_coverage_pct
           FROM vw_nexus_holdings h_1
             LEFT JOIN agg a_1 ON a_1.symbol = h_1.symbol
        )
 SELECT h.symbol,
    a.contrib_today,
    a.contrib_ytd,
    a.contrib_since_entry,
    a.series_start,
    a.series_end,
    COALESCE(a.observations, 0::bigint) AS observations,
    a.symbol IS NOT NULL AS covered,
        CASE
            WHEN a.symbol IS NOT NULL THEN NULL::text
            WHEN NOT (EXISTS ( SELECT 1
               FROM vw_filled_transactions t
                 JOIN assets s ON s.id = t.asset_id
              WHERE s.symbol = h.symbol)) THEN 'no_transaction_history'::text
            ELSE 'no_priced_position_days'::text
        END AS coverage_reason,
    h.weight_pct AS actual_weight_pct,
    cv.nav_coverage_pct
   FROM vw_nexus_holdings h
     LEFT JOIN agg a ON a.symbol = h.symbol
     CROSS JOIN coverage cv;

-- ---------------------------------------------------------------------------
-- 5. vw_transactions — the blotter
--
-- Filtered rather than labelled. Every consumer of this view computes:
-- `perf-panels-top.js` builds equity-curve entry markers from it and takes
-- the earliest BUY per symbol, so a cancelled order becomes a plotted entry at
-- price 0. A row that must never be counted is better absent than present with
-- a flag nobody reads — the same argument this repo already applied to stale
-- prices. `transactions` still holds the cancelled orders for anyone auditing
-- what was placed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_transactions AS
 SELECT t.id,
    t.portfolio_id,
    t.transaction_date,
    t.transaction_type,
    t.quantity,
    t.price,
    t.fees,
    t.notes,
    a.symbol,
    a.name AS asset_name,
    a.asset_class,
    a.sector,
    t.quantity * t.price AS notional
   FROM vw_filled_transactions t
     LEFT JOIN assets a ON a.id = t.asset_id
  ORDER BY t.transaction_date DESC;
