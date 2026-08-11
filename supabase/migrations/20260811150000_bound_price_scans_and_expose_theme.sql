-- Stop the holdings views from ranking the entire price book, and give the
-- Nexus feed a real theme.
--
-- ── Why the feeds went dark ───────────────────────────────────────────────────
-- Four views rank or lag over ALL of price_history to serve ~54 held rows:
--
--   vw_portfolio_home        4046 ms   481k rows scanned, 54 used
--   vw_quant_dashboard       2721 ms   481k rows scanned, 61 used
--   nexus_holdings           1057 ms   481k rows scanned, 61 used
--   vw_quant_rolling_returns  493 ms   454k rows scanned, 61 used
--
-- That was survivable while price_history held ~84k rows. The Trade universe
-- backfill took it to 481k, and the cost of these views is linear in the size
-- of the whole table, so they all grew ~5.7x at a stroke. `anon` — the role the
-- terminal reads on — is capped at 3s. vw_portfolio_home now exceeds it every
-- time, and vw_nexus_holdings (which reads it) sits right on the line.
--
-- The UI never says "timed out". Every loader catches the error and falls back:
-- loadHoldingRows() returns null, the model drops to the structural baseline,
-- and the page reports "Feeds degraded", "The bench cannot sit — holdings feed
-- unavailable", "No sector P&L for this period yet". Those messages describe
-- missing data. The data was there; the query was being cancelled.
--
-- ── The fix ──────────────────────────────────────────────────────────────────
-- Push the held-asset filter down into the price CTEs. Every one of these views
-- already computes `latest_pos` before it touches price_history, and then throws
-- away 99.99% of what it ranked. Filtering first is a pure pushdown: for a held
-- asset the window still sees that asset's complete history in the same order,
-- so every output value is byte-identical. Only the discarded work goes away.
--
-- This is not a new pattern — vw_screener already does exactly this, joining
-- latest_pos into its price CTE, and it reads 67k rows instead of 481k.
--
-- The one behaviour change is in nexus_holdings, called out below.

