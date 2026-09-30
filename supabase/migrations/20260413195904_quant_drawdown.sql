
CREATE OR REPLACE VIEW vw_quant_drawdown AS
WITH latest_pos AS (
    SELECT DISTINCT ON (p.asset_id) p.asset_id
    FROM positions p
    JOIN assets a ON a.id = p.asset_id
    WHERE p.quantity <> 0
      AND p.as_of_date >= (SELECT MAX(as_of_date) - 7 FROM positions)
      AND NOT (
        a.asset_class = 'option'
        AND a.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'
        AND to_date(substring(a.symbol, '(\d{6})[CP]'), 'YYMMDD') < CURRENT_DATE
      )
    ORDER BY p.asset_id, p.as_of_date DESC
),
price_with_peak AS (
    SELECT
        ph.asset_id,
        ph.price_date,
        ph.close,
        MAX(ph.close) OVER (
            PARTITION BY ph.asset_id
            ORDER BY ph.price_date
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS running_peak
    FROM price_history ph
    WHERE ph."interval" = '1d'
),
drawdown_series AS (
    SELECT
        asset_id,
        price_date,
        close,
        running_peak,
        (close / NULLIF(running_peak, 0) - 1) AS drawdown_pct
    FROM price_with_peak
),
dd_current AS (
    SELECT DISTINCT ON (asset_id)
        asset_id,
        close            AS current_price,
        running_peak     AS ath_in_window,
        drawdown_pct     AS current_drawdown_pct
    FROM drawdown_series
    ORDER BY asset_id, price_date DESC
),
dd_max AS (
    SELECT asset_id, MIN(drawdown_pct) AS max_drawdown_pct
    FROM drawdown_series
    GROUP BY asset_id
)
SELECT
    a.symbol,
    a.name,
    dc.current_price,
    ROUND(dc.ath_in_window::numeric, 4)                                          AS all_time_high,
    ROUND((dc.current_drawdown_pct * 100)::numeric, 2)                           AS current_drawdown_pct,
    ROUND((dm.max_drawdown_pct     * 100)::numeric, 2)                           AS max_drawdown_pct,
    ROUND(((dc.ath_in_window / NULLIF(dc.current_price, 0) - 1) * 100)::numeric, 2) AS recovery_needed_pct,
    CASE
        WHEN dc.current_drawdown_pct > -0.10 THEN 'Near Highs'
        WHEN dc.current_drawdown_pct > -0.20 THEN 'Moderate Drawdown'
        WHEN dc.current_drawdown_pct > -0.35 THEN 'Significant Drawdown'
        ELSE 'Deep Drawdown'
    END AS drawdown_regime
FROM latest_pos lp
JOIN  assets     a  ON a.id         = lp.asset_id
JOIN  dd_current dc ON dc.asset_id  = lp.asset_id
JOIN  dd_max     dm ON dm.asset_id  = lp.asset_id
ORDER BY dc.current_drawdown_pct ASC;
