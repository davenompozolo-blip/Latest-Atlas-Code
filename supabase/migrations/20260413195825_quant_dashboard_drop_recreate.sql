
DROP VIEW IF EXISTS vw_quant_dashboard;

CREATE VIEW vw_quant_dashboard AS
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
ranked_prices AS (
    SELECT
        ph.asset_id,
        ph.price_date,
        ph.open,
        ph.high,
        ph.low,
        ph.close,
        LAG(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date) AS prev_close,
        ROW_NUMBER() OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date DESC) AS rn,
        COUNT(*) OVER (PARTITION BY ph.asset_id) AS total_days
    FROM price_history ph
    WHERE ph."interval" = '1d'
),
ma_calc AS (
    SELECT
        asset_id,
        total_days,
        MAX(close)    FILTER (WHERE rn = 1)   AS current_price,
        AVG(close)    FILTER (WHERE rn <= 20)  AS ma_20,
        AVG(close)    FILTER (WHERE rn <= 50)  AS ma_50,
        AVG(close)    FILTER (WHERE rn <= 200) AS ma_200,
        MAX(close)    FILTER (WHERE rn <= 20)  AS high_20,
        MIN(close)    FILTER (WHERE rn <= 20)  AS low_20,
        STDDEV(close) FILTER (WHERE rn <= 20)  AS stddev_20,
        MAX(close)    FILTER (WHERE rn <= 252) AS high_52w,
        MIN(close)    FILTER (WHERE rn <= 252) AS low_52w
    FROM ranked_prices
    GROUP BY asset_id, total_days
),
returns AS (
    SELECT
        ph.asset_id,
        ph.price_date,
        (ph.close - LAG(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date))
          / NULLIF(LAG(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date), 0) AS r
    FROM price_history ph
    WHERE ph."interval" = '1d'
),
vol_stats AS (
    SELECT
        asset_id,
        STDDEV(r) FILTER (WHERE price_date >= CURRENT_DATE - 20) AS vol_20d,
        STDDEV(r) FILTER (WHERE price_date >= CURRENT_DATE - 60) AS vol_60d
    FROM returns
    WHERE r IS NOT NULL
    GROUP BY asset_id
),
rsi_base AS (
    SELECT
        asset_id,
        AVG(GREATEST(close - prev_close, 0)) AS avg_gain,
        AVG(GREATEST(prev_close - close, 0)) AS avg_loss
    FROM ranked_prices
    WHERE prev_close IS NOT NULL AND rn <= 15
    GROUP BY asset_id
),
atr_base AS (
    SELECT
        asset_id,
        AVG(GREATEST(
            high - low,
            ABS(high - COALESCE(prev_close, close)),
            ABS(low  - COALESCE(prev_close, close))
        )) AS atr_14
    FROM ranked_prices
    WHERE rn <= 14 AND high IS NOT NULL AND low IS NOT NULL
    GROUP BY asset_id
)
SELECT
    a.symbol,
    a.name,
    mc.current_price,
    -- Original columns preserved in order
    ROUND(mc.ma_20::numeric,  4) AS ma_20,
    ROUND(mc.ma_50::numeric,  4) AS ma_50,
    ROUND(mc.ma_200::numeric, 4) AS ma_200,
    CASE
        WHEN mc.current_price > mc.ma_50 AND mc.ma_50 > mc.ma_200 THEN 'Uptrend'
        WHEN mc.current_price < mc.ma_50 AND mc.ma_50 < mc.ma_200 THEN 'Downtrend'
        ELSE 'Sideways'
    END AS price_regime,
    CASE
        WHEN vs.vol_20d > vs.vol_60d THEN 'Expanding'
        WHEN vs.vol_20d < vs.vol_60d THEN 'Compressing'
        ELSE 'Stable'
    END AS vol_regime,
    ROUND(((mc.current_price - mc.ma_20) / NULLIF(mc.stddev_20, 0))::numeric, 2) AS zscore_20d,
    CASE
        WHEN ((mc.current_price - mc.ma_20) / NULLIF(mc.stddev_20, 0)) >  2 THEN 'Overbought'
        WHEN ((mc.current_price - mc.ma_20) / NULLIF(mc.stddev_20, 0)) < -2 THEN 'Oversold'
        ELSE 'Neutral'
    END AS mean_reversion_signal,
    ROUND(((mc.current_price - mc.low_20) / NULLIF(mc.high_20 - mc.low_20, 0) * 100)::numeric, 1) AS momentum_pct_rank_20d,
    (vs.vol_20d::double precision * SQRT(252)) AS annualised_vol_20d,
    (vs.vol_60d::double precision * SQRT(252)) AS annualised_vol_60d,
    mc.total_days AS trading_days_available,
    -- New columns appended
    ROUND(mc.high_52w::numeric, 4) AS high_52w,
    ROUND(mc.low_52w::numeric,  4) AS low_52w,
    ROUND(((mc.current_price - mc.low_52w) / NULLIF(mc.high_52w - mc.low_52w, 0) * 100)::numeric, 1) AS pct_52w_range,
    CASE
        WHEN r.avg_loss IS NULL OR r.avg_loss = 0 THEN 100.0::numeric
        ELSE ROUND((100 - 100.0 / (1 + r.avg_gain / NULLIF(r.avg_loss, 0)))::numeric, 1)
    END AS rsi_14,
    ROUND(atr.atr_14::numeric, 4) AS atr_14,
    ROUND((4 * mc.stddev_20 / NULLIF(mc.ma_20, 0) * 100)::numeric, 2) AS bb_width_pct
FROM latest_pos lp
JOIN  assets    a   ON a.id         = lp.asset_id
JOIN  ma_calc   mc  ON mc.asset_id  = lp.asset_id
LEFT JOIN vol_stats vs  ON vs.asset_id  = lp.asset_id
LEFT JOIN rsi_base  r   ON r.asset_id   = lp.asset_id
LEFT JOIN atr_base  atr ON atr.asset_id = lp.asset_id
ORDER BY mc.current_price / NULLIF(mc.ma_50, 0) DESC NULLS LAST;