-- ── vw_portfolio_home ────────────────────────────────────────────────────────
create or replace view public.vw_portfolio_home as
 WITH latest_pos_snapshot AS (
         SELECT DISTINCT ON (p_1.asset_id) p_1.asset_id,
            p_1.quantity, p_1.average_cost, p_1.market_value, p_1.as_of_date, p_1.side
           FROM positions p_1
             JOIN assets a_1 ON a_1.id = p_1.asset_id
          WHERE p_1.as_of_date >= (( SELECT max(positions.as_of_date) - 2 FROM positions))
            AND NOT (a_1.asset_class = 'option'::text
                     AND a_1.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'::text
                     AND to_date("substring"(a_1.symbol, '(\d{6})[CP]'::text), 'YYMMDD'::text) < CURRENT_DATE)
          ORDER BY p_1.asset_id, p_1.as_of_date DESC
        ), latest_pos AS (
         SELECT latest_pos_snapshot.asset_id, latest_pos_snapshot.quantity,
            latest_pos_snapshot.average_cost, latest_pos_snapshot.market_value,
            latest_pos_snapshot.as_of_date, latest_pos_snapshot.side
           FROM latest_pos_snapshot
          WHERE latest_pos_snapshot.quantity IS NOT NULL
            AND latest_pos_snapshot.quantity <> 0::numeric
            AND (latest_pos_snapshot.market_value IS NULL OR abs(latest_pos_snapshot.market_value) > 0.01)
        ), ranked_prices AS (
         SELECT price_history.asset_id, price_history.close, price_history.price_date,
            row_number() OVER (PARTITION BY price_history.asset_id ORDER BY price_history.price_date DESC) AS rn
           FROM price_history
          WHERE price_history."interval" = '1d'::text
            -- Held names only. rn is per-asset, so restricting the set of assets
            -- cannot change any surviving asset's ranking.
            AND price_history.asset_id IN (SELECT latest_pos.asset_id FROM latest_pos)
        ), latest_prices AS (
         SELECT lp_1.asset_id,
            COALESCE(
                CASE WHEN abs(lp_1.quantity) > 0::numeric THEN abs(lp_1.market_value) / abs(lp_1.quantity)
                     ELSE NULL::numeric END, rp.close) AS current_price,
            COALESCE(lp_1.as_of_date, rp.price_date) AS price_date
           FROM latest_pos lp_1
             LEFT JOIN ranked_prices rp ON rp.asset_id = lp_1.asset_id AND rp.rn = 1
        ), prev_day_prices AS (
         SELECT ranked_prices.asset_id, ranked_prices.close AS prev_close
           FROM ranked_prices WHERE ranked_prices.rn = 1
        ), five_day_prices AS (
         SELECT ranked_prices.asset_id, ranked_prices.close AS close_5d
           FROM ranked_prices WHERE ranked_prices.rn = 5
        ), latest_account AS (
         SELECT DISTINCT ON (account_snapshots.portfolio_id) account_snapshots.portfolio_id,
            account_snapshots.equity, account_snapshots.cash, account_snapshots.buying_power,
            account_snapshots.long_market_value, account_snapshots.short_market_value
           FROM account_snapshots
          ORDER BY account_snapshots.portfolio_id, account_snapshots.as_of DESC
        ), returns AS (
         SELECT ph.asset_id,
            (ph.close - lag(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date))
              / NULLIF(lag(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date), 0::numeric) AS daily_return
           FROM price_history ph
          WHERE ph."interval" = '1d'::text
            -- stats below aggregates per asset_id and is joined only to held
            -- names, so the other ~1,470 assets were computed and discarded.
            AND ph.asset_id IN (SELECT latest_pos.asset_id FROM latest_pos)
        ), stats AS (
         SELECT returns.asset_id, count(*) AS trading_days,
            avg(returns.daily_return) AS mu, stddev(returns.daily_return) AS sigma
           FROM returns WHERE returns.daily_return IS NOT NULL
          GROUP BY returns.asset_id
        ), nav AS (
         SELECT COALESCE(( SELECT latest_account.equity FROM latest_account LIMIT 1),
                         ( SELECT sum(latest_pos.market_value) AS sum FROM latest_pos)) AS total_nav,
            ( SELECT latest_account.cash FROM latest_account LIMIT 1) AS cash_balance,
            ( SELECT latest_account.buying_power FROM latest_account LIMIT 1) AS buying_power,
            ( SELECT latest_account.long_market_value FROM latest_account LIMIT 1) AS long_mv,
            ( SELECT latest_account.short_market_value FROM latest_account LIMIT 1) AS short_mv
        ), hhi AS (
         SELECT sum(power(abs(p_1.market_value) / NULLIF(( SELECT nav_1.total_nav FROM nav nav_1), 0::numeric), 2::numeric)) AS hhi_score,
            count(*) AS n_positions
           FROM latest_pos p_1
        )
 SELECT a.symbol, a.name, a.asset_class, a.sector, p.side,
        CASE WHEN p.side = 'short'::text THEN - abs(p.quantity) ELSE p.quantity END AS quantity,
    p.average_cost AS cost_basis,
    lp.current_price,
    p.market_value,
        CASE WHEN pdp.prev_close IS NOT NULL AND pdp.prev_close > 0::numeric
             THEN (lp.current_price - pdp.prev_close) / pdp.prev_close ELSE NULL::numeric END AS daily_change_pct,
        CASE WHEN fdp.close_5d IS NOT NULL AND fdp.close_5d > 0::numeric
             THEN (lp.current_price - fdp.close_5d) / fdp.close_5d ELSE NULL::numeric END AS return_5d_pct,
        CASE WHEN p.side = 'short'::text THEN (p.average_cost - lp.current_price) * abs(p.quantity)
             ELSE (lp.current_price - p.average_cost) * abs(p.quantity) END AS total_gain_loss_dollar,
    abs(p.market_value) / NULLIF(nav.total_nav, 0::numeric) AS weight_equity_pct,
    abs(p.market_value) / NULLIF(COALESCE(nav.long_mv, 0::numeric) + abs(COALESCE(nav.short_mv, 0::numeric)), 0::numeric) AS weight_gross_pct,
    GREATEST(0::numeric, LEAST(100::numeric, round(30.0 * LEAST(1.0, GREATEST(0.0, COALESCE(s.mu / NULLIF(s.sigma, 0::numeric) * sqrt(252.0), 0.0) / 2.0))
      + 20.0 * GREATEST(0.0, 1.0 - LEAST(1.0, COALESCE(s.sigma * sqrt(252.0), 0.5) / 0.5))
      + 30.0 * LEAST(1.0, GREATEST(0.0, (COALESCE(
        CASE WHEN p.side = 'short'::text THEN (p.average_cost - lp.current_price) / NULLIF(p.average_cost, 0::numeric)
             ELSE (lp.current_price - p.average_cost) / NULLIF(p.average_cost, 0::numeric) END, 0.0) + 0.10) / 0.30))
      + CASE WHEN (abs(p.market_value) / NULLIF(nav.total_nav, 0::numeric)) > 0.10 THEN 6.0 ELSE 20.0 END))) AS quality_score,
        CASE WHEN p.side = 'short'::text THEN (p.average_cost - lp.current_price) / NULLIF(p.average_cost, 0::numeric)
             ELSE (lp.current_price - p.average_cost) / NULLIF(p.average_cost, 0::numeric) END AS unrealised_return_pct,
    abs(p.market_value) / NULLIF(nav.total_nav, 0::numeric) AS portfolio_weight,
    s.sigma::double precision * sqrt(252::double precision) AS annualised_vol,
    (s.mu / NULLIF(s.sigma, 0::numeric))::double precision * sqrt(252::double precision) AS sharpe_approx,
    h.hhi_score, h.n_positions,
        CASE WHEN (abs(p.market_value) / NULLIF(nav.total_nav, 0::numeric)) > 0.10 THEN true ELSE false END AS is_concentrated,
    lp.price_date,
    nav.total_nav AS portfolio_nav,
    nav.cash_balance, nav.buying_power,
    nav.long_mv AS long_market_value,
    nav.short_mv AS short_market_value
   FROM latest_pos p
     JOIN assets a ON a.id = p.asset_id
     LEFT JOIN latest_prices lp ON lp.asset_id = p.asset_id
     LEFT JOIN prev_day_prices pdp ON pdp.asset_id = p.asset_id
     LEFT JOIN five_day_prices fdp ON fdp.asset_id = p.asset_id
     LEFT JOIN stats s ON s.asset_id = p.asset_id
     CROSS JOIN nav
     CROSS JOIN hhi h
  ORDER BY (abs(p.market_value)) DESC NULLS LAST;

