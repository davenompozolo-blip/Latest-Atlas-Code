-- vw_performance_suite: replace the full-history DISTINCT ON with a LATERAL top-1.
--
-- EXPLAIN: the latest_prices CTE was a Unique over a Sort of 59,767 rows
-- spilling 2,440 kB to disk (external merge) to return 63 -- it read 60,850
-- rows of price history for the 63 held assets purely to take the newest row
-- of each. 493 ms warm, 1,960 ms cold, against anon's 3s cap: under it warm,
-- over it on a cold buffer cache, which is the same intermittent first-load
-- failure vw_portfolio_nav_daily had.
--
-- The LATERAL reads exactly one row per asset off
-- price_history_asset_date_interval_uniq (Index Scan Backward, no sort), is
-- exact however stale a name is, and does not care how big the table gets --
-- which now matters, because the universe price job adds ~1,700 rows a night.
-- Same rewrite already applied to vw_portfolio_home and nexus_holdings on
-- 2026-08-18; this view was missed because its pattern is DISTINCT ON rather
-- than row_number().
--
-- Proved equivalent by EXCEPT both ways in one transaction: 0 lost, 0 gained,
-- 63 rows each side. Result: 493 ms -> 85 ms.
--
-- Only the latest_prices CTE changed. Everything else is the prior definition.
create or replace view public.vw_performance_suite as
 WITH latest_pos_snapshot AS (
         SELECT DISTINCT ON (p.asset_id) p.asset_id,
            p.quantity, p.average_cost, p.market_value, p.as_of_date, p.side
           FROM positions p
             JOIN assets a_1 ON a_1.id = p.asset_id
          WHERE p.as_of_date >= (( SELECT max(positions.as_of_date) - 2 FROM positions))
            AND NOT (a_1.asset_class = 'option'::text AND a_1.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'::text
                     AND to_date("substring"(a_1.symbol, '(\d{6})[CP]'::text), 'YYMMDD'::text) < CURRENT_DATE)
          ORDER BY p.asset_id, p.as_of_date DESC
        ), latest_pos AS (
         SELECT latest_pos_snapshot.asset_id, latest_pos_snapshot.quantity,
            latest_pos_snapshot.average_cost, latest_pos_snapshot.market_value,
            latest_pos_snapshot.as_of_date, latest_pos_snapshot.side
           FROM latest_pos_snapshot
          WHERE latest_pos_snapshot.quantity IS NOT NULL AND latest_pos_snapshot.quantity <> 0::numeric
            AND (latest_pos_snapshot.market_value IS NULL OR abs(latest_pos_snapshot.market_value) > 0.01)
        ), first_buys AS (
         SELECT DISTINCT ON (t.asset_id) t.asset_id,
            t.price AS tx_entry_price, t.transaction_date AS tx_entry_date
           FROM transactions t
             JOIN assets a_1 ON a_1.id = t.asset_id
          WHERE lower(t.transaction_type) ~~ '%buy%'::text AND a_1.symbol <> '$CASH'::text
          ORDER BY t.asset_id, t.transaction_date
        ), position_base AS (
         SELECT lp_1.asset_id, lp_1.market_value, lp_1.side,
            COALESCE(fb.tx_entry_price, lp_1.average_cost) AS entry_price,
            COALESCE(fb.tx_entry_date::date, lp_1.as_of_date) AS entry_date
           FROM latest_pos lp_1
             LEFT JOIN first_buys fb ON fb.asset_id = lp_1.asset_id
        ), post_entry_range AS (
         SELECT pb_1.asset_id,
            max(ph.high) AS high_30d_post_entry,
            min(ph.low) AS low_30d_post_entry
           FROM position_base pb_1
             LEFT JOIN price_history ph ON ph.asset_id = pb_1.asset_id AND ph."interval" = '1d'::text
                  AND ph.price_date >= pb_1.entry_date AND ph.price_date <= (pb_1.entry_date + '30 days'::interval)
          GROUP BY pb_1.asset_id
        ), latest_prices AS (
         SELECT pb0.asset_id, t.close AS current_price
           FROM position_base pb0
           CROSS JOIN LATERAL (
                SELECT ph.close
                  FROM price_history ph
                 WHERE ph.asset_id = pb0.asset_id AND ph."interval" = '1d'::text
                 ORDER BY ph.price_date DESC
                 LIMIT 1
           ) t
        ), sector_live AS (
         SELECT a_1.id AS asset_id,
            NULLIF(TRIM(BOTH FROM ec.payload ->> 'Sector'::text), ''::text) AS av_sector
           FROM assets a_1
             LEFT JOIN equity_cache ec ON ec.symbol = a_1.symbol AND ec.endpoint = 'overview'::text
                  AND ec.expires_at > (now() - '48:00:00'::interval)
          WHERE (a_1.id IN ( SELECT position_base.asset_id FROM position_base))
        )
 SELECT a.symbol,
    a.name,
    COALESCE(sl.av_sector, a.sector, 'Other'::text) AS sector,
    pb.market_value,
    pb.side,
    pb.entry_price,
    pb.entry_date,
    lp.current_price,
    round((1::numeric - (pb.entry_price - per.low_30d_post_entry) / NULLIF(per.high_30d_post_entry - per.low_30d_post_entry, 0::numeric)) * 100::numeric, 1) AS entry_efficiency_score,
    (lp.current_price - pb.entry_price) / NULLIF(pb.entry_price, 0::numeric) AS total_return_pct,
        CASE
            WHEN CURRENT_DATE > pb.entry_date THEN power(lp.current_price / NULLIF(pb.entry_price, 0::numeric), 365.0 / NULLIF(CURRENT_DATE - pb.entry_date, 0)::numeric) - 1::numeric
            ELSE NULL::numeric
        END AS annualised_return,
    CURRENT_DATE - pb.entry_date AS days_held,
        CASE
            WHEN (CURRENT_DATE - pb.entry_date) > 180 AND ((lp.current_price - pb.entry_price) / NULLIF(pb.entry_price, 0::numeric)) < 0::numeric THEN true
            ELSE false
        END AS cut_candidate_flag
   FROM position_base pb
     JOIN assets a ON a.id = pb.asset_id
     JOIN latest_prices lp ON lp.asset_id = pb.asset_id
     LEFT JOIN post_entry_range per ON per.asset_id = pb.asset_id
     LEFT JOIN sector_live sl ON sl.asset_id = pb.asset_id
  ORDER BY (
        CASE
            WHEN CURRENT_DATE > pb.entry_date THEN power(lp.current_price / NULLIF(pb.entry_price, 0::numeric), 365.0 / NULLIF(CURRENT_DATE - pb.entry_date, 0)::numeric) - 1::numeric
            ELSE NULL::numeric
        END) DESC NULLS LAST;
