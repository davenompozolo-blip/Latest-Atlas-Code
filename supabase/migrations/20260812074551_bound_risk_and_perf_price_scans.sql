-- The rest of the price_history pushdowns: Risk and Perf.
--
-- Same defect as 20260811150000, five more views. The earlier sweep grepped for
-- `ranked_prices` / `row_number() OVER (PARTITION BY … asset_id)` and therefore
-- missed every view that uses `lag()`, `max() OVER`, or `DISTINCT ON` instead.
-- This time the whole set was timed rather than pattern-matched.
--
--   vw_performance_suite    DISTINCT ON over all 481k rows for 54 latest closes,
--                           plus a sector lookup across all 7,955 assets
--   vw_position_nav_daily   SELECT DISTINCT price_date over all 481k rows
--   vw_quant_correlation    lag() over 248k rows, then joined down to the book
--   vw_quant_drawdown       running-peak window over all 481k rows
--   vw_risk_analysis        lag() over 248k rows for 70 held names
--
-- Symptoms: the Perf page rendered "No data available — run Alpaca sync first"
-- and Risk rendered "Insufficient return history (need 30+ days)". Both are
-- false. vw_portfolio_nav_daily carries 156 daily returns back to 2025-12-24;
-- the reads were being cancelled at anon's 3s ceiling and the loaders reported
-- the empty result as missing data. Nothing is wrong with the Alpaca sync.
--
-- Every change here is the same pure pushdown: restrict the price CTE to the
-- assets the view already resolved before it touched prices. Per-asset windows
-- (lag, running max, DISTINCT ON … ORDER BY price_date) are unaffected by which
-- other assets are present, so surviving rows keep identical values.

-- ── vw_risk_analysis ─────────────────────────────────────────────────────────
create or replace view public.vw_risk_analysis as
 WITH latest_pos AS (
         SELECT DISTINCT ON (p_1.asset_id) p_1.asset_id, p_1.quantity,
            p_1.average_cost, p_1.market_value, p_1.as_of_date
           FROM positions p_1
             JOIN assets a_1 ON a_1.id = p_1.asset_id
          WHERE p_1.quantity IS NOT NULL AND p_1.quantity <> 0::numeric
            AND (p_1.market_value IS NULL OR abs(p_1.market_value) > 0.01)
            AND NOT ((a_1.asset_class = ANY (ARRAY['option'::text, 'us_option'::text]))
                     AND a_1.symbol ~ '^[A-Z.]{1,6}[0-9]{6}[CP][0-9]{8}$'::text
                     AND to_date("substring"(a_1.symbol, '([0-9]{6})[CP]'::text), 'YYMMDD'::text) < CURRENT_DATE)
          ORDER BY p_1.asset_id, p_1.as_of_date DESC
        ), returns AS (
         SELECT ph.asset_id, ph.price_date,
            (ph.close - lag(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date))
              / NULLIF(lag(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date), 0::numeric) AS r
           FROM price_history ph
          WHERE ph."interval" = '1d'::text
            AND ph.price_date >= (CURRENT_DATE - '252 days'::interval)
            -- vol_per_position groups per asset and only held assets are joined
            -- through, so the other ~1,400 were computed and thrown away.
            AND ph.asset_id IN (SELECT latest_pos.asset_id FROM latest_pos)
        ), vol_per_position AS (
         SELECT returns.asset_id, count(*) AS obs, avg(returns.r) AS mu,
            stddev(returns.r) AS sigma,
            stddev(returns.r)::double precision * sqrt(252::double precision) AS annual_vol,
            percentile_cont(0.05::double precision) WITHIN GROUP (ORDER BY (returns.r::double precision)) AS var_95_daily
           FROM returns WHERE returns.r IS NOT NULL
          GROUP BY returns.asset_id
        ), nav AS (
         SELECT sum(latest_pos.market_value) AS total_nav FROM latest_pos
        )
 SELECT a.symbol, a.name, a.sector, p.market_value,
    p.market_value / NULLIF(nav.total_nav, 0::numeric) AS weight,
    v.annual_vol,
    (p.market_value / NULLIF(nav.total_nav, 0::numeric))::double precision * v.annual_vol AS marginal_vol_contribution,
    abs(v.var_95_daily) * p.market_value::double precision AS dollar_var_95_daily,
    v.obs AS trading_days,
        CASE WHEN v.annual_vol > 0.40::double precision THEN 'High Risk'::text
             WHEN v.annual_vol > 0.20::double precision THEN 'Moderate Risk'::text
             ELSE 'Low Risk'::text END AS risk_tier
   FROM latest_pos p
     JOIN assets a ON a.id = p.asset_id
     JOIN vol_per_position v ON v.asset_id = p.asset_id
     CROSS JOIN nav
  ORDER BY ((p.market_value / NULLIF(nav.total_nav, 0::numeric))::double precision * v.annual_vol) DESC;