-- ── vw_quant_dashboard ───────────────────────────────────────────────────────
create or replace view public.vw_quant_dashboard as
 WITH latest_pos AS (
         SELECT DISTINCT ON (p.asset_id) p.asset_id
           FROM positions p
             JOIN assets a_1 ON a_1.id = p.asset_id
          WHERE p.quantity <> 0::numeric
            AND p.as_of_date >= (( SELECT max(positions.as_of_date) - 7 FROM positions))
            AND NOT (a_1.asset_class = 'option'::text
                     AND a_1.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'::text
                     AND to_date("substring"(a_1.symbol, '(\d{6})[CP]'::text), 'YYMMDD'::text) < CURRENT_DATE)
          ORDER BY p.asset_id, p.as_of_date DESC
        ), ranked_prices AS (
         SELECT ph.asset_id, ph.price_date, ph.open, ph.high, ph.low, ph.close,
            lag(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date) AS prev_close,
            row_number() OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date DESC) AS rn,
            count(*) OVER (PARTITION BY ph.asset_id) AS total_days
           FROM price_history ph
          WHERE ph."interval" = '1d'::text
            AND ph.asset_id IN (SELECT latest_pos.asset_id FROM latest_pos)
        ), ma_calc AS (
         SELECT ranked_prices.asset_id, ranked_prices.total_days,
            max(ranked_prices.close) FILTER (WHERE ranked_prices.rn = 1) AS current_price,
            avg(ranked_prices.close) FILTER (WHERE ranked_prices.rn <= 20) AS ma_20,
            avg(ranked_prices.close) FILTER (WHERE ranked_prices.rn <= 50) AS ma_50,
            avg(ranked_prices.close) FILTER (WHERE ranked_prices.rn <= 200) AS ma_200,
            max(ranked_prices.close) FILTER (WHERE ranked_prices.rn <= 20) AS high_20,
            min(ranked_prices.close) FILTER (WHERE ranked_prices.rn <= 20) AS low_20,
            stddev(ranked_prices.close) FILTER (WHERE ranked_prices.rn <= 20) AS stddev_20,
            max(ranked_prices.close) FILTER (WHERE ranked_prices.rn <= 252) AS high_52w,
            min(ranked_prices.close) FILTER (WHERE ranked_prices.rn <= 252) AS low_52w
           FROM ranked_prices
          GROUP BY ranked_prices.asset_id, ranked_prices.total_days
        ), returns AS (
         SELECT ph.asset_id, ph.price_date,
            (ph.close - lag(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date))
              / NULLIF(lag(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date), 0::numeric) AS r
           FROM price_history ph
          WHERE ph."interval" = '1d'::text
            AND ph.asset_id IN (SELECT latest_pos.asset_id FROM latest_pos)
        ), vol_stats AS (
         SELECT returns.asset_id,
            stddev(returns.r) FILTER (WHERE returns.price_date >= (CURRENT_DATE - 20)) AS vol_20d,
            stddev(returns.r) FILTER (WHERE returns.price_date >= (CURRENT_DATE - 60)) AS vol_60d
           FROM returns WHERE returns.r IS NOT NULL
          GROUP BY returns.asset_id
        ), rsi_base AS (
         SELECT ranked_prices.asset_id,
            avg(GREATEST(ranked_prices.close - ranked_prices.prev_close, 0::numeric)) AS avg_gain,
            avg(GREATEST(ranked_prices.prev_close - ranked_prices.close, 0::numeric)) AS avg_loss
           FROM ranked_prices
          WHERE ranked_prices.prev_close IS NOT NULL AND ranked_prices.rn <= 15
          GROUP BY ranked_prices.asset_id
        ), atr_base AS (
         SELECT ranked_prices.asset_id,
            avg(GREATEST(ranked_prices.high - ranked_prices.low,
                         abs(ranked_prices.high - COALESCE(ranked_prices.prev_close, ranked_prices.close)),
                         abs(ranked_prices.low - COALESCE(ranked_prices.prev_close, ranked_prices.close)))) AS atr_14
           FROM ranked_prices
          WHERE ranked_prices.rn <= 14 AND ranked_prices.high IS NOT NULL AND ranked_prices.low IS NOT NULL
          GROUP BY ranked_prices.asset_id
        )
 SELECT a.symbol, a.name, mc.current_price,
    round(mc.ma_20, 4) AS ma_20, round(mc.ma_50, 4) AS ma_50, round(mc.ma_200, 4) AS ma_200,
        CASE WHEN mc.current_price > mc.ma_50 AND mc.ma_50 > mc.ma_200 THEN 'Uptrend'::text
             WHEN mc.current_price < mc.ma_50 AND mc.ma_50 < mc.ma_200 THEN 'Downtrend'::text
             ELSE 'Sideways'::text END AS price_regime,
        CASE WHEN vs.vol_20d > vs.vol_60d THEN 'Expanding'::text
             WHEN vs.vol_20d < vs.vol_60d THEN 'Compressing'::text
             ELSE 'Stable'::text END AS vol_regime,
    round((mc.current_price - mc.ma_20) / NULLIF(mc.stddev_20, 0::numeric), 2) AS zscore_20d,
        CASE WHEN ((mc.current_price - mc.ma_20) / NULLIF(mc.stddev_20, 0::numeric)) > 2::numeric THEN 'Overbought'::text
             WHEN ((mc.current_price - mc.ma_20) / NULLIF(mc.stddev_20, 0::numeric)) < '-2'::integer::numeric THEN 'Oversold'::text
             ELSE 'Neutral'::text END AS mean_reversion_signal,
    round((mc.current_price - mc.low_20) / NULLIF(mc.high_20 - mc.low_20, 0::numeric) * 100::numeric, 1) AS momentum_pct_rank_20d,
    vs.vol_20d::double precision * sqrt(252::double precision) AS annualised_vol_20d,
    vs.vol_60d::double precision * sqrt(252::double precision) AS annualised_vol_60d,
    mc.total_days AS trading_days_available,
    round(mc.high_52w, 4) AS high_52w, round(mc.low_52w, 4) AS low_52w,
    round((mc.current_price - mc.low_52w) / NULLIF(mc.high_52w - mc.low_52w, 0::numeric) * 100::numeric, 1) AS pct_52w_range,
        CASE WHEN r.avg_loss IS NULL OR r.avg_loss = 0::numeric THEN 100.0
             ELSE round(100::numeric - 100.0 / (1::numeric + r.avg_gain / NULLIF(r.avg_loss, 0::numeric)), 1) END AS rsi_14,
    round(atr.atr_14, 4) AS atr_14,
    round(4::numeric * mc.stddev_20 / NULLIF(mc.ma_20, 0::numeric) * 100::numeric, 2) AS bb_width_pct
   FROM latest_pos lp
     JOIN assets a ON a.id = lp.asset_id
     JOIN ma_calc mc ON mc.asset_id = lp.asset_id
     LEFT JOIN vol_stats vs ON vs.asset_id = lp.asset_id
     LEFT JOIN rsi_base r ON r.asset_id = lp.asset_id
     LEFT JOIN atr_base atr ON atr.asset_id = lp.asset_id
  ORDER BY (mc.current_price / NULLIF(mc.ma_50, 0::numeric)) DESC NULLS LAST;

