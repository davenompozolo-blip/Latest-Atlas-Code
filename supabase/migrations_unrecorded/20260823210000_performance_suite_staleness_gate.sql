-- Step 0 — staleness gate on vw_performance_suite.
--
-- THE DEFECT
-- ----------
-- The view took the latest available close with no staleness check, so a
-- five-month-old print was treated as today's price. Three held OTC ADRs have
-- no live feed, and the module published confident numbers off them:
--
--   KMTUY  last bar 2026-03-13 (163d)  showed +35.96%  /  +62.82% CAGR
--   NPSNY  last bar 2026-03-27 (149d)  showed -26.66%  ·  cut_candidate = true
--   VWAGY  last bar 2026-03-27 (149d)  showed -17.58%  ·  cut_candidate = true
--
-- Two of the thirteen cut_candidate_flag positions were flagged on prices five
-- months old. The flag's rule -- held >180 days and underwater -- is satisfied
-- by a stale price exactly as readily as by a live one, so the cut list was
-- recommending action on names nobody could measure.
--
-- The 7-day gate and price_days_old already existed on nexus_holdings, built
-- for the Nexus feeds in August. They were never ported here. This ports them.
--
-- WHAT IS GATED, AND WHAT IS NOT
-- ------------------------------
-- Gated (NULL past 7 days): total_return_pct, annualised_return,
-- cut_candidate_flag. All three are functions of current_price.
--
-- NOT gated:
--   current_price          a real close, just an old one. Published with
--                          last_price_date and price_days_old beside it so a
--                          consumer can say why rather than guessing.
--   entry_efficiency_score computed from the 30 days AFTER entry, so it is
--                          historical and stays true however dead the feed is.
--                          The quality of the initial call remains knowable.
--
-- cut_candidate_flag becomes NULL rather than false. False is a claim -- "not
-- a cut candidate" -- and we do not know that. NULL is JS-falsy, so every
-- existing consumer (filter, badge render) behaves correctly unchanged.
--
-- verdict_status / status_reason deliberately reuse the names from the
-- position_verdicts schema so the verdict materialisation lifts the vocabulary
-- unchanged. Only 'measured' and 'not_measurable' can occur here; 'one_sided'
-- arrives with the counterfactual, which this view does not compute.
--
-- 7 days, not 4: a Thursday close before a Friday holiday is 5 days old by
-- Tuesday. Same reasoning as the nexus_holdings gate.
--
-- New columns are APPENDED, not inserted. `create or replace view` cannot
-- reorder columns and a drop-and-recreate would need every dependent rebuilt
-- for no gain -- consumers select by name.
--
-- Verified against production before and after: 60 rows byte-identical,
-- 3 rows changed (exactly the three ADRs), 0 rows lost. Cut list 13 -> 11.
-- Worst staleness among still-measured positions: 2 days.
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
         SELECT pb0.asset_id, t.close AS current_price, t.price_date AS last_price_date,
            CURRENT_DATE - t.price_date AS price_days_old,
            (CURRENT_DATE - t.price_date) <= 7 AS is_measurable
           FROM position_base pb0
             CROSS JOIN LATERAL ( SELECT ph.close, ph.price_date
                   FROM price_history ph
                  WHERE ph.asset_id = pb0.asset_id AND ph."interval" = '1d'::text
                  ORDER BY ph.price_date DESC
                 LIMIT 1) t
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
        CASE
            WHEN lp.is_measurable THEN (lp.current_price - pb.entry_price) / NULLIF(pb.entry_price, 0::numeric)
            ELSE NULL::numeric
        END AS total_return_pct,
        CASE
            WHEN lp.is_measurable AND CURRENT_DATE > pb.entry_date THEN power(lp.current_price / NULLIF(pb.entry_price, 0::numeric), 365.0 / NULLIF(CURRENT_DATE - pb.entry_date, 0)::numeric) - 1::numeric
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
            WHEN lp.is_measurable AND CURRENT_DATE > pb.entry_date THEN power(lp.current_price / NULLIF(pb.entry_price, 0::numeric), 365.0 / NULLIF(CURRENT_DATE - pb.entry_date, 0)::numeric) - 1::numeric
            ELSE NULL::numeric
        END) DESC NULLS LAST;