-- ── vw_quant_correlation ─────────────────────────────────────────────────────
-- portfolio_returns already joined latest_pos to discard the unheld tail; doing
-- it one CTE earlier means the lag() never runs on them in the first place.
create or replace view public.vw_quant_correlation as
 WITH latest_pos AS (
         SELECT DISTINCT ON (p.asset_id) p.asset_id
           FROM positions p
             JOIN assets a ON a.id = p.asset_id
          WHERE p.quantity <> 0::numeric
            AND p.as_of_date >= (( SELECT max(positions.as_of_date) - 7 FROM positions))
            AND NOT (a.asset_class = 'option'::text
                     AND a.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'::text
                     AND to_date("substring"(a.symbol, '(\d{6})[CP]'::text), 'YYMMDD'::text) < CURRENT_DATE)
          ORDER BY p.asset_id, p.as_of_date DESC
        ), returns AS (
         SELECT ph.asset_id, ph.price_date,
            (ph.close - lag(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date))
              / NULLIF(lag(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date), 0::numeric) AS r
           FROM price_history ph
          WHERE ph."interval" = '1d'::text
            AND ph.price_date >= (CURRENT_DATE - '252 days'::interval)
            AND ph.asset_id IN (SELECT latest_pos.asset_id FROM latest_pos)
        ), portfolio_returns AS (
         SELECT r.asset_id, r.price_date, r.r
           FROM returns r
             JOIN latest_pos lp ON lp.asset_id = r.asset_id
          WHERE r.r IS NOT NULL
        )
 SELECT a1.symbol AS symbol_1, a2.symbol AS symbol_2,
    round(corr(r1.r::double precision, r2.r::double precision)::numeric, 3) AS correlation,
    count(*)::integer AS common_days
   FROM portfolio_returns r1
     JOIN portfolio_returns r2 ON r1.price_date = r2.price_date AND r1.asset_id < r2.asset_id
     JOIN assets a1 ON a1.id = r1.asset_id
     JOIN assets a2 ON a2.id = r2.asset_id
  GROUP BY a1.symbol, a2.symbol
 HAVING count(*) >= 20
  ORDER BY (abs(corr(r1.r::double precision, r2.r::double precision))) DESC NULLS LAST;

