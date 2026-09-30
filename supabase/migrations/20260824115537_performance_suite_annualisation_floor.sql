-- Step 0b (memo v2 §2.7) — annualisation floor at 90 days held.
--
-- `annualised_return` compounds a holding-period return to a year. Over a
-- short window that is arithmetically correct and presentationally
-- indefensible: at the time of writing AMGN, held 10 days, turns a +6.18%
-- move into **+793.21% CAGR**, and CRWV turns -6.35% over 5 days into
-- -99.17%. The view's own default ORDER BY is `annualised_return DESC`, so
-- the top row of the whole view was a ten-day-old position, and the column is
-- sortable in the position table.
--
-- The exponent is 365 / days_held. As days_held goes to 1 it goes to 365, so
-- the figure stops describing the position and starts describing the length of
-- the window. There is no threshold at which it becomes exact; 90 days is the
-- point at which the extrapolation is defensible enough to rank on.
--
-- Suppressed, not corrected: NULL, because no annualisation of a 5-day hold is
-- reportable. `total_return_pct` and `days_held` remain and say what actually
-- happened. NULL is JS-falsy and every consumer already filters on
-- `annualised_return != null` (added at step 0 for the staleness gate), so the
-- new NULLs sink in sorts and drop out of the Avg CAGR mean rather than
-- entering it as zero.
--
-- `verdict_status` is deliberately NOT moved to 'insufficient_history' here.
-- A 10-day position's *total return* is measured — a real price against a real
-- entry. Only the annualisation is unsupportable. The memo's
-- `insufficient_history` status belongs to the verdict table at step 4, where
-- it describes a position that cannot be judged at all.
--
-- Not equivalent by design: 14 of 60 previously-annualised rows go NULL.
-- Verified against production that no other column moves.

