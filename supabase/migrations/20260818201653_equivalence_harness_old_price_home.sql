create schema if not exists _prelateral;
-- The ORIGINAL definition, verbatim, under a different name so both can be
-- evaluated against the same snapshot of positions/price_history.
create or replace view _prelateral.pfh_old as
 WITH latest_pos_snapshot AS (
         SELECT DISTINCT ON (p_1.asset_id) p_1.asset_id, p_1.quantity, p_1.average_cost, p_1.market_value, p_1.as_of_date, p_1.side
           FROM positions p_1 JOIN assets a_1 ON a_1.id = p_1.asset_id
          WHERE p_1.as_of_date >= (( SELECT max(positions.as_of_date) - 2 FROM positions))
            AND NOT (a_1.asset_class = 'option'::text AND a_1.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'::text AND to_date("substring"(a_1.symbol, '(\d{6})[CP]'::text), 'YYMMDD'::text) < CURRENT_DATE)
          ORDER BY p_1.asset_id, p_1.as_of_date DESC
        ), latest_pos AS (
         SELECT * FROM latest_pos_snapshot
          WHERE quantity IS NOT NULL AND quantity <> 0::numeric AND (market_value IS NULL OR abs(market_value) > 0.01)
        ), ranked_prices AS (
         SELECT price_history.asset_id, price_history.close, price_history.price_date,
            row_number() OVER (PARTITION BY price_history.asset_id ORDER BY price_history.price_date DESC) AS rn
           FROM price_history
          WHERE price_history."interval" = '1d'::text AND (price_history.asset_id IN ( SELECT latest_pos.asset_id FROM latest_pos))
        ), latest_prices AS (
         SELECT lp_1.asset_id,
            COALESCE(CASE WHEN abs(lp_1.quantity) > 0::numeric THEN abs(lp_1.market_value) / abs(lp_1.quantity) ELSE NULL::numeric END, rp.close) AS current_price,
            COALESCE(lp_1.as_of_date, rp.price_date) AS price_date
           FROM latest_pos lp_1 LEFT JOIN ranked_prices rp ON rp.asset_id = lp_1.asset_id AND rp.rn = 1
        ), prev_day_prices AS ( SELECT asset_id, close AS prev_close FROM ranked_prices WHERE rn = 1
        ), five_day_prices AS ( SELECT asset_id, close AS close_5d FROM ranked_prices WHERE rn = 5
        ), latest_account AS (
         SELECT DISTINCT ON (account_snapshots.portfolio_id) account_snapshots.portfolio_id, account_snapshots.equity, account_snapshots.cash, account_snapshots.buying_power, account_snapshots.long_market_value, account_snapshots.short_market_value
           FROM account_snapshots ORDER BY account_snapshots.portfolio_id, account_snapshots.as_of DESC
        ), returns AS (
         SELECT ph.asset_id,
            (ph.close - lag(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date)) / NULLIF(lag(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date), 0::numeric) AS daily_return
           FROM price_history ph
          WHERE ph."interval" = '1d'::text AND (ph.asset_id IN ( SELECT latest_pos.asset_id FROM latest_pos))
        ), stats AS (
         SELECT asset_id, count(*) AS trading_days, avg(daily_return) AS mu, stddev(daily_return) AS sigma
           FROM returns WHERE daily_return IS NOT NULL GROUP BY asset_id
        ), nav AS (
         SELECT COALESCE(( SELECT equity FROM latest_account LIMIT 1), ( SELECT sum(market_value) FROM latest_pos)) AS total_nav,
            ( SELECT cash FROM latest_account LIMIT 1) AS cash_balance,
            ( SELECT buying_power FROM latest_account LIMIT 1) AS buying_power,
            ( SELECT long_market_value FROM latest_account LIMIT 1) AS long_mv,
            ( SELECT short_market_value FROM latest_account LIMIT 1) AS short_mv
        ), hhi AS (
         SELECT sum(power(abs(p_1.market_value) / NULLIF(( SELECT nav_1.total_nav FROM nav nav_1), 0::numeric), 2::numeric)) AS hhi_score, count(*) AS n_positions FROM latest_pos p_1
        )
 SELECT a.symbol, a.name, a.asset_class, a.sector, p.side,
    CASE WHEN p.side = 'short'::text THEN - abs(p.quantity) ELSE p.quantity END AS quantity,
    p.average_cost AS cost_basis, lp.current_price, p.market_value,
    CASE WHEN pdp.prev_close IS NOT NULL AND pdp.prev_close > 0::numeric THEN (lp.current_price - pdp.prev_close) / pdp.prev_close ELSE NULL::numeric END AS daily_change_pct,
    CASE WHEN fdp.close_5d IS NOT NULL AND fdp.close_5d > 0::numeric THEN (lp.current_price - fdp.close_5d) / fdp.close_5d ELSE NULL::numeric END AS return_5d_pct,
    CASE WHEN p.side = 'short'::text THEN (p.average_cost - lp.current_price) * abs(p.quantity) ELSE (lp.current_price - p.average_cost) * abs(p.quantity) END AS total_gain_loss_dollar,
    abs(p.market_value) / NULLIF(nav.total_nav, 0::numeric) AS weight_equity_pct,
    abs(p.market_value) / NULLIF(COALESCE(nav.long_mv, 0::numeric) + abs(COALESCE(nav.short_mv, 0::numeric)), 0::numeric) AS weight_gross_pct,
    GREATEST(0::numeric, LEAST(100::numeric, round(30.0 * LEAST(1.0, GREATEST(0.0, COALESCE(s.mu / NULLIF(s.sigma, 0::numeric) * sqrt(252.0), 0.0) / 2.0)) + 20.0 * GREATEST(0.0, 1.0 - LEAST(1.0, COALESCE(s.sigma * sqrt(252.0), 0.5) / 0.5)) + 30.0 * LEAST(1.0, GREATEST(0.0, (COALESCE(CASE WHEN p.side = 'short'::text THEN (p.average_cost - lp.current_price) / NULLIF(p.average_cost, 0::numeric) ELSE (lp.current_price - p.average_cost) / NULLIF(p.average_cost, 0::numeric) END, 0.0) + 0.10) / 0.30)) + CASE WHEN (abs(p.market_value) / NULLIF(nav.total_nav, 0::numeric)) > 0.10 THEN 6.0 ELSE 20.0 END))) AS quality_score,
    CASE WHEN p.side = 'short'::text THEN (p.average_cost - lp.current_price) / NULLIF(p.average_cost, 0::numeric) ELSE (lp.current_price - p.average_cost) / NULLIF(p.average_cost, 0::numeric) END AS unrealised_return_pct,
    abs(p.market_value) / NULLIF(nav.total_nav, 0::numeric) AS portfolio_weight,
    s.sigma::double precision * sqrt(252::double precision) AS annualised_vol,
    (s.mu / NULLIF(s.sigma, 0::numeric))::double precision * sqrt(252::double precision) AS sharpe_approx,
    h.hhi_score, h.n_positions,
    CASE WHEN (abs(p.market_value) / NULLIF(nav.total_nav, 0::numeric)) > 0.10 THEN true ELSE false END AS is_concentrated,
    lp.price_date, nav.total_nav AS portfolio_nav, nav.cash_balance, nav.buying_power,
    nav.long_mv AS long_market_value, nav.short_mv AS short_market_value
   FROM latest_pos p
     JOIN assets a ON a.id = p.asset_id
     LEFT JOIN latest_prices lp ON lp.asset_id = p.asset_id
     LEFT JOIN prev_day_prices pdp ON pdp.asset_id = p.asset_id
     LEFT JOIN five_day_prices fdp ON fdp.asset_id = p.asset_id
     LEFT JOIN stats s ON s.asset_id = p.asset_id
     CROSS JOIN nav CROSS JOIN hhi h
  ORDER BY (abs(p.market_value)) DESC NULLS LAST;