-- ── vw_quant_rolling_returns ─────────────────────────────────────────────────
create or replace view public.vw_quant_rolling_returns as
 WITH latest_pos AS (
         SELECT DISTINCT ON (p.asset_id) p.asset_id
           FROM positions p
             JOIN assets a_1 ON a_1.id = p.asset_id
          WHERE p.quantity <> 0::numeric
            AND p.as_of_date >= (( SELECT max(positions.as_of_date) - 7 FROM positions))
            AND NOT (a_1.asset_class = 'option'::text
                     AND a_1.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'::text
                     AND to_date("substring"(a_1.symbol, '(\d{6})[CP]'::text), 'YYMMDD'::text) < CURRENT_DATE)
          ORDER BY p.asset_id, p.as_of_date DESC
        ), ranked_prices AS (
         SELECT ph.asset_id, ph.price_date, ph.close,
            row_number() OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date DESC) AS rn
           FROM price_history ph
          WHERE ph."interval" = '1d'::text
            AND ph.asset_id IN (SELECT latest_pos.asset_id FROM latest_pos)
        ), price_pivots AS (
         SELECT ranked_prices.asset_id,
            max(ranked_prices.close) FILTER (WHERE ranked_prices.rn = 1) AS p_now,
            max(ranked_prices.close) FILTER (WHERE ranked_prices.rn = 2) AS p_1d,
            max(ranked_prices.close) FILTER (WHERE ranked_prices.rn = 5) AS p_1w,
            max(ranked_prices.close) FILTER (WHERE ranked_prices.rn = 21) AS p_1m,
            max(ranked_prices.close) FILTER (WHERE ranked_prices.rn = 63) AS p_3m,
            max(ranked_prices.close) FILTER (WHERE ranked_prices.rn = 126) AS p_6m,
            max(ranked_prices.close) FILTER (WHERE ranked_prices.rn = 252) AS p_1y
           FROM ranked_prices
          GROUP BY ranked_prices.asset_id
        ), ytd_prices AS (
         SELECT DISTINCT ON (ph.asset_id) ph.asset_id, ph.close AS p_ytd
           FROM price_history ph
          WHERE ph."interval" = '1d'::text
            AND ph.price_date >= date_trunc('year'::text, CURRENT_DATE::timestamp with time zone)::date
            AND ph.asset_id IN (SELECT latest_pos.asset_id FROM latest_pos)
          ORDER BY ph.asset_id, ph.price_date
        )
 SELECT a.symbol, a.name, pp.p_now AS current_price,
    round((pp.p_now - pp.p_1d) / NULLIF(pp.p_1d, 0::numeric) * 100::numeric, 2) AS return_1d_pct,
    round((pp.p_now - pp.p_1w) / NULLIF(pp.p_1w, 0::numeric) * 100::numeric, 2) AS return_1w_pct,
    round((pp.p_now - pp.p_1m) / NULLIF(pp.p_1m, 0::numeric) * 100::numeric, 2) AS return_1m_pct,
    round((pp.p_now - pp.p_3m) / NULLIF(pp.p_3m, 0::numeric) * 100::numeric, 2) AS return_3m_pct,
    round((pp.p_now - pp.p_6m) / NULLIF(pp.p_6m, 0::numeric) * 100::numeric, 2) AS return_6m_pct,
    round((pp.p_now - pp.p_1y) / NULLIF(pp.p_1y, 0::numeric) * 100::numeric, 2) AS return_1y_pct,
    round((pp.p_now - yp.p_ytd) / NULLIF(yp.p_ytd, 0::numeric) * 100::numeric, 2) AS return_ytd_pct
   FROM latest_pos lp
     JOIN assets a ON a.id = lp.asset_id
     JOIN price_pivots pp ON pp.asset_id = lp.asset_id
     LEFT JOIN ytd_prices yp ON yp.asset_id = lp.asset_id
  ORDER BY (round((pp.p_now - pp.p_1m) / NULLIF(pp.p_1m, 0::numeric) * 100::numeric, 2)) DESC NULLS LAST;

