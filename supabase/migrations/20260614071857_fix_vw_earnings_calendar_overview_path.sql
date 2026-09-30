-- vw_earnings_calendar read the overview fields (NextEarningsDate, ExDividendDate,
-- AnalystTargetPrice, 52WeekHigh/Low) at the TOP LEVEL of the equity_cache payload,
-- but /api/equity nests them under an `overview` key. Every one of those columns was
-- therefore null for the whole book — which is why next_earnings_date never lit up on
-- vw_nexus_holdings and the Nexus earnings deck saw only the handful of names Finnhub's
-- bulk calendar happens to return. Re-point all five reads at payload->'overview'->>'...'.
CREATE OR REPLACE VIEW vw_earnings_calendar AS
 WITH latest_pos_snapshot AS (
         SELECT DISTINCT ON (p.asset_id) p.asset_id,
            p.quantity, p.market_value, p.side, p.as_of_date
           FROM positions p
             JOIN assets a_1 ON a_1.id = p.asset_id
          WHERE p.as_of_date >= (( SELECT max(positions.as_of_date) - 2 FROM positions))
            AND NOT (a_1.asset_class = 'option'::text
                     AND a_1.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'::text
                     AND to_date("substring"(a_1.symbol, '(\d{6})[CP]'::text), 'YYMMDD'::text) < CURRENT_DATE)
          ORDER BY p.asset_id, p.as_of_date DESC
        ), latest_pos AS (
         SELECT latest_pos_snapshot.asset_id, latest_pos_snapshot.quantity,
            latest_pos_snapshot.market_value, latest_pos_snapshot.side, latest_pos_snapshot.as_of_date
           FROM latest_pos_snapshot
          WHERE latest_pos_snapshot.quantity IS NOT NULL
            AND latest_pos_snapshot.quantity <> 0::numeric
            AND (latest_pos_snapshot.market_value IS NULL OR abs(latest_pos_snapshot.market_value) > 0.01)
        ), cached_overview AS (
         SELECT ec.symbol, ec.payload, ec.cached_at
           FROM equity_cache ec
          WHERE ec.endpoint = 'overview'::text AND ec.expires_at > (now() - '24:00:00'::interval)
        ), latest_account AS (
         SELECT DISTINCT ON (account_snapshots.portfolio_id) account_snapshots.portfolio_id, account_snapshots.equity
           FROM account_snapshots
          ORDER BY account_snapshots.portfolio_id, account_snapshots.as_of DESC
        ), nav AS (
         SELECT COALESCE(( SELECT latest_account.equity FROM latest_account LIMIT 1),
                         ( SELECT sum(latest_pos.market_value) AS sum FROM latest_pos)) AS total_nav
        )
 SELECT a.symbol, a.name, a.sector, a.asset_class, lp.market_value,
    abs(lp.market_value) / NULLIF(nav.total_nav, 0::numeric) AS weight_pct,
    (co.payload -> 'overview' ->> 'NextEarningsDate'::text)::date AS earnings_date,
    ((co.payload -> 'overview' ->> 'NextEarningsDate'::text)::date) - CURRENT_DATE AS days_to_earnings,
    (co.payload -> 'overview' ->> 'ExDividendDate'::text)::date AS ex_div_date,
    (co.payload -> 'overview' ->> 'AnalystTargetPrice'::text)::numeric AS analyst_target,
    (co.payload -> 'overview' ->> '52WeekHigh'::text)::numeric AS week52_high,
    (co.payload -> 'overview' ->> '52WeekLow'::text)::numeric AS week52_low,
    co.cached_at AS data_as_of
   FROM latest_pos lp
     JOIN assets a ON a.id = lp.asset_id
     LEFT JOIN cached_overview co ON co.symbol = a.symbol
     CROSS JOIN nav
  ORDER BY (
        CASE
            WHEN (co.payload -> 'overview' ->> 'NextEarningsDate'::text) IS NOT NULL
            THEN ((co.payload -> 'overview' ->> 'NextEarningsDate'::text)::date) - CURRENT_DATE
            ELSE 9999
        END), (abs(lp.market_value)) DESC;
