-- ============================================================
-- Applied to production 2026-08-18.
--
-- THE DEFECT
-- The holdings views rank the ENTIRE price history of every held asset in
-- order to read two or three rows of it.
--
--   vw_portfolio_home  ranked_prices  60,043 rows scanned, rn 1 and 5 used
--   nexus_holdings     px             69,508 rows scanned, rn 1 and 2 used
--
-- Both spill to disk (external merge, ~2.5MB) and both cost linear in the
-- size of the whole table. A previous pass bounded them to HELD assets,
-- which took vw_portfolio_home from 4046ms to a ~950ms mean -- but the tail
-- did not move far enough. Measured over real traffic in pg_stat_statements:
--
--   vw_portfolio_home   303 calls   mean  944ms   max 2978ms
--   vw_nexus_holdings    50 calls   mean  600ms   max 2914ms
--   nexus_holdings       45 calls   mean  584ms   max 2901ms
--
-- against anon's 3000ms cap. They were not fixed, they were sitting ON the
-- ceiling, and every call that landed on a colder buffer cache was cancelled
-- with 57014. That is why the terminal degrades intermittently and in a
-- different place each time rather than failing honestly: every loader
-- catches the empty result and reports it as missing data, so one defect
-- surfaces as "momentum pending sync" on one tab, "funding source
-- unresolved" on another and "Feeds degraded" in the header.
--
-- THE FIX
-- A LATERAL top-N per asset. It reads exactly N rows through
-- price_history_asset_date_interval_uniq (Index Scan Backward, no sort at
-- all) instead of ranking the full series and discarding 99.5% of it.
--
-- A date bound was the obvious alternative and is WRONG here: one held
-- asset's most recent bar is 158 days old and its 5th is 162 days old, so
-- any window short enough to help would silently drop that name's price.
-- The lateral is exact regardless of how stale a name's book is.
--
-- Both rewrites were proven byte-identical against the previous definitions
-- (EXCEPT in both directions, 0 rows either side) before being applied.
-- vw_portfolio_home 272-308ms -> 149-166ms warm; nexus_holdings -> 5-19ms.
--
-- The residual cost in vw_portfolio_home is the `returns`/`stats` CTE, left
-- deliberately unbounded: mu and sigma are annualised vol and Sharpe over
-- the whole series, so bounding that window would change published numbers
-- rather than just their cost. It measures ~470ms. Revisit it as a
-- deliberate change to the statistic, not as an optimisation.
-- ============================================================

