-- =============================================================================
-- ATLAS Terminal — Supabase Analytics Views
-- Phase 1: Backend Rewiring Initiative (March 2026)
--
-- Run each block in Supabase SQL Editor to create the views.
-- Validation query at the bottom verifies all five views return data.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- VIEW 1: vw_portfolio_home
-- Portfolio-level position analytics with concentration and tail risk flags.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_portfolio_home AS
WITH latest_prices AS (
    SELECT DISTINCT ON (asset_id)
        asset_id,
        close AS current_price,
        date AS price_date
    FROM price_history
    ORDER BY asset_id, date DESC
), returns AS (
    SELECT
        ph.asset_id,
        ph.date,
        (ph.close - LAG(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.date))
            / NULLIF(LAG(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.date), 0) AS daily_return
    FROM price_history ph
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
    FROM positions
), hhi AS (
    SELECT
        SUM(POWER(market_value / NULLIF(nav.total_nav, 0), 2)) AS hhi_score,
        COUNT(*) AS n_positions
    FROM positions
    CROSS JOIN nav
)
SELECT
    a.symbol,
    a.name,
    p.quantity,
    p.cost_basis,
    lp.current_price,
    p.market_value,
    (lp.current_price - p.cost_basis) / NULLIF(p.cost_basis, 0) AS unrealised_return_pct,
    p.market_value / NULLIF(nav.total_nav, 0) AS portfolio_weight,
    s.sigma * SQRT(252) AS annualised_vol,
    s.mu / NULLIF(s.sigma, 0) * SQRT(252) AS sharpe_approx,
    h.hhi_score,
    h.n_positions,
    CASE WHEN p.market_value / NULLIF(nav.total_nav, 0) > 0.10 THEN true ELSE false END AS is_concentrated,
    lp.price_date
FROM positions p
JOIN assets a ON a.id = p.asset_id
JOIN latest_prices lp ON lp.asset_id = p.asset_id
JOIN stats s ON s.asset_id = p.asset_id
CROSS JOIN nav
CROSS JOIN hhi
ORDER BY p.market_value DESC;

