-- =============================================================================
-- ATLAS Terminal — Supabase Analytics Views
-- Phase 1: Backend Rewiring Initiative (March 2026)
--
-- Run each block in Supabase SQL Editor to create the views.
-- Validation query at the bottom verifies all five views return data.
--
-- Actual table column reference (from services/supabase_client.py +
-- services/data_normalizer.py + services/market_data/ingestion_service.py):
--   price_history : asset_id, source, interval, price_date, open, high, low,
--                   close, adjusted_close, volume
--   positions     : portfolio_id, asset_id, quantity, average_cost,
--                   market_value, as_of_date
--   transactions  : portfolio_id, asset_id, transaction_type, quantity,
--                   price, fees, transaction_date, external_id, notes, metadata
--   assets        : id, symbol, name, asset_class, exchange, currency, metadata
--
-- NOTE: positions accumulates one snapshot row per (portfolio_id, asset_id,
-- as_of_date) on each daily sync. All views use a latest_pos CTE that selects
-- only the most-recent snapshot per asset to avoid duplicate rows.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- VIEW 1: vw_portfolio_home
-- Portfolio-level position analytics with concentration and tail risk flags.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_portfolio_home AS
WITH latest_pos AS (
    SELECT DISTINCT ON (asset_id)
        asset_id, quantity, average_cost, market_value, as_of_date
    FROM positions
    ORDER BY asset_id, as_of_date DESC
), latest_prices AS (
    SELECT DISTINCT ON (asset_id)
        asset_id,
        close AS current_price,
        price_date
    FROM price_history
    WHERE interval = '1d'
    ORDER BY asset_id, price_date DESC
), returns AS (
    SELECT
        ph.asset_id,
        ph.price_date,
        (ph.close - LAG(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date))
            / NULLIF(LAG(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date), 0) AS daily_return
    FROM price_history ph
    WHERE ph.interval = '1d'
), stats AS (
    SELECT
        asset_id,
        COUNT(*) AS trading_days,
        AVG(daily_return) AS mu,
        STDDEV(daily_return) AS sigma
    FROM returns
    WHERE daily_return IS NOT NULL
    GROUP BY asset_id
), nav AS (
    SELECT SUM(market_value) AS total_nav
    FROM latest_pos
), hhi AS (
    SELECT
        SUM(POWER(market_value / NULLIF(nav.total_nav, 0), 2)) AS hhi_score,
        COUNT(*) AS n_positions
    FROM latest_pos
    CROSS JOIN nav
)
SELECT
    a.symbol,
    a.name,
    p.quantity,
    p.average_cost AS cost_basis,
    lp.current_price,
    p.market_value,
    (lp.current_price - p.average_cost) / NULLIF(p.average_cost, 0) AS unrealised_return_pct,
    p.market_value / NULLIF(nav.total_nav, 0) AS portfolio_weight,
    s.sigma * SQRT(252) AS annualised_vol,
    s.mu / NULLIF(s.sigma, 0) * SQRT(252) AS sharpe_approx,
    h.hhi_score,
    h.n_positions,
    CASE WHEN p.market_value / NULLIF(nav.total_nav, 0) > 0.10 THEN true ELSE false END AS is_concentrated,
    lp.price_date
FROM latest_pos p
JOIN assets a ON a.id = p.asset_id
JOIN latest_prices lp ON lp.asset_id = p.asset_id
JOIN stats s ON s.asset_id = p.asset_id
CROSS JOIN nav
CROSS JOIN hhi h
ORDER BY p.market_value DESC;

