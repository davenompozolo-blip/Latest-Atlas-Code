DROP VIEW IF EXISTS public.vw_position_returns;

-- Per-position cash-flow return engine (memo v2 §4 step 2). Engine only.
--
-- ## Why there are two versions of the position's own return
--
-- The position's own MWR is priced at **fills**; a counterfactual is priced at
-- **closes**, because a comparable has no fills. Differencing them directly
-- would fold execution quality into what the module calls stock selection.
-- Measured by running each position as its own comparable, that is not a
-- rounding error:
--
--   SNDK  own +13.84%  close-basis  -4.87%   18.71 pp
--   AMD   own +185.94% close-basis +174.01%  11.93 pp
--   TSLA  own -43.09%  close-basis -33.18%    9.90 pp
--
-- Every divergent name has multiple sells; positions with none match to the
-- last decimal. SNDK's sells realised $512.75 more than that day's closes.
--
-- So the engine publishes both, and the head-to-head decomposes cleanly:
--
--   selection effect = cf(me, peer)            - position_mwr_close_basis_pct
--   execution effect = position_mwr_period_pct - position_mwr_close_basis_pct
--
-- Selection compares like with like - both legs close-priced, differing only
-- in the symbol, which is the question §2.4 actually asks. Execution is the
-- same symbol on two pricing bases, and answers a question the memo does not
-- pose but a trader will: did I pick well, or did I trade well?
--
-- `position_mwr_period_pct` remains the true return of the position and the
-- ranking input. `position_mwr_close_basis_pct` exists only to make the
-- comparison fair, and is never itself a headline.
--
-- ## Refusals (unchanged)
--   ledger_mismatch    ledger net quantity disagrees with the broker's - the
--                      divergences are exact round lots (PBR -500 sh, GDX -100,
--                      NPSNY +27), so these are missing transactions, not drift
--   incomplete_ledger  running quantity goes negative
--   stale_mark         open, mark price more than 7 days old (§2.6 one_sided)
--   no_rate            no sign change, or a root not bracketed
--
-- Options excluded: no peer set in `universe_correlations`, and `asset_class`
-- is 'us_option' rather than 'option', so both the class prefix and the OCC
-- symbol shape are tested - equality on either alone has been wrong here.

CREATE VIEW public.vw_position_returns AS
 WITH cf AS (
     SELECT c.* FROM vw_position_cash_flows c
       JOIN assets a ON a.id = c.asset_id
      WHERE COALESCE(lower(a.asset_class), '') NOT LIKE '%option%'
        AND a.symbol !~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'
 ), broker AS (
     SELECT DISTINCT ON (p.asset_id) p.asset_id, p.quantity AS broker_qty
       FROM positions p
      WHERE p.as_of_date >= (SELECT max(positions.as_of_date) - 2 FROM positions)
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
       FROM cf
      GROUP BY cf.asset_id, cf.symbol
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
 SELECT g.asset_id,
    g.symbol,
    CASE WHEN g.is_open THEN 'open'::text ELSE 'closed'::text END AS position_state,
    g.engine_status,
    CASE g.engine_status
        WHEN 'ledger_mismatch'   THEN 'ledger ' || round(g.net_qty, 4)::text || ' sh vs broker ' || round(g.broker_qty, 4)::text
        WHEN 'incomplete_ledger' THEN 'running quantity reaches ' || round(g.net_qty, 4)::text
        WHEN 'stale_mark'        THEN 'mark_days_old=' || g.mark_days_old::text
        WHEN 'no_rate'           THEN 'no sign change or unbracketed root'
        ELSE NULL::text
    END AS engine_reason,
    g.first_flow_date,
    g.last_trade_date,
    g.schedule_end_date,
    g.days_held,
    g.n_buys,
    g.n_sells,
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
    g.window_open_price,
    g.window_close_price,
    g.mark_days_old,
    g.mark_price_date,
    g.ledger_complete,
    g.broker_reconciles,
    g.flow_dates,
    g.flow_amounts
   FROM graded g;

COMMENT ON VIEW public.vw_position_returns IS
 'Cash-flow-matched return engine per position. `position_mwr_period_pct` is the true (fill-priced) money-weighted return over the holding period and the ranking input. `position_mwr_close_basis_pct` is the same position priced at closes - the like-for-like baseline a counterfactual must be differenced against, so that selection is not contaminated by execution; their gap is `execution_effect_pp`. Figures NULL unless engine_status = ''measured''.';
