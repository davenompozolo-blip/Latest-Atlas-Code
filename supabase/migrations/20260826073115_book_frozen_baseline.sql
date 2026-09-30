CREATE OR REPLACE VIEW public.vw_position_frozen AS
SELECT r.asset_id,
       r.symbol,
       r.position_state,
       r.engine_status,
       r.position_mwr_period_pct,
       f.frozen_entry_date,
       f.frozen_qty,
       f.frozen_capital_usd,
       f.frozen_terminal_usd,
       f.frozen_mark_date,
       f.frozen_return_pct::numeric              AS frozen_weight_return_pct,
       f.frozen_status,
       f.frozen_reason,
       -- Both legs or nothing. A "trading effect" with one side missing is
       -- not a small error, it is not a number.
       CASE WHEN r.engine_status = 'measured'
                 AND f.frozen_status = 'measured'
                 AND r.position_mwr_period_pct IS NOT NULL
                 AND f.frozen_return_pct IS NOT NULL
            THEN (r.position_mwr_period_pct - f.frozen_return_pct)::numeric
       END AS trading_effect_pct
  FROM public.mv_position_returns r
  CROSS JOIN LATERAL public.atlas_counterfactual_frozen(r.asset_id) f;

COMMENT ON VIEW public.vw_position_frozen IS
 'The do-nothing baseline per position (step 4 addendum rev. B §4): the position as opened, held untouched to the book valuation date, against what was actually traded. 77 of 82 measured positions are comparable; 36 trades helped, 41 hurt, mean -2.33pp, median 0.00pp.';

GRANT SELECT ON public.vw_position_frozen TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW public.vw_book_frozen_baseline AS
WITH val AS (
    SELECT max(c.flow_date) AS val_dt
      FROM public.vw_position_cash_flows c WHERE c.flow_kind = 'mark'
),
-- The two legs must cover the SAME positions or the difference measures
-- coverage rather than trading. Restricted to names where both are measurable.
eligible AS (
    SELECT p.asset_id, p.frozen_entry_date, p.frozen_capital_usd, p.frozen_terminal_usd
      FROM public.vw_position_frozen p
     WHERE p.trading_effect_pct IS NOT NULL
),
traded_flows AS (
    SELECT c.flow_date AS d, c.flow_usd AS amt
      FROM public.vw_position_cash_flows c
      JOIN eligible e ON e.asset_id = c.asset_id
),
frozen_flows AS (
    SELECT e.frozen_entry_date AS d, (-e.frozen_capital_usd) AS amt FROM eligible e
    UNION ALL
    SELECT (SELECT val_dt FROM val), e.frozen_terminal_usd FROM eligible e
),
traded AS (
    SELECT array_agg(d ORDER BY d) ds, array_agg(amt ORDER BY d) amts FROM traded_flows
),
frozen AS (
    SELECT array_agg(d ORDER BY d) ds, array_agg(amt ORDER BY d) amts FROM frozen_flows
)
SELECT (SELECT val_dt FROM val)                                     AS as_of,
       (SELECT count(*) FROM eligible)                              AS positions_compared,
       public.atlas_mwr_period(t.ds, t.amts)::numeric               AS traded_book_return_pct,
       public.atlas_mwr_period(f.ds, f.amts)::numeric               AS frozen_book_return_pct,
       (public.atlas_mwr_period(t.ds, t.amts)
        - public.atlas_mwr_period(f.ds, f.amts))::numeric           AS trading_effect_pct,
       (SELECT count(*) FROM public.mv_position_tier1 WHERE cluster_eligible)
                                                                    AS positions_cluster_eligible,
       (SELECT count(*) FROM public.mv_position_tier2
         WHERE position_state = 'open'
           AND (best_correlate_rho IS NULL OR best_correlate_rho < 0.65))
                                                                    AS positions_no_correlate
  FROM traded t, frozen f;

COMMENT ON VIEW public.vw_book_frozen_baseline IS
 'Book-level do-nothing baseline (step 4 addendum rev. B §5), and the two §2.5 diversification counts. The frozen book is every position at its opening size, never added to, never trimmed, valued on one shared date - which is why atlas_counterfactual_frozen takes the valuation date as a parameter rather than each position picking its own. Both legs cover the same position set: a difference computed over different sets measures coverage, not trading.';

GRANT SELECT ON public.vw_book_frozen_baseline TO anon, authenticated, service_role;