-- ---------------------------------------------------------------------------
-- VIEW 2: vw_quant_dashboard
-- Market regime detection, momentum scores, and mean reversion signals.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_quant_dashboard AS
WITH latest_pos AS (
    SELECT DISTINCT ON (asset_id)
        asset_id
    FROM positions
    ORDER BY asset_id, as_of_date DESC
), ranked_prices AS (
    SELECT
        asset_id,
        price_date,
        close,
        ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY price_date DESC) AS rn,
        COUNT(*) OVER (PARTITION BY asset_id) AS total_days
    FROM price_history
    WHERE interval = '1d'
), ma_calc AS (
    SELECT
        asset_id,
        AVG(close) FILTER (WHERE rn <= 20)  AS ma_20,
        AVG(close) FILTER (WHERE rn <= 50)  AS ma_50,
        AVG(close) FILTER (WHERE rn <= 200) AS ma_200,
        MAX(close) FILTER (WHERE rn <= 20)  AS high_20,
        MIN(close) FILTER (WHERE rn <= 20)  AS low_20,
        MAX(close) FILTER (WHERE rn <= 1)   AS current_price,
        STDDEV(close) FILTER (WHERE rn <= 20) AS stddev_20,
        total_days
    FROM ranked_prices
    GROUP BY asset_id, total_days
), returns AS (
    SELECT
        asset_id,
        price_date,
        (close - LAG(close) OVER (PARTITION BY asset_id ORDER BY price_date))
            / NULLIF(LAG(close) OVER (PARTITION BY asset_id ORDER BY price_date), 0) AS r
    FROM price_history
    WHERE interval = '1d'
), vol_stats AS (
    SELECT
        asset_id,
        STDDEV(r) FILTER (WHERE price_date >= CURRENT_DATE - 20) AS vol_20d,
        STDDEV(r) FILTER (WHERE price_date >= CURRENT_DATE - 60) AS vol_60d
    FROM returns
    WHERE r IS NOT NULL
    GROUP BY asset_id
)
SELECT
    a.symbol,
    a.name,
    mc.current_price,
    mc.ma_20,
    mc.ma_50,
    mc.ma_200,
    -- Regime detection
    CASE
        WHEN mc.current_price > mc.ma_50 AND mc.ma_50 > mc.ma_200 THEN 'Uptrend'
        WHEN mc.current_price < mc.ma_50 AND mc.ma_50 < mc.ma_200 THEN 'Downtrend'
        ELSE 'Sideways'
    END AS price_regime,
    -- Volatility regime
    CASE
        WHEN vs.vol_20d > vs.vol_60d THEN 'Expanding'
        WHEN vs.vol_20d < vs.vol_60d THEN 'Compressing'
        ELSE 'Stable'
    END AS vol_regime,
    -- Mean reversion Z-score (20-day)
    (mc.current_price - mc.ma_20) / NULLIF(mc.stddev_20, 0) AS zscore_20d,
    CASE
        WHEN (mc.current_price - mc.ma_20) / NULLIF(mc.stddev_20, 0) > 2 THEN 'Overbought'
        WHEN (mc.current_price - mc.ma_20) / NULLIF(mc.stddev_20, 0) < -2 THEN 'Oversold'
        ELSE 'Neutral'
    END AS mean_reversion_signal,
    -- Price range position (0-100 momentum score within 20-day range)
    ROUND(
        ((mc.current_price - mc.low_20) / NULLIF(mc.high_20 - mc.low_20, 0)) * 100
    , 1) AS momentum_pct_rank_20d,
    vs.vol_20d * SQRT(252) AS annualised_vol_20d,
    vs.vol_60d * SQRT(252) AS annualised_vol_60d,
    mc.total_days AS trading_days_available
FROM latest_pos lp
JOIN assets a ON a.id = lp.asset_id
JOIN ma_calc mc ON mc.asset_id = lp.asset_id
JOIN vol_stats vs ON vs.asset_id = lp.asset_id
ORDER BY mc.current_price / NULLIF(mc.ma_50, 0) DESC;