-- ------------------------------------------------------------
-- 1. vw_portfolio_home
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_portfolio_home AS
 WITH latest_pos_snapshot AS (
         SELECT DISTINCT ON (p_1.asset_id) p_1.asset_id, p_1.quantity, p_1.average_cost, p_1.market_value, p_1.as_of_date, p_1.side
           FROM positions p_1 JOIN assets a_1 ON a_1.id = p_1.asset_id
          WHERE p_1.as_of_date >= (( SELECT max(positions.as_of_date) - 2 FROM positions))
            AND NOT (a_1.asset_class = 'option'::text AND a_1.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'::text AND to_date("substring"(a_1.symbol, '(\d{6})[CP]'::text), 'YYMMDD'::text) < CURRENT_DATE)
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
  ORDER BY (abs(p.market_value)) DESC NULLS LAST;

-- ------------------------------------------------------------
-- 2 + 3. nexus_holdings -- lateral top-2, and stale moves nulled.
-- vw_funding_sleeve reads this view, which is why the Opportunities tab
-- reported "funding source: unresolved" while 24 names qualified.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.nexus_holdings AS
 WITH latest AS (
         SELECT max(positions.as_of_date) AS d FROM positions
        ), cur AS (
         SELECT p.asset_id, a.symbol, a.name, p.market_value
           FROM positions p JOIN assets a ON a.id = p.asset_id
          WHERE p.as_of_date = (( SELECT latest.d FROM latest)) AND p.market_value > 0::numeric
        ), tot AS (
         SELECT sum(cur_1.market_value) AS tmv FROM cur cur_1
        ), varbase AS (
         SELECT sum(insight_counter_specific_var_vs_sector.stock_var_95) AS sv FROM insight_counter_specific_var_vs_sector
        ), px2 AS (
         -- Was: rank every bar of every held name (69,508 rows, external
         -- merge to disk) to read rn 1 and rn 2, plus
         -- max(price_date) OVER (PARTITION BY asset_id) -- which is by
         -- definition rn 1's own date, so the top-2 lateral supplies it too.
         SELECT cur_2.asset_id,
            max(CASE WHEN t.rn = 1 THEN t.close ELSE NULL::numeric END) AS last_close,
            max(CASE WHEN t.rn = 2 THEN t.close ELSE NULL::numeric END) AS prev_close,
            max(t.price_date) AS last_date
           FROM cur cur_2
           CROSS JOIN LATERAL (
                SELECT ph.close, ph.price_date,
                       row_number() OVER (ORDER BY ph.price_date DESC) AS rn
                  FROM price_history ph
                 WHERE ph.asset_id = cur_2.asset_id AND ph."interval" = '1d'::text
                 ORDER BY ph.price_date DESC
                 LIMIT 2
           ) t
          GROUP BY cur_2.asset_id
        ), conv AS (
         SELECT DISTINCT ON (decisions.symbol) decisions.symbol, decisions.conviction FROM decisions ORDER BY decisions.symbol, decisions.seq DESC
        ), latest_run AS (
         SELECT scrapbook_snapshots.company_id, max(scrapbook_snapshots.run_date) AS rd FROM scrapbook_snapshots GROUP BY scrapbook_snapshots.company_id
        ), disp AS (
         SELECT s.company_id,
            count(DISTINCT s.method) FILTER (WHERE s.implied_price > 0::numeric) AS n_methods,
            min(s.implied_price) FILTER (WHERE s.implied_price > 0::numeric) AS lo,
            max(s.implied_price) FILTER (WHERE s.implied_price > 0::numeric) AS hi,
            avg(s.implied_price) FILTER (WHERE s.implied_price > 0::numeric) AS mean_px
           FROM scrapbook_snapshots s JOIN latest_run lr ON lr.company_id = s.company_id AND lr.rd = s.run_date
          GROUP BY s.company_id
        ), fv AS (
         SELECT c_1.ticker, c_1.avg_fair_value, c_1.last_run_at::date AS run_date,
            COALESCE(d.n_methods, 0::bigint) AS n_methods,
            CASE WHEN d.mean_px > 0::numeric THEN (d.hi - d.lo) / d.mean_px ELSE NULL::numeric END AS band_frac
           FROM scrapbook_companies c_1 LEFT JOIN disp d ON d.company_id = c_1.id
          WHERE c_1.avg_fair_value IS NOT NULL AND c_1.avg_fair_value > 0::numeric
        ), mv AS (
         -- One place decides whether this name has a publishable move, so
         -- today_pct and contrib_pct can never disagree about it.
         SELECT px2.asset_id, px2.last_close, px2.prev_close, px2.last_date,
                (CURRENT_DATE - px2.last_date) AS days_old,
                (px2.prev_close > 0::numeric AND (CURRENT_DATE - px2.last_date) <= 7) AS move_publishable
           FROM px2
        )
 SELECT cur.symbol AS tk,
    COALESCE(pt.theme, 'Unmapped'::text) AS theme,
    COALESCE(c.conviction, 49) AS conviction,
    c.conviction IS NOT NULL AS pcm_rated,
    round(cur.market_value / NULLIF(t.tmv, 0::numeric) * 100::numeric, 2) AS weight_pct,
    CASE WHEN mv.move_publishable THEN round((mv.last_close / mv.prev_close - 1::numeric) * 100::numeric, 2) ELSE NULL::numeric END AS today_pct,
    CASE WHEN mv.move_publishable THEN round((mv.last_close / mv.prev_close - 1::numeric) * (cur.market_value / NULLIF(t.tmv, 0::numeric)) * 100::numeric, 3) ELSE NULL::numeric END AS contrib_pct,
    round(COALESCE(v.stock_var_95, 0::numeric) / NULLIF(vb.sv, 0::numeric) * 100::numeric, 1) AS component_var,
    CASE WHEN fv.avg_fair_value IS NOT NULL AND mv.last_close > 0::numeric THEN round((fv.avg_fair_value / mv.last_close - 1::numeric) * 100::numeric, 1) ELSE NULL::numeric END AS fv_gap_pct,
    NULL::text AS signal,
    'neutral'::text AS signal_tone,
    COALESCE(mv.days_old > 4, true) AS stale,
    fv.avg_fair_value IS NOT NULL AND mv.last_close > 0::numeric AND (CURRENT_DATE - fv.run_date) <= 14 AND fv.n_methods >= 2 AND fv.band_frac <= 0.40 AS fv_trustworthy,
    CASE
        WHEN fv.avg_fair_value IS NULL OR mv.last_close IS NULL OR mv.last_close <= 0::numeric THEN 'no valuation on file'::text
        WHEN (CURRENT_DATE - fv.run_date) > 14 THEN ('valuation '::text || ((CURRENT_DATE - fv.run_date)::text)) || 'd stale'::text
        WHEN fv.n_methods < 2 THEN 'single method only'::text
        WHEN fv.band_frac > 0.40 THEN ('methods disagree '::text || round(fv.band_frac * 100::numeric)::text) || '%'::text
        ELSE NULL::text
    END AS fv_untrust_reason,
    mv.days_old AS price_days_old
   FROM cur
     CROSS JOIN tot t
     CROSS JOIN varbase vb
     LEFT JOIN position_themes pt ON pt.symbol = cur.symbol
     LEFT JOIN conv c ON c.symbol = cur.symbol
     LEFT JOIN mv ON mv.asset_id = cur.asset_id
     LEFT JOIN fv ON fv.ticker = cur.symbol
     LEFT JOIN insight_counter_specific_var_vs_sector v ON v.symbol = cur.symbol
  ORDER BY cur.market_value DESC;
