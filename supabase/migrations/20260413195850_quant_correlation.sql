
CREATE OR REPLACE VIEW vw_quant_correlation AS
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
returns AS (
    SELECT
        ph.asset_id,
        ph.price_date,
        (ph.close - LAG(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date))
          / NULLIF(LAG(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date), 0) AS r
    FROM price_history ph
    WHERE ph."interval" = '1d'
      AND ph.price_date >= CURRENT_DATE - INTERVAL '252 days'
),
portfolio_returns AS (
    SELECT r.*
    FROM returns r
    INNER JOIN latest_pos lp ON lp.asset_id = r.asset_id
    WHERE r.r IS NOT NULL
)
SELECT
    a1.symbol                               AS symbol_1,
    a2.symbol                               AS symbol_2,
    ROUND(CORR(r1.r, r2.r)::numeric, 3)    AS correlation,
    COUNT(*)::integer                       AS common_days
FROM portfolio_returns r1
JOIN portfolio_returns r2
    ON  r1.price_date = r2.price_date
    AND r1.asset_id   < r2.asset_id
JOIN assets a1 ON a1.id = r1.asset_id
JOIN assets a2 ON a2.id = r2.asset_id
GROUP BY a1.symbol, a2.symbol
HAVING COUNT(*) >= 20
ORDER BY ABS(CORR(r1.r, r2.r)) DESC NULLS LAST;