CREATE OR REPLACE VIEW public.vw_performance_suite AS
 WITH latest_pos_snapshot AS (
         SELECT DISTINCT ON (p.asset_id) p.asset_id,
            p.quantity,
            p.average_cost,
            p.market_value,
            p.as_of_date,
            p.side
           FROM positions p
             JOIN assets a_1 ON a_1.id = p.asset_id
          WHERE p.as_of_date >= (( SELECT max(positions.as_of_date) - 2
                   FROM positions)) AND NOT (a_1.asset_class = 'option'::text AND a_1.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'::text AND to_date("substring"(a_1.symbol, '(\d{6})[CP]'::text), 'YYMMDD'::text) < CURRENT_DATE)
          ORDER BY p.asset_id, p.as_of_date DESC
        ), latest_pos AS (
         SELECT latest_pos_snapshot.asset_id,
            latest_pos_snapshot.quantity,
            latest_pos_snapshot.average_cost,
            latest_pos_snapshot.market_value,
            latest_pos_snapshot.as_of_date,
            latest_pos_snapshot.side
           FROM latest_pos_snapshot
          WHERE latest_pos_snapshot.quantity IS NOT NULL AND latest_pos_snapshot.quantity <> 0::numeric AND (latest_pos_snapshot.market_value IS NULL OR abs(latest_pos_snapshot.market_value) > 0.01)
        ), first_buys AS (
         SELECT DISTINCT ON (t.asset_id) t.asset_id,
            t.price AS tx_entry_price,
            t.transaction_date AS tx_entry_date
           FROM transactions t
             JOIN assets a_1 ON a_1.id = t.asset_id
          WHERE lower(t.transaction_type) ~~ '%buy%'::text AND a_1.symbol <> '$CASH'::text
          ORDER BY t.asset_id, t.transaction_date
        ), position_base AS (
         SELECT lp_1.asset_id,
            lp_1.market_value,
            lp_1.side,
            COALESCE(fb.tx_entry_price, lp_1.average_cost) AS entry_price,
            COALESCE(fb.tx_entry_date::date, lp_1.as_of_date) AS entry_date
           FROM latest_pos lp_1
             LEFT JOIN first_buys fb ON fb.asset_id = lp_1.asset_id
        ), post_entry_range AS (
         SELECT pb_1.asset_id,
            max(ph.high) AS high_30d_post_entry,
            min(ph.low) AS low_30d_post_entry
           FROM position_base pb_1
             LEFT JOIN price_history ph ON ph.asset_id = pb_1.asset_id AND ph."interval" = '1d'::text AND ph.price_date >= pb_1.entry_date AND ph.price_date <= (pb_1.entry_date + '30 days'::interval)
          GROUP BY pb_1.asset_id
        ), latest_prices AS (
         SELECT pb0.asset_id,
            t.close AS current_price,
            t.price_date AS last_price_date,
            CURRENT_DATE - t.price_date AS price_days_old,
            (CURRENT_DATE - t.price_date) <= 7 AS is_measurable
           FROM position_base pb0
             CROSS JOIN LATERAL ( SELECT ph.close,
                    ph.price_date
                   FROM price_history ph
                  WHERE ph.asset_id = pb0.asset_id AND ph."interval" = '1d'::text
                  ORDER BY ph.price_date DESC
                 LIMIT 1) t
        ), sector_live AS (
         SELECT a_1.id AS asset_id,
            NULLIF(TRIM(BOTH FROM ec.payload ->> 'Sector'::text), ''::text) AS av_sector
           FROM assets a_1
             LEFT JOIN equity_cache ec ON ec.symbol = a_1.symbol AND ec.endpoint = 'overview'::text AND ec.expires_at > (now() - '48:00:00'::interval)
          WHERE (a_1.id IN ( SELECT position_base.asset_id
                   FROM position_base))
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
        CASE
            WHEN lp.is_measurable THEN (lp.current_price - pb.entry_price) / NULLIF(pb.entry_price, 0::numeric)
            ELSE NULL::numeric
        END AS total_return_pct,
        -- §2.7 floor: 90 days held. `>= 90` subsumes the previous
        -- `CURRENT_DATE > pb.entry_date` guard against a zero exponent.
        CASE
            WHEN lp.is_measurable AND (CURRENT_DATE - pb.entry_date) >= 90 THEN power(lp.current_price / NULLIF(pb.entry_price, 0::numeric), 365.0 / NULLIF(CURRENT_DATE - pb.entry_date, 0)::numeric) - 1::numeric
            ELSE NULL::numeric
        END AS annualised_return,
    CURRENT_DATE - pb.entry_date AS days_held,
        CASE
            WHEN NOT lp.is_measurable THEN NULL::boolean
            WHEN (CURRENT_DATE - pb.entry_date) > 180 AND ((lp.current_price - pb.entry_price) / NULLIF(pb.entry_price, 0::numeric)) < 0::numeric THEN true
            ELSE false
        END AS cut_candidate_flag,
    lp.last_price_date,
    lp.price_days_old,
        CASE
            WHEN lp.is_measurable THEN 'measured'::text
            ELSE 'not_measurable'::text
        END AS verdict_status,
        CASE
            WHEN lp.is_measurable THEN NULL::text
            ELSE 'price_days_old='::text || lp.price_days_old::text
        END AS status_reason
   FROM position_base pb
     JOIN assets a ON a.id = pb.asset_id
     JOIN latest_prices lp ON lp.asset_id = pb.asset_id
     LEFT JOIN post_entry_range per ON per.asset_id = pb.asset_id
     LEFT JOIN sector_live sl ON sl.asset_id = pb.asset_id
  ORDER BY (
        CASE
            WHEN lp.is_measurable AND (CURRENT_DATE - pb.entry_date) >= 90 THEN power(lp.current_price / NULLIF(pb.entry_price, 0::numeric), 365.0 / NULLIF(CURRENT_DATE - pb.entry_date, 0)::numeric) - 1::numeric
            ELSE NULL::numeric
        END) DESC NULLS LAST;
