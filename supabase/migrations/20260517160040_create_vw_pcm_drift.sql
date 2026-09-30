
CREATE OR REPLACE VIEW vw_pcm_drift AS
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
targets (asset_class, taa_target, saa_floor, saa_ceil) AS (
    VALUES
        ('EQUITY',       75, 70, 85),
        ('FIXED_INCOME',  8,  0, 10),
        ('ALTERNATIVE',  12, 10, 20),
        ('CASH',          5,  2,  5)
),
drift_calc AS (
    SELECT
        tgt.asset_class,
        ROUND(COALESCE(bc.class_mv / NULLIF(t.total_mv, 0) * 100, 0)::numeric, 2) AS current_weight,
        tgt.taa_target,
        tgt.saa_floor,
        tgt.saa_ceil
    FROM targets tgt
    LEFT JOIN by_class bc ON bc.asset_class = tgt.asset_class
    CROSS JOIN totals t
),
summary AS (
    SELECT
        ROUND(SUM(ABS(current_weight - taa_target))::numeric, 2)                     AS aggregate_drift,
        BOOL_OR(current_weight < saa_floor OR current_weight > saa_ceil)              AS trigger_fired,
        JSON_AGG(
            JSON_BUILD_OBJECT(
                'ticker',     asset_class,
                'action',     CASE WHEN current_weight > taa_target THEN 'SELL' ELSE 'BUY' END,
                'delta_pct',  ROUND((taa_target - current_weight)::numeric, 2),
                'rationale',  'Drift from TAA target: ' || ROUND((current_weight - taa_target)::numeric, 2) || '%'
            ) ORDER BY ABS(current_weight - taa_target) DESC
        ) AS trades
    FROM drift_calc
)
SELECT aggregate_drift, trigger_fired, trades
FROM summary;
