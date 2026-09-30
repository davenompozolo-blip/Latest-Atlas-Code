
DROP VIEW IF EXISTS vw_risk_analysis;

CREATE VIEW vw_risk_analysis AS
WITH latest_pos AS (
    SELECT DISTINCT ON (p.asset_id)
        p.asset_id,
        p.quantity,
        p.average_cost,
        p.market_value,
        p.as_of_date
    FROM positions p
    JOIN assets a ON a.id = p.asset_id
    WHERE p.quantity IS NOT NULL
      AND p.quantity <> 0
      AND (p.market_value IS NULL OR abs(p.market_value) > 0.01)
      AND NOT (
          a.asset_class IN ('option', 'us_option')
          AND a.symbol ~ '^[A-Z.]{1,6}[0-9]{6}[CP][0-9]{8}$'
          AND to_date(substring(a.symbol, '([0-9]{6})[CP]'), 'YYMMDD') < CURRENT_DATE
      )
    ORDER BY p.asset_id, p.as_of_date DESC
),
returns AS (
    SELECT ph.asset_id,
        ph.price_date,
        (ph.close - lag(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date))
            / NULLIF(lag(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date), 0) AS r
    FROM price_history ph
    WHERE ph."interval" = '1d'
      AND ph.price_date >= (CURRENT_DATE - INTERVAL '252 days')
),
vol_per_position AS (
    SELECT asset_id,
        count(*)                                                          AS obs,
        avg(r)                                                            AS mu,
        stddev(r)                                                         AS sigma,
        stddev(r)::double precision * sqrt(252)                           AS annual_vol,
        percentile_cont(0.05) WITHIN GROUP (ORDER BY r::double precision) AS var_95_daily
    FROM returns
    WHERE r IS NOT NULL
    GROUP BY asset_id
),
nav AS (
    SELECT sum(market_value) AS total_nav FROM latest_pos
)
SELECT
    a.symbol,
    a.name,
    a.sector,
    p.market_value,
    p.market_value / NULLIF(nav.total_nav, 0)                                              AS weight,
    v.annual_vol,
    (p.market_value / NULLIF(nav.total_nav, 0))::double precision * v.annual_vol           AS marginal_vol_contribution,
    abs(v.var_95_daily) * p.market_value::double precision                                 AS dollar_var_95_daily,
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
ORDER BY (p.market_value / NULLIF(nav.total_nav, 0))::double precision * v.annual_vol DESC;