-- ── nexus_holdings ───────────────────────────────────────────────────────────
-- Same pushdown, plus one real correction: the px CTE read price_history with
-- no interval predicate at all, so an intraday bar could take rn=1 and become
-- the name's "last close" (and its rn=2 partner the "previous close", making
-- today_pct an intraday delta). Pinning interval='1d' matches every other
-- price read in the schema.
create or replace view public.nexus_holdings as
 WITH latest AS (
         SELECT max(positions.as_of_date) AS d FROM positions
        ), cur AS (
         SELECT p.asset_id, a.symbol, a.name, p.market_value
           FROM positions p
             JOIN assets a ON a.id = p.asset_id
          WHERE p.as_of_date = (( SELECT latest.d FROM latest)) AND p.market_value > 0::numeric
        ), tot AS (
         SELECT sum(cur_1.market_value) AS tmv FROM cur cur_1
        ), varbase AS (
         SELECT sum(insight_counter_specific_var_vs_sector.stock_var_95) AS sv
           FROM insight_counter_specific_var_vs_sector
        ), px AS (
         SELECT price_history.asset_id, price_history.close, price_history.price_date,
            row_number() OVER (PARTITION BY price_history.asset_id ORDER BY price_history.price_date DESC) AS rn,
            max(price_history.price_date) OVER (PARTITION BY price_history.asset_id) AS last_date
           FROM price_history
          WHERE price_history."interval" = '1d'::text
            AND price_history.asset_id IN (SELECT cur_2.asset_id FROM cur cur_2)
        ), px2 AS (
         SELECT px.asset_id,
            max(CASE WHEN px.rn = 1 THEN px.close ELSE NULL::numeric END) AS last_close,
            max(CASE WHEN px.rn = 2 THEN px.close ELSE NULL::numeric END) AS prev_close,
            max(px.last_date) AS last_date
           FROM px WHERE px.rn <= 2
          GROUP BY px.asset_id
        ), conv AS (
         SELECT DISTINCT ON (decisions.symbol) decisions.symbol, decisions.conviction
           FROM decisions ORDER BY decisions.symbol, decisions.seq DESC
        ), latest_run AS (
         SELECT scrapbook_snapshots.company_id, max(scrapbook_snapshots.run_date) AS rd
           FROM scrapbook_snapshots GROUP BY scrapbook_snapshots.company_id
        ), disp AS (
         SELECT s.company_id,
            count(DISTINCT s.method) FILTER (WHERE s.implied_price > 0::numeric) AS n_methods,
            min(s.implied_price) FILTER (WHERE s.implied_price > 0::numeric) AS lo,
            max(s.implied_price) FILTER (WHERE s.implied_price > 0::numeric) AS hi,
            avg(s.implied_price) FILTER (WHERE s.implied_price > 0::numeric) AS mean_px
           FROM scrapbook_snapshots s
             JOIN latest_run lr ON lr.company_id = s.company_id AND lr.rd = s.run_date
          GROUP BY s.company_id
        ), fv AS (
         SELECT c_1.ticker, c_1.avg_fair_value, c_1.last_run_at::date AS run_date,
            COALESCE(d.n_methods, 0::bigint) AS n_methods,
            CASE WHEN d.mean_px > 0::numeric THEN (d.hi - d.lo) / d.mean_px ELSE NULL::numeric END AS band_frac
           FROM scrapbook_companies c_1
             LEFT JOIN disp d ON d.company_id = c_1.id
          WHERE c_1.avg_fair_value IS NOT NULL AND c_1.avg_fair_value > 0::numeric
        )
 SELECT cur.symbol AS tk,
    COALESCE(pt.theme, 'Unmapped'::text) AS theme,
    COALESCE(c.conviction, 49) AS conviction,
    c.conviction IS NOT NULL AS pcm_rated,
    round(cur.market_value / NULLIF(t.tmv, 0::numeric) * 100::numeric, 2) AS weight_pct,
        CASE WHEN px2.prev_close > 0::numeric THEN round((px2.last_close / px2.prev_close - 1::numeric) * 100::numeric, 2)
             ELSE NULL::numeric END AS today_pct,
        CASE WHEN px2.prev_close > 0::numeric
             THEN round((px2.last_close / px2.prev_close - 1::numeric) * (cur.market_value / NULLIF(t.tmv, 0::numeric)) * 100::numeric, 3)
             ELSE NULL::numeric END AS contrib_pct,
    round(COALESCE(v.stock_var_95, 0::numeric) / NULLIF(vb.sv, 0::numeric) * 100::numeric, 1) AS component_var,
        CASE WHEN fv.avg_fair_value IS NOT NULL AND px2.last_close > 0::numeric
             THEN round((fv.avg_fair_value / px2.last_close - 1::numeric) * 100::numeric, 1)
             ELSE NULL::numeric END AS fv_gap_pct,
    NULL::text AS signal,
    'neutral'::text AS signal_tone,
    COALESCE((CURRENT_DATE - px2.last_date) > 4, true) AS stale,
    fv.avg_fair_value IS NOT NULL AND px2.last_close > 0::numeric
      AND (CURRENT_DATE - fv.run_date) <= 14 AND fv.n_methods >= 2 AND fv.band_frac <= 0.40 AS fv_trustworthy,
        CASE WHEN fv.avg_fair_value IS NULL OR px2.last_close IS NULL OR px2.last_close <= 0::numeric THEN 'no valuation on file'::text
             WHEN (CURRENT_DATE - fv.run_date) > 14 THEN ('valuation '::text || ((CURRENT_DATE - fv.run_date)::text)) || 'd stale'::text
             WHEN fv.n_methods < 2 THEN 'single method only'::text
             WHEN fv.band_frac > 0.40 THEN ('methods disagree '::text || round(fv.band_frac * 100::numeric)::text) || '%'::text
             ELSE NULL::text END AS fv_untrust_reason
   FROM cur
     CROSS JOIN tot t
     CROSS JOIN varbase vb
     LEFT JOIN position_themes pt ON pt.symbol = cur.symbol
     LEFT JOIN conv c ON c.symbol = cur.symbol
     LEFT JOIN px2 ON px2.asset_id = cur.asset_id
     LEFT JOIN fv ON fv.ticker = cur.symbol
     LEFT JOIN insight_counter_specific_var_vs_sector v ON v.symbol = cur.symbol
  ORDER BY cur.market_value DESC;

