
CREATE OR REPLACE VIEW vw_pcm_allocation AS
WITH totals AS (
    SELECT SUM(market_value) AS total_mv
    FROM positions
    WHERE market_value > 0
),
by_class AS (
    SELECT
        COALESCE(UPPER(a.asset_class), 'EQUITY') AS asset_class,
        SUM(p.market_value)                        AS class_mv
    FROM positions p
    LEFT JOIN assets a ON a.id = p.asset_id
    WHERE p.market_value > 0
    GROUP BY 1
),
targets (asset_class, saa_floor, saa_ceil, taa_target) AS (
    VALUES
        ('EQUITY',       70, 85, 75),
        ('FIXED_INCOME',  0, 10,  8),
        ('ALTERNATIVE',  10, 20, 12),
        ('CASH',          2,  5,  5)
)
SELECT
    tgt.asset_class,
    ROUND(COALESCE(bc.class_mv / NULLIF(t.total_mv, 0) * 100, 0)::numeric, 2) AS current_weight,
    tgt.saa_floor,
    tgt.saa_ceil,
    tgt.taa_target
FROM targets tgt
LEFT JOIN by_class bc ON bc.asset_class = tgt.asset_class
CROSS JOIN totals t;
