
CREATE OR REPLACE VIEW vw_quant_rolling_returns AS
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
        ph.close,
        ROW_NUMBER() OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date DESC) AS rn
    FROM price_history ph
    WHERE ph."interval" = '1d'
),
price_pivots AS (
    SELECT
        asset_id,
        MAX(close) FILTER (WHERE rn = 1)   AS p_now,
        MAX(close) FILTER (WHERE rn = 2)   AS p_1d,
        MAX(close) FILTER (WHERE rn = 5)   AS p_1w,
        MAX(close) FILTER (WHERE rn = 21)  AS p_1m,
        MAX(close) FILTER (WHERE rn = 63)  AS p_3m,
        MAX(close) FILTER (WHERE rn = 126) AS p_6m,
        MAX(close) FILTER (WHERE rn = 252) AS p_1y
    FROM ranked_prices
    GROUP BY asset_id
),
ytd_prices AS (
    SELECT DISTINCT ON (ph.asset_id)
        ph.asset_id,
        ph.close AS p_ytd
    FROM price_history ph
    WHERE ph."interval" = '1d'
      AND ph.price_date >= DATE_TRUNC('year', CURRENT_DATE)::date
    ORDER BY ph.asset_id, ph.price_date ASC
)
SELECT
    a.symbol,
    a.name,
    pp.p_now AS current_price,
    ROUND(((pp.p_now - pp.p_1d)  / NULLIF(pp.p_1d,  0) * 100)::numeric, 2) AS return_1d_pct,
    ROUND(((pp.p_now - pp.p_1w)  / NULLIF(pp.p_1w,  0) * 100)::numeric, 2) AS return_1w_pct,
    ROUND(((pp.p_now - pp.p_1m)  / NULLIF(pp.p_1m,  0) * 100)::numeric, 2) AS return_1m_pct,
    ROUND(((pp.p_now - pp.p_3m)  / NULLIF(pp.p_3m,  0) * 100)::numeric, 2) AS return_3m_pct,
    ROUND(((pp.p_now - pp.p_6m)  / NULLIF(pp.p_6m,  0) * 100)::numeric, 2) AS return_6m_pct,
    ROUND(((pp.p_now - pp.p_1y)  / NULLIF(pp.p_1y,  0) * 100)::numeric, 2) AS return_1y_pct,
    ROUND(((pp.p_now - yp.p_ytd) / NULLIF(yp.p_ytd, 0) * 100)::numeric, 2) AS return_ytd_pct
FROM latest_pos lp
JOIN  assets       a  ON a.id         = lp.asset_id
JOIN  price_pivots pp ON pp.asset_id  = lp.asset_id
LEFT JOIN ytd_prices yp ON yp.asset_id = lp.asset_id
ORDER BY return_1m_pct DESC NULLS LAST;