-- ── Theme, alongside sector, on the Nexus feed ───────────────────────────────
-- The flagship reads vw_nexus_holdings, which carries sector and no theme, so
-- everything downstream called sector "theme". nexus_holdings has always joined
-- position_themes and exposed the real taxonomy — the two feeds simply
-- disagreed about what the word meant.
--
-- Appending theme here lets one feed answer both questions. Names with no entry
-- in position_themes stay NULL rather than being folded into a bucket: the UI
-- renders them as Unclassified and says how much of the book that is. Six held
-- names (11.3% by weight) are currently unmapped.
create or replace view public.vw_nexus_holdings as
 WITH w AS (
         SELECT m.symbol, m.asset_name, m.sector, m.market_value, m.weight_pct,
            m.daily_return_pct, m.five_day_return_pct, m.total_return_pct, m.pnl_contribution,
            m.dcf_upside_pct, m.intrinsic_value, m.fwd_pe, m.peg_ratio, m.macro_regime_fit,
            m.rate_sensitivity, m.fx_exposure, m.beta, m.max_drawdown_pct, m.var_contribution_pct,
            m.valuation_signal, m.macro_signal, m.technical_signal, m.quality_grade, m.quant_signal,
            m.conviction_score, m.recommended_action, m.next_earnings_date, m.alert_flag,
            m.nexus_insight, m.current_price, m.valuation_source,
            round(m.market_value / NULLIF(sum(m.market_value) OVER (), 0::numeric) * 100::numeric, 2) AS weight_long_pct,
            ph.unrealised_return_pct * 100::numeric AS unrealised_return_pct_src,
            pt.theme AS theme_src
           FROM mv_nexus_holdings m
             LEFT JOIN vw_portfolio_home ph ON ph.symbol = m.symbol
             LEFT JOIN position_themes pt ON pt.symbol = m.symbol
        )
 SELECT symbol, asset_name, sector, market_value,
    weight_long_pct AS weight_pct,
    daily_return_pct, five_day_return_pct, total_return_pct, pnl_contribution,
    dcf_upside_pct, intrinsic_value, fwd_pe, peg_ratio, macro_regime_fit,
    rate_sensitivity, fx_exposure, beta, max_drawdown_pct, var_contribution_pct,
    valuation_signal, macro_signal, technical_signal, quality_grade, quant_signal,
    conviction_score,
        CASE WHEN conviction_score >= 75 AND weight_long_pct < 10::numeric THEN 'Add'::text
             WHEN conviction_score >= 60 AND conviction_score <= 74 THEN 'Hold'::text
             WHEN conviction_score >= 45 AND conviction_score <= 59 OR weight_long_pct > 10::numeric THEN 'Trim'::text
             ELSE 'Exit'::text END AS recommended_action,
    next_earnings_date,
        CASE WHEN COALESCE(var_contribution_pct, 0::numeric) > 2.5 AND weight_long_pct > 8::numeric THEN 'conflict'::text
             WHEN weight_long_pct > 10::numeric THEN 'risk'::text
             WHEN conviction_score >= 75 THEN 'opportunity'::text
             ELSE NULL::text END AS alert_flag,
    (((((((('Weight '::text || round(weight_long_pct, 1)) || '% · Tech '::text) || technical_signal) || ' · Macro '::text)
      || macro_signal) || ' · Quality '::text) || quality_grade) || COALESCE(' · '::text || valuation_signal, ''::text)) || '.'::text AS nexus_insight,
    current_price, valuation_source,
    unrealised_return_pct_src AS unrealised_return_pct,
    theme_src AS theme
   FROM w;

comment on view public.vw_nexus_holdings is
  'Nexus flagship holdings feed. Carries BOTH sector (GICS-style, from assets) and theme (the hand-kept position_themes taxonomy) — they are different questions and the UI groups by either. theme is NULL for unmapped names; do not coalesce it into a bucket, the spine reports the unmapped weight explicitly.';