-- ---------------------------------------------------------------------------
-- VIEW 3: vw_risk_analysis
-- Marginal volatility contribution per position.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_risk_analysis AS
WITH latest_pos AS (
    SELECT DISTINCT ON (asset_id)
        asset_id, quantity, average_cost, market_value, as_of_date
    FROM positions
    ORDER BY asset_id, as_of_date DESC
), returns AS (
    SELECT
        ph.asset_id,
        ph.price_date,
        (ph.close - LAG(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date))
            / NULLIF(LAG(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date), 0) AS r
    FROM price_history ph
    WHERE ph.interval = '1d'
      AND ph.price_date >= CURRENT_DATE - INTERVAL '252 days'
), vol_per_position AS (
    SELECT
        asset_id,
        COUNT(*) AS obs,
        AVG(r) AS mu,
        STDDEV(r) AS sigma,
        STDDEV(r) * SQRT(252) AS annual_vol,
        PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY r) AS var_95_daily
    FROM returns
    WHERE r IS NOT NULL
    GROUP BY asset_id
), nav AS (
    SELECT SUM(market_value) AS total_nav FROM latest_pos
)
SELECT
    a.symbol,
    a.name,
    p.market_value,
    p.market_value / NULLIF(nav.total_nav, 0) AS weight,
    v.annual_vol,
    -- Marginal vol contribution = weight * annual_vol (simplified)
    (p.market_value / NULLIF(nav.total_nav, 0)) * v.annual_vol AS marginal_vol_contribution,
    -- Dollar VaR at 95% confidence (daily)
    ABS(v.var_95_daily) * p.market_value AS dollar_var_95_daily,
    v.obs AS trading_days,
    CASE
        WHEN v.annual_vol > 0.40 THEN 'High Risk'
        WHEN v.annual_vol > 0.20 THEN 'Moderate Risk'
        ELSE 'Low Risk'
    END AS risk_tier
FROM latest_pos p
JOIN assets a ON a.id = p.asset_id
JOIN vol_per_position v ON v.asset_id = p.asset_id
CROSS JOIN nav
ORDER BY marginal_vol_contribution DESC;

-- ---------------------------------------------------------------------------
-- VIEW 4: vw_performance_suite
-- Entry efficiency scoring and annualised return per position.
--
-- Root cause of 0-row problem: the old version used first_buys (transactions)
-- as the base table. If the transactions table is empty or transaction_type
-- values differ from 'buy' (e.g. uppercase), the entire view returns 0.
--
-- Fix: use latest_pos (same base as every other view → guaranteed 55 rows),
-- LEFT JOIN to first_buys so transactions enrich where available, and
-- COALESCE to fall back to positions.average_cost / as_of_date when no
-- transaction history exists.
-- Also: LOWER(transaction_type) = 'buy' for case-insensitive matching.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS vw_performance_suite;
CREATE VIEW vw_performance_suite AS
WITH latest_pos AS (
    SELECT DISTINCT ON (asset_id)
        asset_id, quantity, average_cost, as_of_date
    FROM positions
    ORDER BY asset_id, as_of_date DESC
), first_buys AS (
    -- Earliest buy per asset from transaction history (may be empty)
    SELECT DISTINCT ON (asset_id)
        asset_id,
        price        AS tx_entry_price,
        transaction_date AS tx_entry_date
    FROM transactions
    WHERE LOWER(transaction_type) = 'buy'
    ORDER BY asset_id, transaction_date ASC
), position_base AS (
    -- Combine positions with optional transaction data
    SELECT
        lp.asset_id,
        -- Prefer transaction entry price; fall back to positions average_cost
        COALESCE(fb.tx_entry_price,  lp.average_cost)       AS entry_price,
        -- Prefer transaction entry date; fall back to first known position date
        COALESCE(fb.tx_entry_date::date, lp.as_of_date::date) AS entry_date
    FROM latest_pos lp
    LEFT JOIN first_buys fb ON fb.asset_id = lp.asset_id
), post_entry_range AS (
    -- 30-day high/low after entry (NULL when entry predates price_history)
    SELECT
        pb.asset_id,
        MAX(ph.high) AS high_30d_post_entry,
        MIN(ph.low)  AS low_30d_post_entry
    FROM position_base pb
    LEFT JOIN price_history ph ON ph.asset_id = pb.asset_id
        AND ph.interval = '1d'
        AND ph.price_date BETWEEN pb.entry_date
                               AND (pb.entry_date + INTERVAL '30 days')
    GROUP BY pb.asset_id
), latest_prices AS (
    SELECT DISTINCT ON (asset_id)
        asset_id,
        close AS current_price
    FROM price_history
    WHERE interval = '1d'
    ORDER BY asset_id, price_date DESC
)
SELECT
    a.symbol,
    a.name,
    pb.entry_price,
    pb.entry_date,
    lp.current_price,
    -- Entry efficiency (NULL when 30-day post-entry range is unavailable)
    ROUND(
        (1 - (pb.entry_price - per.low_30d_post_entry)
            / NULLIF(per.high_30d_post_entry - per.low_30d_post_entry, 0)) * 100
    , 1) AS entry_efficiency_score,
    -- Total return from entry price to current price
    (lp.current_price - pb.entry_price) / NULLIF(pb.entry_price, 0) AS total_return_pct,
    -- Annualised return (CAGR)
    CASE
        WHEN CURRENT_DATE > pb.entry_date THEN
            POWER(
                lp.current_price / NULLIF(pb.entry_price, 0),
                365.0 / NULLIF(CURRENT_DATE - pb.entry_date, 0)
            ) - 1
        ELSE NULL
    END AS annualised_return,
    CURRENT_DATE - pb.entry_date AS days_held,
    -- Cut candidate: held > 180 days AND negative total return
    CASE
        WHEN (CURRENT_DATE - pb.entry_date) > 180
            AND (lp.current_price - pb.entry_price) / NULLIF(pb.entry_price, 0) < 0
        THEN true ELSE false
    END AS cut_candidate_flag