-- ── vw_quant_drawdown ────────────────────────────────────────────────────────
-- The running peak is per-asset and unbounded-preceding, so it needs each held
-- asset's FULL history — the filter restricts assets, never dates.
create or replace view public.vw_quant_drawdown as
 WITH latest_pos AS (
         SELECT DISTINCT ON (p.asset_id) p.asset_id
           FROM positions p
             JOIN assets a_1 ON a_1.id = p.asset_id
          WHERE p.quantity <> 0::numeric
            AND p.as_of_date >= (( SELECT max(positions.as_of_date) - 7 FROM positions))
            AND NOT (a_1.asset_class = 'option'::text
                     AND a_1.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'::text
                     AND to_date("substring"(a_1.symbol, '(\d{6})[CP]'::text), 'YYMMDD'::text) < CURRENT_DATE)
          ORDER BY p.asset_id, p.as_of_date DESC
        ), price_with_peak AS (
         SELECT ph.asset_id, ph.price_date, ph.close,
            max(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date
                                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_peak
           FROM price_history ph
          WHERE ph."interval" = '1d'::text
            AND ph.asset_id IN (SELECT latest_pos.asset_id FROM latest_pos)
        ), drawdown_series AS (
         SELECT price_with_peak.asset_id, price_with_peak.price_date, price_with_peak.close,
            price_with_peak.running_peak,
            price_with_peak.close / NULLIF(price_with_peak.running_peak, 0::numeric) - 1::numeric AS drawdown_pct
           FROM price_with_peak
        ), dd_current AS (
         SELECT DISTINCT ON (drawdown_series.asset_id) drawdown_series.asset_id,
            drawdown_series.close AS current_price,
            drawdown_series.running_peak AS ath_in_window,
            drawdown_series.drawdown_pct AS current_drawdown_pct
           FROM drawdown_series
          ORDER BY drawdown_series.asset_id, drawdown_series.price_date DESC
        ), dd_max AS (
         SELECT drawdown_series.asset_id, min(drawdown_series.drawdown_pct) AS max_drawdown_pct
           FROM drawdown_series GROUP BY drawdown_series.asset_id
        )
 SELECT a.symbol, a.name, dc.current_price,
    round(dc.ath_in_window, 4) AS all_time_high,
    round(dc.current_drawdown_pct * 100::numeric, 2) AS current_drawdown_pct,
    round(dm.max_drawdown_pct * 100::numeric, 2) AS max_drawdown_pct,
    round((dc.ath_in_window / NULLIF(dc.current_price, 0::numeric) - 1::numeric) * 100::numeric, 2) AS recovery_needed_pct,
        CASE WHEN dc.current_drawdown_pct > '-0.10'::numeric THEN 'Near Highs'::text
             WHEN dc.current_drawdown_pct > '-0.20'::numeric THEN 'Moderate Drawdown'::text
             WHEN dc.current_drawdown_pct > '-0.35'::numeric THEN 'Significant Drawdown'::text
             ELSE 'Deep Drawdown'::text END AS drawdown_regime
   FROM latest_pos lp
     JOIN assets a ON a.id = lp.asset_id
     JOIN dd_current dc ON dc.asset_id = lp.asset_id
     JOIN dd_max dm ON dm.asset_id = lp.asset_id
  ORDER BY dc.current_drawdown_pct;

-- ── vw_performance_suite ─────────────────────────────────────────────────────
-- Two scans to bound: latest_prices took a DISTINCT ON across the whole book to
-- find 54 last closes, and sector_live built a row for all 7,955 assets to
-- decorate 54. Both are inner-joined/left-joined on asset_id downstream.
create or replace view public.vw_performance_suite as
 WITH latest_pos_snapshot AS (
         SELECT DISTINCT ON (p.asset_id) p.asset_id, p.quantity, p.average_cost,
            p.market_value, p.as_of_date, p.side
           FROM positions p
             JOIN assets a_1 ON a_1.id = p.asset_id
          WHERE p.as_of_date >= (( SELECT max(positions.as_of_date) - 2 FROM positions))
            AND NOT (a_1.asset_class = 'option'::text
                     AND a_1.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'::text
                     AND to_date("substring"(a_1.symbol, '(\d{6})[CP]'::text), 'YYMMDD'::text) < CURRENT_DATE)
          ORDER BY p.asset_id, p.as_of_date DESC
        ), latest_pos AS (
         SELECT latest_pos_snapshot.asset_id, latest_pos_snapshot.quantity,
            latest_pos_snapshot.average_cost, latest_pos_snapshot.market_value,
            latest_pos_snapshot.as_of_date, latest_pos_snapshot.side
           FROM latest_pos_snapshot
          WHERE latest_pos_snapshot.quantity IS NOT NULL
            AND latest_pos_snapshot.quantity <> 0::numeric
            AND (latest_pos_snapshot.market_value IS NULL OR abs(latest_pos_snapshot.market_value) > 0.01)
        ), first_buys AS (
         SELECT DISTINCT ON (t.asset_id) t.asset_id, t.price AS tx_entry_price,
            t.transaction_date AS tx_entry_date
           FROM transactions t
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
         SELECT pb_1.asset_id, max(ph.high) AS high_30d_post_entry,
            min(ph.low) AS low_30d_post_entry
           FROM position_base pb_1
             LEFT JOIN price_history ph ON ph.asset_id = pb_1.asset_id
                  AND ph."interval" = '1d'::text
                  AND ph.price_date >= pb_1.entry_date
                  AND ph.price_date <= (pb_1.entry_date + '30 days'::interval)
          GROUP BY pb_1.asset_id
        ), latest_prices AS (
         SELECT DISTINCT ON (price_history.asset_id) price_history.asset_id,
            price_history.close AS current_price
           FROM price_history
          WHERE price_history."interval" = '1d'::text
            AND price_history.asset_id IN (SELECT position_base.asset_id FROM position_base)
          ORDER BY price_history.asset_id, price_history.price_date DESC
        ), sector_live AS (
         SELECT a_1.id AS asset_id,
            NULLIF(TRIM(BOTH FROM ec.payload ->> 'Sector'::text), ''::text) AS av_sector
           FROM assets a_1
             LEFT JOIN equity_cache ec ON ec.symbol = a_1.symbol
                  AND ec.endpoint = 'overview'::text
                  AND ec.expires_at > (now() - '48:00:00'::interval)
          WHERE a_1.id IN (SELECT position_base.asset_id FROM position_base)
        )
 SELECT a.symbol, a.name,
    COALESCE(sl.av_sector, a.sector, 'Other'::text) AS sector,
    pb.market_value, pb.side, pb.entry_price, pb.entry_date, lp.current_price,
    round((1::numeric - (pb.entry_price - per.low_30d_post_entry)
           / NULLIF(per.high_30d_post_entry - per.low_30d_post_entry, 0::numeric)) * 100::numeric, 1) AS entry_efficiency_score,
    (lp.current_price - pb.entry_price) / NULLIF(pb.entry_price, 0::numeric) AS total_return_pct,
        CASE WHEN CURRENT_DATE > pb.entry_date
             THEN power(lp.current_price / NULLIF(pb.entry_price, 0::numeric),
                        365.0 / NULLIF(CURRENT_DATE - pb.entry_date, 0)::numeric) - 1::numeric
             ELSE NULL::numeric END AS annualised_return,
    CURRENT_DATE - pb.entry_date AS days_held,
        CASE WHEN (CURRENT_DATE - pb.entry_date) > 180
              AND ((lp.current_price - pb.entry_price) / NULLIF(pb.entry_price, 0::numeric)) < 0::numeric
             THEN true ELSE false END AS cut_candidate_flag
   FROM position_base pb
     JOIN assets a ON a.id = pb.asset_id
     JOIN latest_prices lp ON lp.asset_id = pb.asset_id
     LEFT JOIN post_entry_range per ON per.asset_id = pb.asset_id
     LEFT JOIN sector_live sl ON sl.asset_id = pb.asset_id
  ORDER BY (
        CASE WHEN CURRENT_DATE > pb.entry_date
             THEN power(lp.current_price / NULLIF(pb.entry_price, 0::numeric),
                        365.0 / NULLIF(CURRENT_DATE - pb.entry_date, 0)::numeric) - 1::numeric
             ELSE NULL::numeric END) DESC NULLS LAST;

-- ── vw_position_nav_daily ────────────────────────────────────────────────────
-- This one is genuinely historical — it covers every asset ever held, not just
-- the current book — so the fix is not "held assets only". trading_days took a
-- DISTINCT over all 481k rows to recover ~250 calendar dates; restricting it to
-- the assets in asset_lifespan gives the same date set, because those are the
-- only assets the grid is ever paired with and the only ones priced downstream.
create or replace view public.vw_position_nav_daily as
 WITH signed_transactions AS (
         SELECT t.portfolio_id, t.asset_id, t.transaction_date::date AS tx_date,
                CASE WHEN lower(t.transaction_type) ~~ '%sell%'::text THEN - abs(t.quantity)
                     WHEN lower(t.transaction_type) ~~ '%buy%'::text THEN abs(t.quantity)
                     WHEN lower(t.transaction_type) = 'fill'::text THEN t.quantity
                     ELSE 0::numeric END AS signed_qty
           FROM transactions t
             JOIN assets a_1 ON a_1.id = t.asset_id
          WHERE a_1.symbol <> '$CASH'::text
        ), daily_net AS (
         SELECT signed_transactions.portfolio_id, signed_transactions.asset_id,
            signed_transactions.tx_date, sum(signed_transactions.signed_qty) AS net_qty
           FROM signed_transactions
          GROUP BY signed_transactions.portfolio_id, signed_transactions.asset_id, signed_transactions.tx_date
        ), cumulative_holdings AS (
         SELECT daily_net.portfolio_id, daily_net.asset_id, daily_net.tx_date,
            sum(daily_net.net_qty) OVER (PARTITION BY daily_net.portfolio_id, daily_net.asset_id
                                         ORDER BY daily_net.tx_date
                                         ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_qty
           FROM daily_net
        ), asset_lifespan AS (
         SELECT cumulative_holdings.portfolio_id, cumulative_holdings.asset_id,
            min(cumulative_holdings.tx_date) AS start_date
           FROM cumulative_holdings
          WHERE cumulative_holdings.running_qty <> 0::numeric
          GROUP BY cumulative_holdings.portfolio_id, cumulative_holdings.asset_id
        ), trading_days AS (
         SELECT DISTINCT price_history.price_date AS cal_date
           FROM price_history
          WHERE price_history."interval" = '1d'::text
            AND price_history.asset_id IN (SELECT asset_lifespan.asset_id FROM asset_lifespan)
        ), holdings_grid AS (
         SELECT al.portfolio_id, al.asset_id, td.cal_date
           FROM asset_lifespan al
             JOIN trading_days td ON td.cal_date >= al.start_date AND td.cal_date <= CURRENT_DATE
        ), daily_holdings AS (
         SELECT hg.portfolio_id, hg.asset_id, hg.cal_date,
            ( SELECT ch.running_qty
                   FROM cumulative_holdings ch
                  WHERE ch.portfolio_id = hg.portfolio_id AND ch.asset_id = hg.asset_id
                    AND ch.tx_date <= hg.cal_date
                  ORDER BY ch.tx_date DESC
                 LIMIT 1) AS quantity
           FROM holdings_grid hg
        )
 SELECT dh.portfolio_id, dh.asset_id, a.symbol, a.asset_class,
    dh.cal_date AS price_date,
    COALESCE(dh.quantity, 0::numeric) AS quantity,
    ph.close AS close_price,
    COALESCE(dh.quantity, 0::numeric) * ph.close AS position_value
   FROM daily_holdings dh
     JOIN assets a ON a.id = dh.asset_id
     LEFT JOIN price_history ph ON ph.asset_id = dh.asset_id
          AND ph.price_date = dh.cal_date AND ph."interval" = '1d'::text
  WHERE COALESCE(dh.quantity, 0::numeric) <> 0::numeric;
