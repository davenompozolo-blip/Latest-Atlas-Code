-- vw_portfolio_home publishes names the book no longer holds.
--
-- Reported from the terminal: KMTUY, liquidated 2026-09-14, was still on the
-- holdings table on 2026-09-15 at 0.1% of book -- publishing a weight, a
-- conviction score and a +6.3% move.
--
-- Same defect as B4's defect 1 in vw_risk_analysis, one view along, and a
-- little worse. `latest_pos_snapshot` was
--
--     SELECT DISTINCT ON (asset_id) ... FROM positions
--      WHERE as_of_date >= (SELECT max(as_of_date) - 2 FROM positions)
--      ORDER BY asset_id, as_of_date DESC
--
-- The latest row PER ASSET over a THREE-DAY window, not the latest snapshot.
-- So a name sold on any of the last three sessions keeps its final row at its
-- last market value, and drops off by ageing out rather than by being sold.
-- That is why it reads as an intermittent phantom: KMTUY would have vanished
-- on its own on 2026-09-17 and nothing would have been learned.
--
-- The blast radius is not one page. mv_nexus_holdings reads this view, and
-- vw_nexus_holdings reads that matview, so the Nexus flagship, the Theme cut
-- and the bench docket were all serving the same phantom row.
--
-- Sourced from vw_positions_current rather than from a max(as_of_date) filter,
-- for the reason that view exists: it reconciles each row's updated_at against
-- the account-snapshot watermark, so it is correct INTRADAY. A snapshot-date
-- filter is not -- positions is upsert-only, so today's rows are the union of
-- everything held at any point today until midnight rolls the date.
--
-- Measured before applying: exactly one row changes. 63 -> 62, KMTUY dropped,
-- nothing added, no other symbol moves. The three held names still absent
-- (FIDU, TGT, HMY) are sub-cent fractional dust -- 0.002 to 0.004 dollars --
-- excluded by the view's own one-cent floor, which this change does not touch.
--
-- Everything below the first CTE is the 20260818210000 definition verbatim,
-- including the LATERAL top-N price bound and the deliberately unbounded
-- returns/stats CTE. Re-dumped from the repo and diffed, not retyped.
--
-- NOT FIXED HERE, and now the only remaining half of the report: the move
-- itself. vw_nexus_holdings.daily_return_pct is computed against the last
-- stored bar with no staleness gate, so KMTUY published +6.3% off a print
-- 179 days old -- the rule nexus_holdings.today_pct already enforces at 7
-- days. With KMTUY out of the book no held name is stale (worst is 1 day), so
-- the gate is dormant today rather than wrong. It needs price_days_old
-- plumbed through vw_portfolio_home -> mv_nexus_holdings -> vw_nexus_holdings,
-- which is a matview rebuild, and it is its own change.

CREATE OR REPLACE VIEW public.vw_portfolio_home AS
 WITH latest_pos_snapshot AS (
         SELECT DISTINCT ON (p_1.asset_id) p_1.asset_id, p_1.quantity, p_1.average_cost, p_1.market_value, p_1.as_of_date, p_1.side
           FROM vw_positions_current p_1 JOIN assets a_1 ON a_1.id = p_1.asset_id
          WHERE NOT (a_1.asset_class = 'option'::text AND a_1.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'::text AND to_date("substring"(a_1.symbol, '(\d{6})[CP]'::text), 'YYMMDD'::text) < CURRENT_DATE)
          ORDER BY p_1.asset_id, p_1.as_of_date DESC
        ), latest_pos AS (
         SELECT latest_pos_snapshot.asset_id, latest_pos_snapshot.quantity, latest_pos_snapshot.average_cost, latest_pos_snapshot.market_value, latest_pos_snapshot.as_of_date, latest_pos_snapshot.side
           FROM latest_pos_snapshot
          WHERE latest_pos_snapshot.quantity IS NOT NULL AND latest_pos_snapshot.quantity <> 0::numeric AND (latest_pos_snapshot.market_value IS NULL OR abs(latest_pos_snapshot.market_value) > 0.01)
        ), ranked_prices AS (
         -- Only rn 1 and rn 5 are consumed below, so five bars per asset is
         -- the whole requirement. LIMIT 5 inside the lateral turns this from
         -- a 60k-row sort into 5 index rows per held name.
         SELECT lp0.asset_id, t.close, t.price_date, t.rn
           FROM latest_pos lp0
           CROSS JOIN LATERAL (
                SELECT ph.close, ph.price_date,
                       row_number() OVER (ORDER BY ph.price_date DESC) AS rn
                  FROM price_history ph
                 WHERE ph.asset_id = lp0.asset_id AND ph."interval" = '1d'::text
                 ORDER BY ph.price_date DESC
                 LIMIT 5
           ) t
        ), latest_prices AS (
         SELECT lp_1.asset_id,
            COALESCE(CASE WHEN abs(lp_1.quantity) > 0::numeric THEN abs(lp_1.market_value) / abs(lp_1.quantity) ELSE NULL::numeric END, rp.close) AS current_price,
            COALESCE(lp_1.as_of_date, rp.price_date) AS price_date
           FROM latest_pos lp_1
             LEFT JOIN ranked_prices rp ON rp.asset_id = lp_1.asset_id AND rp.rn = 1
        ), prev_day_prices AS (
         SELECT ranked_prices.asset_id, ranked_prices.close AS prev_close FROM ranked_prices WHERE ranked_prices.rn = 1
        ), five_day_prices AS (
         SELECT ranked_prices.asset_id, ranked_prices.close AS close_5d FROM ranked_prices WHERE ranked_prices.rn = 5
        ), latest_account AS (
         SELECT DISTINCT ON (account_snapshots.portfolio_id) account_snapshots.portfolio_id, account_snapshots.equity, account_snapshots.cash, account_snapshots.buying_power, account_snapshots.long_market_value, account_snapshots.short_market_value
           FROM account_snapshots
          ORDER BY account_snapshots.portfolio_id, account_snapshots.as_of DESC
        ), returns AS (
         -- Left as a full-history scan on purpose: mu and sigma below are
         -- annualised vol and Sharpe over the whole series, so bounding the
         -- window here would change published numbers, not just their cost.
         SELECT ph.asset_id,
            (ph.close - lag(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date)) / NULLIF(lag(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date), 0::numeric) AS daily_return
           FROM price_history ph
          WHERE ph."interval" = '1d'::text AND (ph.asset_id IN ( SELECT latest_pos.asset_id FROM latest_pos))
        ), stats AS (
         SELECT returns.asset_id, count(*) AS trading_days, avg(returns.daily_return) AS mu, stddev(returns.daily_return) AS sigma
           FROM returns WHERE returns.daily_return IS NOT NULL GROUP BY returns.asset_id
        ), nav AS (
         SELECT COALESCE(( SELECT latest_account.equity FROM latest_account LIMIT 1), ( SELECT sum(latest_pos.market_value) AS sum FROM latest_pos)) AS total_nav,
            ( SELECT latest_account.cash FROM latest_account LIMIT 1) AS cash_balance,
            ( SELECT latest_account.buying_power FROM latest_account LIMIT 1) AS buying_power,
            ( SELECT latest_account.long_market_value FROM latest_account LIMIT 1) AS long_mv,
            ( SELECT latest_account.short_market_value FROM latest_account LIMIT 1) AS short_mv
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
     CROSS JOIN nav
     CROSS JOIN hhi h
  ORDER BY (abs(p.market_value)) DESC NULLS LAST