FROM position_base pb
JOIN assets a     ON a.id           = pb.asset_id
JOIN latest_prices lp ON lp.asset_id = pb.asset_id
LEFT JOIN post_entry_range per ON per.asset_id = pb.asset_id
ORDER BY annualised_return DESC NULLS LAST;

-- ---------------------------------------------------------------------------
-- VIEW 5: vw_command_centre
-- Single-row ATLAS Health Score, Sortino ratio, portfolio VaR.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_command_centre AS
WITH latest_pos AS (
    SELECT DISTINCT ON (asset_id)
        asset_id, quantity, average_cost, market_value, as_of_date
    FROM positions
    ORDER BY asset_id, as_of_date DESC
), daily_returns AS (
    SELECT
        ph.price_date,
        SUM(ph.close * p.quantity) AS nav
    FROM price_history ph
    JOIN latest_pos p ON p.asset_id = ph.asset_id
    WHERE ph.interval = '1d'
    GROUP BY ph.price_date
    ORDER BY ph.price_date
), nav_returns AS (
    SELECT
        price_date,
        nav,
        (nav - LAG(nav) OVER (ORDER BY price_date)) / NULLIF(LAG(nav) OVER (ORDER BY price_date), 0) AS r
    FROM daily_returns
), stats AS (
    SELECT
        COUNT(*) AS trading_days,
        AVG(r) AS mu,
        STDDEV(r) AS sigma,
        STDDEV(r) FILTER (WHERE r < 0) AS downside_sigma,
        MIN(nav) AS nav_low,
        MAX(nav) AS nav_high,
        PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY r) AS var_95_daily
    FROM nav_returns
    WHERE r IS NOT NULL
), current_nav AS (
    SELECT SUM(market_value) AS nav FROM latest_pos
), position_count AS (
    SELECT COUNT(*) AS n FROM latest_pos
), total_cost AS (
    SELECT SUM(average_cost * quantity) AS total_invested FROM latest_pos
)
SELECT
    cn.nav AS portfolio_nav,
    tc.total_invested,
    (cn.nav - tc.total_invested) / NULLIF(tc.total_invested, 0) AS total_return_pct,
    -- Sharpe ratio (annualised, risk-free = 4.5% / 252)
    ROUND(((s.mu - 0.000178) / NULLIF(s.sigma, 0) * SQRT(252))::numeric, 2) AS sharpe_ratio,
    -- Sortino ratio (annualised, penalises downside only)
    ROUND(((s.mu - 0.000178) / NULLIF(s.downside_sigma, 0) * SQRT(252))::numeric, 2) AS sortino_ratio,
    -- Max drawdown
    ROUND(((cn.nav - s.nav_high) / NULLIF(s.nav_high, 0) * 100)::numeric, 2) AS drawdown_pct,
    -- Portfolio dollar VaR at 95% confidence (daily)
    ROUND((ABS(s.var_95_daily) * cn.nav)::numeric, 2) AS dollar_var_95,
    -- ATLAS Health Score (0-100)
    ROUND(LEAST(100, GREATEST(0,
        ((s.mu - 0.000178) / NULLIF(s.sigma, 0) * SQRT(252)) * 40
        + (1 + (cn.nav - s.nav_high) / NULLIF(s.nav_high, 0)) * 40
        + LEAST(20, pc.n)
    ))::numeric, 1) AS atlas_health_score,
    CASE
        WHEN LEAST(100, GREATEST(0,
            ((s.mu - 0.000178) / NULLIF(s.sigma, 0) * SQRT(252)) * 40
            + (1 + (cn.nav - s.nav_high) / NULLIF(s.nav_high, 0)) * 40
            + LEAST(20, pc.n)
        )) >= 75 THEN 'Strong'
        WHEN LEAST(100, GREATEST(0,
            ((s.mu - 0.000178) / NULLIF(s.sigma, 0) * SQRT(252)) * 40
            + (1 + (cn.nav - s.nav_high) / NULLIF(s.nav_high, 0)) * 40
            + LEAST(20, pc.n)
        )) >= 50 THEN 'Moderate'
        ELSE 'Needs Attention'
    END AS portfolio_health_status,
    pc.n AS position_count,
    s.trading_days AS days_of_history,
    NOW() AS computed_at
