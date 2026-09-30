-- Sold names lingered for two days. The sync was not at fault (2026-08-26)
--
-- Four names sold on 08-24 (AHR, BABA, NPSNY, VWAGY) were still being refused
-- as `ledger_mismatch` and still rendering as live holdings in
-- `vw_performance_suite` on 08-26, two days later.
--
-- Neither hypothesis about why was right:
--   * "clears at UTC rollover" (mine) - it did not; it took two days.
--   * "the sync never deletes departed rows, so they persist indefinitely and
--     older phantoms are probably accumulating" - it does not retain them. The
--     Alpaca sync writes a correct per-date snapshot: 08-24 has 70 rows, 08-25
--     and 08-26 have 62, and the eight sold names are simply absent from the
--     newer dates. A sweep of the latest snapshot for names the ledger says are
--     closed returns **zero** rows. There are no older phantoms.
--
-- The persistence was in *these views*, not in the data. Both scoped positions
-- as `as_of_date >= max(as_of_date) - 2` with `DISTINCT ON (asset_id) ORDER BY
-- as_of_date DESC`, which keeps a sold name's final row selectable for two more
-- days. That window exists to tolerate a missed sync, but the way it does so is
-- to mix dates - and mixing dates invents a holding, because "the most recent
-- row within two days" is not the same claim as "currently held".
--
-- Scoping to the latest date that actually has data keeps the tolerance and
-- drops the invention: if tonight's sync never runs, `max(as_of_date)` is
-- yesterday and the views read a complete yesterday. What they can no longer do
-- is carry a name forward out of one snapshot into another.
--
-- The eight split four/four on the old behaviour purely by residue: BIDU, CVX,
-- DD and PROSY left a final row with quantity 0, which `latest_pos` already
-- filtered, so they vanished immediately. The four with a non-zero final
-- quantity did not. That the symptom depended on whether the broker happened to
-- leave dust is itself the argument against the window.
--
-- `nav_reconciliation` is a separate, genuinely transient case and needs no
-- change: it sums `as_of_date = current_date`, so it only ever saw the sale-day
-- rows. It failed at 2.32% on 08-24 and passed at 0.0000% on 08-25.

