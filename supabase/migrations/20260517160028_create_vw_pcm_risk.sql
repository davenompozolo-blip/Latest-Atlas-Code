
CREATE OR REPLACE VIEW vw_pcm_risk AS
WITH totals AS (
    SELECT SUM(market_value) AS total_mv
    FROM positions
    WHERE market_value > 0
),
daily_returns AS (
    SELECT
        asset_id,
        price_date,
        close,
        LAG(close) OVER (PARTITION BY asset_id ORDER BY price_date) AS prev_close
    FROM price_history
    WHERE price_date >= CURRENT_DATE - INTERVAL '130 days'
      AND close > 0
),
vol_agg AS (
    SELECT
        asset_id,
        ROUND((STDDEV(LN(close / prev_close)) * SQRT(252) * 100)::numeric, 1) AS vol_90d
    FROM daily_returns
    WHERE prev_close IS NOT NULL
      AND prev_close > 0
      AND price_date >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY asset_id
    HAVING COUNT(*) >= 10
)
SELECT
    a.symbol                                                            AS ticker,
    ROUND((p.market_value / NULLIF(t.total_mv, 0) * 100)::numeric, 2) AS weight,
    va.vol_90d,
    NULL::numeric                                                        AS mrc,
    NULL::numeric                                                        AS prc
FROM positions p
LEFT JOIN assets  a  ON a.id      = p.asset_id
LEFT JOIN vol_agg va ON va.asset_id = p.asset_id
CROSS JOIN totals t
WHERE p.market_value > 0
  AND a.symbol IS NOT NULL
ORDER BY p.market_value DESC
LIMIT 20;