FROM stats s
CROSS JOIN current_nav cn
CROSS JOIN position_count pc
CROSS JOIN total_cost tc;

-- ---------------------------------------------------------------------------
-- VIEW 6: vw_portfolio_returns_daily
-- Daily portfolio NAV and return series reconstructed from ACTUAL position
-- snapshots stored in the positions table (one row per asset per Alpaca sync).
--
-- KEY DESIGN: Uses positions.as_of_date snapshots × matching price_history close
-- prices — NOT today's holdings back-projected through all history.
-- This means:
--   • Time series starts from the first Alpaca sync (when portfolio first existed)
--   • Changing position sizes over time are respected (buys/sells show as NAV changes)
--   • No bootstrap artefacts from applying current weights to pre-portfolio history
--
-- Returns are NAV-based (Δ_NAV / previous_NAV), standard market convention.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_portfolio_returns_daily AS
WITH position_snapshots AS (
    -- All daily position snapshots from Alpaca syncs (quantity > 0 only)
    SELECT DISTINCT
        as_of_date::date AS snapshot_date,
        asset_id,
        quantity
    FROM positions
    WHERE quantity > 0
),
daily_nav AS (
    -- For each snapshot day, value each position at that day's closing price
    SELECT
        ps.snapshot_date                    AS price_date,
        SUM(ph.close * ps.quantity)         AS portfolio_nav
    FROM position_snapshots ps
    JOIN price_history ph
        ON  ph.asset_id  = ps.asset_id
        AND ph.price_date = ps.snapshot_date
        AND ph.interval  = '1d'
    GROUP BY ps.snapshot_date
    HAVING SUM(ph.close * ps.quantity) > 0
)
SELECT
    price_date,
    portfolio_nav,
    ROUND(
        ((portfolio_nav - LAG(portfolio_nav) OVER (ORDER BY price_date))
        / NULLIF(LAG(portfolio_nav) OVER (ORDER BY price_date), 0))::numeric
    , 6) AS daily_return
FROM daily_nav
ORDER BY price_date;

-- ---------------------------------------------------------------------------
-- VALIDATION QUERY — Run after creating all views to confirm row counts
-- Expected: position views ~55 rows each, vw_command_centre exactly 1 row,
--           vw_portfolio_returns_daily ≥ 2 rows (days of price_history)
-- ---------------------------------------------------------------------------
SELECT 'vw_portfolio_home'           AS view_name, COUNT(*) AS rows FROM vw_portfolio_home
UNION ALL
SELECT 'vw_quant_dashboard',          COUNT(*) FROM vw_quant_dashboard
UNION ALL
SELECT 'vw_risk_analysis',            COUNT(*) FROM vw_risk_analysis
UNION ALL
SELECT 'vw_performance_suite',        COUNT(*) FROM vw_performance_suite
UNION ALL
SELECT 'vw_command_centre',           COUNT(*) FROM vw_command_centre
UNION ALL
SELECT 'vw_portfolio_returns_daily',  COUNT(*) FROM vw_portfolio_returns_daily;