-- ---------------------------------------------------------------------------
-- VIEW 2: vw_quant_dashboard
-- Market regime detection, momentum scores, and mean reversion signals.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_quant_dashboard AS
WITH ranked_prices AS (
    SELECT
        asset_id,
        date,
        close,
        ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY date DESC) AS rn,
        COUNT(*) OVER (PARTITION BY asset_id) AS total_days
    FROM price_history
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
        date,
        (close - LAG(close) OVER (PARTITION BY asset_id ORDER BY date))
            / NULLIF(LAG(close) OVER (PARTITION BY asset_id ORDER BY date), 0) AS r
    FROM price_history
), vol_stats AS (
    SELECT
        asset_id,
        STDDEV(r) FILTER (WHERE date >= CURRENT_DATE - 20) AS vol_20d,
        STDDEV(r) FILTER (WHERE date >= CURRENT_DATE - 60) AS vol_60d
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
FROM positions p
JOIN assets a ON a.id = p.asset_id
JOIN ma_calc mc ON mc.asset_id = p.asset_id
JOIN vol_stats vs ON vs.asset_id = p.asset_id
ORDER BY mc.current_price / NULLIF(mc.ma_50, 0) DESC;

-- ---------------------------------------------------------------------------
-- VIEW 3: vw_risk_analysis
-- Marginal volatility contribution per position.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_risk_analysis AS
WITH returns AS (
    SELECT
        ph.asset_id,
        ph.date,
        (ph.close - LAG(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.date))
            / NULLIF(LAG(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.date), 0) AS r
    FROM price_history ph
    WHERE ph.date >= CURRENT_DATE - INTERVAL '252 days'
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
    SELECT SUM(market_value) AS total_nav FROM positions
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
FROM positions p
JOIN assets a ON a.id = p.asset_id
JOIN vol_per_position v ON v.asset_id = p.asset_id
CROSS JOIN nav
ORDER BY marginal_vol_contribution DESC;

-- ---------------------------------------------------------------------------
-- VIEW 4: vw_performance_suite
-- Entry efficiency scoring and annualised return per position.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_performance_suite AS
WITH first_buys AS (
    SELECT DISTINCT ON (asset_id)
        asset_id,
        price AS entry_price,
        filled_at AS entry_date,
        quantity
    FROM transactions
    WHERE side = 'buy'
    ORDER BY asset_id, filled_at ASC
), price_at_entry AS (
    SELECT
        fb.asset_id,
        fb.entry_price,
        fb.entry_date,
        fb.quantity,
        MAX(ph.high) AS high_30d_post_entry,
        MIN(ph.low)  AS low_30d_post_entry
    FROM first_buys fb
    JOIN price_history ph ON ph.asset_id = fb.asset_id
        AND ph.date BETWEEN fb.entry_date AND fb.entry_date + INTERVAL '30 days'
    GROUP BY fb.asset_id, fb.entry_price, fb.entry_date, fb.quantity
), latest_prices AS (
    SELECT DISTINCT ON (asset_id)
        asset_id,
        close AS current_price
    FROM price_history
    ORDER BY asset_id, date DESC
)
SELECT
    a.symbol,
    a.name,
    pe.entry_price,
    pe.entry_date,
    lp.current_price,
    -- Entry efficiency: where in the 30-day post-entry range did we buy?
    ROUND(
        (1 - (pe.entry_price - pe.low_30d_post_entry)
            / NULLIF(pe.high_30d_post_entry - pe.low_30d_post_entry, 0)) * 100
    , 1) AS entry_efficiency_score,
    -- Return since entry
    (lp.current_price - pe.entry_price) / NULLIF(pe.entry_price, 0) AS total_return_pct,
    -- Annualised return
    CASE
        WHEN CURRENT_DATE > pe.entry_date THEN
            POWER(
                lp.current_price / NULLIF(pe.entry_price, 0),
                365.0 / NULLIF(CURRENT_DATE - pe.entry_date::date, 0)
            ) - 1
        ELSE NULL
    END AS annualised_return,
    CURRENT_DATE - pe.entry_date::date AS days_held,
    -- Cut candidate: held >180 days, negative total return
    CASE
        WHEN (CURRENT_DATE - pe.entry_date::date) > 180
            AND (lp.current_price - pe.entry_price) / NULLIF(pe.entry_price, 0) < 0
        THEN true ELSE false
    END AS cut_candidate_flag
FROM price_at_entry pe
JOIN assets a ON a.id = pe.asset_id
JOIN latest_prices lp ON lp.asset_id = pe.asset_id
ORDER BY annualised_return DESC NULLS LAST;

-- ---------------------------------------------------------------------------
-- VIEW 5: vw_command_centre
-- Single-row ATLAS Health Score, Sortino ratio, portfolio VaR.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_command_centre AS
WITH daily_returns AS (
    SELECT
        ph.date,
        SUM(ph.close * p.quantity) AS nav
    FROM price_history ph
    JOIN positions p ON p.asset_id = ph.asset_id
    GROUP BY ph.date
    ORDER BY ph.date
), nav_returns AS (
    SELECT
        date,
        nav,
        (nav - LAG(nav) OVER (ORDER BY date)) / NULLIF(LAG(nav) OVER (ORDER BY date), 0) AS r
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
    SELECT SUM(market_value) AS nav FROM positions
), position_count AS (
    SELECT COUNT(*) AS n FROM positions
), total_cost AS (
    SELECT SUM(cost_basis * quantity) AS total_invested FROM positions
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
-- VALIDATION QUERY — Run after creating all views to confirm row counts
-- Expected: position views ~55 rows each, vw_command_centre exactly 1 row
-- ---------------------------------------------------------------------------
SELECT 'vw_portfolio_home'    AS view_name, COUNT(*) AS rows FROM vw_portfolio_home
UNION ALL
SELECT 'vw_quant_dashboard',  COUNT(*) FROM vw_quant_dashboard
UNION ALL
SELECT 'vw_risk_analysis',    COUNT(*) FROM vw_risk_analysis
UNION ALL
SELECT 'vw_performance_suite', COUNT(*) FROM vw_performance_suite
UNION ALL
SELECT 'vw_command_centre',   COUNT(*) FROM vw_command_centre;
