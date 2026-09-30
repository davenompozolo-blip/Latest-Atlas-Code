-- Sold names lingered two days. The sync was not at fault. (2026-08-26)
--
-- Four names sold on 2026-08-24 (AHR, BABA, NPSNY, VWAGY) were still refused as
-- `ledger_mismatch` by the return engine and still rendering as live holdings in
-- `vw_performance_suite` on 08-26 — two days after the sale.
--
-- Neither theory about why was right.
--
--   "Clears at UTC rollover."  It did not. It took two days.
--
--   "The sync upserts current positions and never deletes departed ones, so the
--    rows persist indefinitely and older phantoms are probably accumulating."
--    It does not retain them. The Alpaca sync writes a correct per-date
--    snapshot: 08-24 carries 70 rows, 08-25 and 08-26 carry 62, and the eight
--    sold names are simply absent from the newer dates. A sweep of the latest
--    snapshot for any name the ledger says is closed returns ZERO rows. There
--    are no older phantoms.
--
-- The persistence was in these two views, not in the data. Both scoped
-- positions as
--
--     as_of_date >= (select max(as_of_date) - 2 from positions)
--
-- with `DISTINCT ON (asset_id) ORDER BY as_of_date DESC`, which keeps a sold
-- name's final row selectable for two more days. The window exists to tolerate a
-- missed sync, but the way it does so is to mix dates — and mixing dates invents
-- a holding, because "the most recent row within two days" is not the same claim
-- as "currently held".
--
-- Scoping to the latest date that actually has data keeps the tolerance and
-- drops the invention: if tonight's sync never runs, `max(as_of_date)` is
-- yesterday and the views read a complete yesterday. What they can no longer do
-- is carry a name out of one snapshot forward into another.
--
-- The eight split four/four under the old behaviour purely by residue: BIDU,
-- CVX, DD and PROSY left a final row with quantity 0, which `latest_pos` already
-- filtered, so they vanished at once. The four with a non-zero final quantity did
-- not. That the symptom depended on whether the broker happened to leave dust is
-- itself the argument against the window.
--
-- Result: engine refusals 8 -> 4. The four that remain are the real ones (GDX,
-- OILK, PBR missing transactions; KMTUY dark feed). `vw_performance_suite`
-- 63 -> 59 rows, zero phantoms.
--
-- `nav_reconciliation` needed no change and gets none. It sums
-- `as_of_date = current_date`, so it only ever saw the sale-day rows: it failed
-- at 2.32% on 08-24 and passed at 0.0000% on 08-25. That one really was
-- transient.

-- ---------------------------------------------------------------------------
-- The change, in both places, is this predicate:
--     WAS:  p.as_of_date >= (SELECT max(as_of_date) - 2 FROM positions)
--     NOW:  p.as_of_date  = (SELECT max(as_of_date)     FROM positions)
-- Everything else in both views is unchanged from the migrations that precede
-- this one. `CREATE OR REPLACE`, not DROP: mv_position_returns depends on
-- vw_position_returns and neither column list changes.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.vw_performance_suite AS
 WITH latest_pos_snapshot AS (
         SELECT DISTINCT ON (p.asset_id) p.asset_id, p.quantity, p.average_cost,
            p.market_value, p.as_of_date, p.side
           FROM positions p JOIN assets a_1 ON a_1.id = p.asset_id
          WHERE p.as_of_date = (SELECT max(positions.as_of_date) FROM positions)
            AND NOT (a_1.asset_class = 'option'::text AND a_1.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'::text AND to_date("substring"(a_1.symbol, '(\d{6})[CP]'::text), 'YYMMDD'::text) < CURRENT_DATE)
          ORDER BY p.asset_id, p.as_of_date DESC
        ), latest_pos AS (
         SELECT * FROM latest_pos_snapshot
          WHERE quantity IS NOT NULL AND quantity <> 0::numeric
            AND (market_value IS NULL OR abs(market_value) > 0.01)
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
             LEFT JOIN price_history ph ON ph.asset_id = pb_1.asset_id AND ph."interval" = '1d'::text
              AND ph.price_date >= pb_1.entry_date AND ph.price_date <= (pb_1.entry_date + '30 days'::interval)
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
             LEFT JOIN equity_cache ec ON ec.symbol = a_1.symbol AND ec.endpoint = 'overview'::text
              AND ec.expires_at > (now() - '48:00:00'::interval)
          WHERE (a_1.id IN (SELECT position_base.asset_id FROM position_base))
        )
 SELECT a.symbol, a.name,
    COALESCE(sl.av_sector, a.sector, 'Other'::text) AS sector,
    pb.market_value, pb.side, pb.entry_price, pb.entry_date, lp.current_price,
    round((1::numeric - (pb.entry_price - per.low_30d_post_entry) / NULLIF(per.high_30d_post_entry - per.low_30d_post_entry, 0::numeric)) * 100::numeric, 1) AS entry_efficiency_score,
        CASE WHEN lp.is_measurable THEN (lp.current_price - pb.entry_price) / NULLIF(pb.entry_price, 0::numeric)
             ELSE NULL::numeric END AS total_return_pct,
        CASE WHEN lp.is_measurable AND (CURRENT_DATE - pb.entry_date) >= 90
             THEN power(lp.current_price / NULLIF(pb.entry_price, 0::numeric), 365.0 / NULLIF(CURRENT_DATE - pb.entry_date, 0)::numeric) - 1::numeric
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
        CASE WHEN lp.is_measurable AND (CURRENT_DATE - pb.entry_date) >= 90
             THEN power(lp.current_price / NULLIF(pb.entry_price, 0::numeric), 365.0 / NULLIF(CURRENT_DATE - pb.entry_date, 0)::numeric) - 1::numeric
             ELSE NULL::numeric END) DESC NULLS LAST;

