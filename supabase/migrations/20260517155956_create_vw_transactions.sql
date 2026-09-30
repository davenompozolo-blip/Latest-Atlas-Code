
CREATE OR REPLACE VIEW vw_transactions AS
SELECT
    t.id,
    t.portfolio_id,
    t.transaction_date,
    t.transaction_type,
    t.quantity,
    t.price,
    t.fees,
    t.notes,
    a.symbol,
    a.name        AS asset_name,
    a.asset_class,
    a.sector,
    (t.quantity * t.price) AS notional
FROM transactions t
LEFT JOIN assets a ON a.id = t.asset_id
ORDER BY t.transaction_date DESC;
