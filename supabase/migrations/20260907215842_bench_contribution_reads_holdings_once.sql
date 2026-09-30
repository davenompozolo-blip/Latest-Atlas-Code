-- ============================================================
-- ...and it still read `vw_nexus_holdings` twice
-- ------------------------------------------------------------
-- Removing the daily-to-nav nested loop took the view from 13.9s to a
-- 1.0-2.5s band. Against a 3,000 ms cap that is not finished: 2.5s cold is
-- the "sitting ON the ceiling, not under it" case this file already
-- describes, where the failures land per-call on whichever request meets a
-- colder buffer cache and never reproduce on demand.
--
-- The `coverage` CTE existed only to compute one scalar -- the weighted share
-- of the book that `agg` covers -- and did it with a SECOND full read of
-- `vw_nexus_holdings`, attached by CROSS JOIN. That view is not cheap: it
-- carries two seq scans of `equity_cache` behind it.
--
-- The same scalar is a window over the read the query already performs:
--
--   sum(weight_pct) FILTER (WHERE a.symbol IS NOT NULL) OVER ()
--     / sum(weight_pct) OVER ()
--
-- Verified equal to the CROSS JOIN version (100.00 both ways) before applying.
--
-- **Count the reads of an expensive view before optimising the joins between
-- them.** One scalar is not a reason to scan a book twice.
-- ============================================================

CREATE OR REPLACE VIEW public.vw_bench_contribution AS
WITH daily AS (
    SELECT v.price_date,
           v.symbol,
           sum(v.position_value) AS pos_val,
           max(v.close_price)    AS close_price
      FROM vw_position_nav_daily v
     WHERE v.close_price IS NOT NULL AND v.position_value IS NOT NULL
     GROUP BY v.price_date, v.symbol
),
daily_nav AS (
    SELECT d.*, sum(d.pos_val) OVER (PARTITION BY d.price_date) AS total_nav
      FROM daily d
),
seq AS (
    SELECT price_date, symbol, close_price,
           lag(close_price) OVER w AS prev_close,
           lag(pos_val)     OVER w AS prev_pos_val,
           lag(total_nav)   OVER w AS prev_nav
      FROM daily_nav
    WINDOW w AS (PARTITION BY symbol ORDER BY price_date)
),
contrib AS (
    SELECT seq.price_date, seq.symbol,
           (seq.close_price / seq.prev_close - 1::numeric)
             * (seq.prev_pos_val / seq.prev_nav) * 100::numeric AS contrib_pct
      FROM seq
     WHERE seq.prev_close > 0::numeric AND seq.prev_nav > 0::numeric
       AND seq.prev_pos_val IS NOT NULL
),
last_day AS (
    SELECT max(contrib.price_date) AS d FROM contrib WHERE contrib.contrib_pct IS NOT NULL
),
agg AS (
    SELECT contrib.symbol,
           round(COALESCE(sum(contrib.contrib_pct)
                 FILTER (WHERE contrib.price_date = (SELECT last_day.d FROM last_day)), 0::numeric), 3) AS contrib_today,
           round(sum(contrib.contrib_pct)
                 FILTER (WHERE contrib.price_date >= date_trunc('year'::text, CURRENT_DATE::timestamp with time zone)::date), 3) AS contrib_ytd,
           round(sum(contrib.contrib_pct), 3) AS contrib_since_entry,
           min(contrib.price_date) AS series_start,
           max(contrib.price_date) AS series_end,
           count(*) AS observations
      FROM contrib
     WHERE contrib.contrib_pct IS NOT NULL
     GROUP BY contrib.symbol
)
SELECT h.symbol,
       a.contrib_today,
       a.contrib_ytd,
       a.contrib_since_entry,
       a.series_start,
       a.series_end,
       COALESCE(a.observations, 0::bigint) AS observations,
       a.symbol IS NOT NULL AS covered,
       CASE
           WHEN a.symbol IS NOT NULL THEN NULL::text
           WHEN NOT (EXISTS (SELECT 1
                               FROM vw_filled_transactions t
                               JOIN assets s ON s.id = t.asset_id
                              WHERE s.symbol = h.symbol)) THEN 'no_transaction_history'::text
           ELSE 'no_priced_position_days'::text
       END AS coverage_reason,
       h.weight_pct AS actual_weight_pct,
       -- One read of the book, not two.
       round(100.0 * sum(h.weight_pct) FILTER (WHERE a.symbol IS NOT NULL) OVER ()
             / NULLIF(sum(h.weight_pct) OVER (), 0::numeric), 2) AS nav_coverage_pct
  FROM vw_nexus_holdings h
  LEFT JOIN agg a ON a.symbol = h.symbol;

COMMENT ON VIEW public.vw_bench_contribution IS
'Per-holding contribution to book return. Read by /api/nexus-bench for the '
'Nexus Contribution panel, over the anon role and therefore under a 3s '
'statement timeout - time it as anon, not as service_role, before changing it.';