CREATE OR REPLACE VIEW public.vw_position_returns AS
 WITH cf AS (
     SELECT c.* FROM vw_position_cash_flows c
       JOIN assets a ON a.id = c.asset_id
      WHERE COALESCE(lower(a.asset_class), '') NOT LIKE '%option%'
        AND a.symbol !~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'
 ), broker AS (
     SELECT DISTINCT ON (p.asset_id) p.asset_id, p.quantity AS broker_qty
       FROM positions p
      WHERE p.as_of_date = (SELECT max(positions.as_of_date) FROM positions)
      ORDER BY p.asset_id, p.as_of_date DESC
 ), runq AS (
     SELECT z.asset_id, min(z.running) AS min_running
       FROM ( SELECT cf.asset_id,
                sum(cf.qty_delta) OVER (PARTITION BY cf.asset_id
                     ORDER BY cf.flow_date, cf.flow_kind
                     ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running
                FROM cf WHERE cf.flow_kind <> 'mark') z
      GROUP BY z.asset_id
 ), agg AS (
     SELECT cf.asset_id, cf.symbol,
        min(cf.flow_date) FILTER (WHERE cf.flow_kind <> 'mark') AS first_flow_date,
        max(cf.flow_date) FILTER (WHERE cf.flow_kind <> 'mark') AS last_trade_date,
        max(cf.flow_date) AS schedule_end_date,
        max(cf.mark_days_old) AS mark_days_old,
        max(cf.mark_price_date) AS mark_price_date,
        count(*) FILTER (WHERE cf.flow_kind = 'buy')  AS n_buys,
        count(*) FILTER (WHERE cf.flow_kind = 'sell') AS n_sells,
        bool_or(cf.flow_kind = 'mark') AS is_open,
        sum(cf.qty_delta) FILTER (WHERE cf.flow_kind <> 'mark') AS net_qty,
        sum(-cf.flow_usd) FILTER (WHERE cf.flow_kind = 'buy')  AS capital_deployed_usd,
        sum(cf.flow_usd)  FILTER (WHERE cf.flow_kind = 'sell') AS proceeds_usd,
        sum(cf.flow_usd)  FILTER (WHERE cf.flow_kind = 'mark') AS terminal_value_usd,
        sum(cf.flow_usd) AS net_pnl_usd,
        array_agg(cf.flow_date ORDER BY cf.flow_date, cf.flow_kind) AS flow_dates,
        array_agg(cf.flow_usd  ORDER BY cf.flow_date, cf.flow_kind) AS flow_amounts
       FROM cf GROUP BY cf.asset_id, cf.symbol
 ), calc AS (
     SELECT a.*,
        (r.min_running >= -1e-6::numeric) AS ledger_complete,
        COALESCE(b.broker_qty, 0::numeric) AS broker_qty,
        (abs(COALESCE(b.broker_qty, 0::numeric) - a.net_qty)
            <= GREATEST(0.01::numeric, abs(a.net_qty) * 0.001::numeric)) AS broker_reconciles,
        (a.schedule_end_date - a.first_flow_date)::int AS days_held,
        p0.close AS window_open_price,
        p1.close AS window_close_price,
        public.atlas_mwr_period(a.flow_dates, a.flow_amounts) AS mwr_period,
        self_cf.cf_mwr_period_pct AS mwr_close_basis
       FROM agg a
       JOIN runq r ON r.asset_id = a.asset_id
       LEFT JOIN broker b ON b.asset_id = a.asset_id
       LEFT JOIN LATERAL public.atlas_counterfactual(a.asset_id, a.asset_id) self_cf ON true
       LEFT JOIN LATERAL ( SELECT ph.close FROM price_history ph
              WHERE ph.asset_id = a.asset_id AND ph."interval" = '1d'::text
                AND ph.price_date <= a.first_flow_date
              ORDER BY ph.price_date DESC LIMIT 1) p0 ON true
       LEFT JOIN LATERAL ( SELECT ph.close FROM price_history ph
              WHERE ph.asset_id = a.asset_id AND ph."interval" = '1d'::text
                AND ph.price_date <= a.schedule_end_date
              ORDER BY ph.price_date DESC LIMIT 1) p1 ON true
 ), graded AS (
     SELECT c.*,
        CASE
            WHEN NOT c.broker_reconciles                         THEN 'ledger_mismatch'
            WHEN NOT c.ledger_complete                           THEN 'incomplete_ledger'
            WHEN c.is_open AND COALESCE(c.mark_days_old, 0) > 7  THEN 'stale_mark'
            WHEN c.mwr_period IS NULL                            THEN 'no_rate'
            ELSE 'measured'
        END AS engine_status
       FROM calc c
 )
 SELECT g.asset_id, g.symbol,
    CASE WHEN g.is_open THEN 'open'::text ELSE 'closed'::text END AS position_state,
    g.engine_status,
    CASE g.engine_status
        WHEN 'ledger_mismatch'   THEN 'ledger ' || round(g.net_qty, 4)::text || ' sh vs broker ' || round(g.broker_qty, 4)::text
        WHEN 'incomplete_ledger' THEN 'running quantity reaches ' || round(g.net_qty, 4)::text
        WHEN 'stale_mark'        THEN 'mark_days_old=' || g.mark_days_old::text
        WHEN 'no_rate'           THEN 'no sign change or unbracketed root'
        ELSE NULL::text
    END AS engine_reason,
    g.first_flow_date, g.last_trade_date, g.schedule_end_date, g.days_held,
    g.n_buys, g.n_sells,
    round(g.net_qty, 8) AS net_qty,
    round(g.broker_qty, 8) AS broker_qty,
    round(g.capital_deployed_usd, 2) AS capital_deployed_usd,
    round(COALESCE(g.proceeds_usd, 0), 2) AS proceeds_usd,
    round(COALESCE(g.terminal_value_usd, 0), 2) AS terminal_value_usd,
    CASE WHEN g.engine_status IN ('measured', 'no_rate')
         THEN round(g.net_pnl_usd, 2) END AS net_pnl_usd,
    CASE WHEN g.engine_status IN ('measured', 'no_rate') AND g.capital_deployed_usd > 0
         THEN round(g.net_pnl_usd / g.capital_deployed_usd, 6) END AS simple_return_pct,
    CASE WHEN g.engine_status = 'measured'
         THEN round(g.mwr_period::numeric, 6) END AS position_mwr_period_pct,
    CASE WHEN g.engine_status = 'measured'
         THEN round(g.mwr_close_basis::numeric, 6) END AS position_mwr_close_basis_pct,
    CASE WHEN g.engine_status = 'measured' AND g.mwr_close_basis IS NOT NULL
         THEN round((g.mwr_period - g.mwr_close_basis)::numeric, 6) END AS execution_effect_pp,
    CASE WHEN g.engine_status = 'measured' AND g.days_held >= 90
         THEN round((power(1 + g.mwr_period, 365.0 / g.days_held) - 1)::numeric, 6) END AS position_mwr_pct,
    (g.days_held >= 90) AS mwr_annualisable,
    CASE WHEN g.engine_status = 'measured' AND g.window_open_price > 0
         THEN round(g.window_close_price / g.window_open_price - 1, 6) END AS position_twr_pct,
    g.window_open_price, g.window_close_price, g.mark_days_old, g.mark_price_date,
    g.ledger_complete, g.broker_reconciles, g.flow_dates, g.flow_amounts
   FROM graded g;