CREATE OR REPLACE VIEW public.vw_performance_suite AS
 WITH latest_pos_snapshot AS (
         SELECT DISTINCT ON (p.asset_id) p.asset_id, p.quantity, p.average_cost,
            p.market_value, p.as_of_date, p.side
           FROM positions p JOIN assets a_1 ON a_1.id = p.asset_id
          WHERE p.as_of_date = (SELECT max(positions.as_of_date) FROM positions)
            AND NOT (a_1.asset_class = 'option'::text AND a_1.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'::text AND to_date("substring"(a_1.symbol, '(\d{6})[CP]'::text), 'YYMMDD'::text) < CURRENT_DATE)
          ORDER BY p.asset_id, p.as_of_date DESC
        ), latest_pos AS (
         SELECT latest_pos_snapshot.asset_id, latest_pos_snapshot.quantity,
            latest_pos_snapshot.average_cost, latest_pos_snapshot.market_value,
            latest_pos_snapshot.as_of_date, latest_pos_snapshot.side
           FROM latest_pos_snapshot
          WHERE latest_pos_snapshot.quantity IS NOT NULL AND latest_pos_snapshot.quantity <> 0::numeric AND (latest_pos_snapshot.market_value IS NULL OR abs(latest_pos_snapshot.market_value) > 0.01)
        ), first_buys AS (
         SELECT DISTINCT ON (t.asset_id) t.asset_id, t.price AS tx_entry_price,
            t.transaction_date AS tx_entry_date
           FROM vw_filled_transactions t JOIN assets a_1 ON a_1.id = t.asset_id
          WHERE lower(t.transaction_type) ~~ '%buy%'::text AND a_1.symbol <> '$CASH'::text
          ORDER BY t.asset_id, t.transaction_date
        ), position_base AS (
         SELECT lp_1.asset_id, lp_1.market_value, lp_1.side,
            COALESCE(fb.tx_entry_price, lp_1.average_cost) AS entry_price,
            COALESCE(fb.tx_entry_date::date, lp_1.as_of_date) AS entry_date
           FROM latest_pos lp_1 LEFT JOIN first_buys fb ON fb.asset_id = lp_1.asset_id
        ), post_entry_range AS (
         SELECT pb_1.asset_id, max(ph.high) AS high_30d_post_entry, min(ph.low) AS low_30d_post_entry
           FROM position_base pb_1
             LEFT JOIN price_history ph ON ph.asset_id = pb_1.asset_id AND ph."interval" = '1d'::text AND ph.price_date >= pb_1.entry_date AND ph.price_date <= (pb_1.entry_date + '30 days'::interval)
          GROUP BY pb_1.asset_id
        ), latest_prices AS (
         SELECT pb0.asset_id, t.close AS current_price, t.price_date AS last_price_date,
            CURRENT_DATE - t.price_date AS price_days_old,
            (CURRENT_DATE - t.price_date) <= 7 AS is_measurable
           FROM position_base pb0
             CROSS JOIN LATERAL ( SELECT ph.close, ph.price_date FROM price_history ph
                  WHERE ph.asset_id = pb0.asset_id AND ph."interval" = '1d'::text
                  ORDER BY ph.price_date DESC LIMIT 1) t
        ), sector_live AS (
         SELECT a_1.id AS asset_id, NULLIF(TRIM(BOTH FROM ec.payload ->> 'Sector'::text), ''::text) AS av_sector
           FROM assets a_1
             LEFT JOIN equity_cache ec ON ec.symbol = a_1.symbol AND ec.endpoint = 'overview'::text AND ec.expires_at > (now() - '48:00:00'::interval)
          WHERE (a_1.id IN ( SELECT position_base.asset_id FROM position_base))
        )
 SELECT a.symbol, a.name,
    COALESCE(sl.av_sector, a.sector, 'Other'::text) AS sector,
    pb.market_value, pb.side, pb.entry_price, pb.entry_date, lp.current_price,
    round((1::numeric - (pb.entry_price - per.low_30d_post_entry) / NULLIF(per.high_30d_post_entry - per.low_30d_post_entry, 0::numeric)) * 100::numeric, 1) AS entry_efficiency_score,
        CASE WHEN lp.is_measurable THEN (lp.current_price - pb.entry_price) / NULLIF(pb.entry_price, 0::numeric)
             ELSE NULL::numeric END AS total_return_pct,
        CASE WHEN lp.is_measurable AND (CURRENT_DATE - pb.entry_date) >= 90 THEN power(lp.current_price / NULLIF(pb.entry_price, 0::numeric), 365.0 / NULLIF(CURRENT_DATE - pb.entry_date, 0)::numeric) - 1::numeric
             ELSE NULL::numeric END AS annualised_return,
    CURRENT_DATE - pb.entry_date AS days_held,
        CASE WHEN NOT lp.is_measurable THEN NULL::boolean
             WHEN (CURRENT_DATE - pb.entry_date) > 180 AND ((lp.current_price - pb.entry_price) / NULLIF(pb.entry_price, 0::numeric)) < 0::numeric THEN true
             ELSE false END AS cut_candidate_flag,
    lp.last_price_date, lp.price_days_old,
        CASE WHEN lp.is_measurable THEN 'measured'::text ELSE 'not_measurable'::text END AS verdict_status,
        CASE WHEN lp.is_measurable THEN NULL::text ELSE 'price_days_old='::text || lp.price_days_old::text END AS status_reason
   FROM position_base pb
     JOIN assets a ON a.id = pb.asset_id
     JOIN latest_prices lp ON lp.asset_id = pb.asset_id
     LEFT JOIN post_entry_range per ON per.asset_id = pb.asset_id
     LEFT JOIN sector_live sl ON sl.asset_id = pb.asset_id
  ORDER BY (
        CASE WHEN lp.is_measurable AND (CURRENT_DATE - pb.entry_date) >= 90 THEN power(lp.current_price / NULLIF(pb.entry_price, 0::numeric), 365.0 / NULLIF(CURRENT_DATE - pb.entry_date, 0)::numeric) - 1::numeric
             ELSE NULL::numeric END) DESC NULLS LAST;
