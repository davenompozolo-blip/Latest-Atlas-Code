-- ============================================================
-- `vw_position_frozen` computes the valuation date once, not 86 times
-- ------------------------------------------------------------
-- Found while putting a browser surface on this view for the first time. It
-- ran at **2,768 ms** against `anon`'s 3,000 ms statement timeout — sitting on
-- the ceiling exactly as `vw_portfolio_home` and `nexus_holdings` were in the
-- 2026-08-18 entry, where every call landing on a colder buffer cache was
-- cancelled with `57014` and the failures never reproduced on demand.
--
-- Nothing had noticed because nothing had read it from the browser. Its only
-- consumers were the nightly verdict job and `vw_book_frozen_baseline`, both
-- of which run as `service_role` at a 300 s cap, where 2.8 s is invisible.
--
-- ## The cost is one argument that was not passed
--
-- `atlas_counterfactual_frozen(asset_id, p_valuation_date)` opens with
--
--     val_dt := COALESCE(p_valuation_date,
--                        (SELECT max(flow_date) FROM vw_position_cash_flows
--                          WHERE flow_kind = 'mark'));
--
-- and the view called it with the argument omitted. So every one of the 86
-- LATERAL invocations re-derived the same single date by re-evaluating the
-- whole of `vw_position_cash_flows` — which is itself a join over
-- `transactions` plus a `price_history` probe per held asset. One date,
-- computed 86 times, from the most expensive view in the return engine.
--
-- Hoisting it into a CTE and passing it in: **2,768 ms → 803 ms**, a 3.4×
-- reduction with no change to the function and no change to the output.
--
-- This is the "a scalar subquery is evaluated once per reference" trap from
-- 2026-08-23 in a new shape: there the repetition was three references inside
-- one query, here it is one reference inside a function called 86 times. Same
-- fix — compute it once, hand it down.
--
-- ## Safe because it is the same expression
--
-- The hoisted CTE is character-for-character the function's own fallback. If
-- it yields NULL the argument is NULL and the COALESCE falls through to the
-- identical internal query, so the null path is unchanged too.
--
-- Proven rather than argued: both definitions built side by side in one
-- transaction and diffed with `EXCEPT ALL` in both directions —
-- `old_rows=86 new_rows=86 old_minus_new=0 new_minus_old=0 => IDENTICAL` —
-- then rolled back. The nightly job and the book baseline read this view, so
-- "it should be the same" was not good enough.
--
-- Column list, order and types are untouched: `CREATE OR REPLACE VIEW` cannot
-- reorder or rename a column (`42P16`), and this change deliberately does not
-- try to.
-- ============================================================

CREATE OR REPLACE VIEW public.vw_position_frozen AS
WITH val AS (
    SELECT max(c.flow_date) AS d
      FROM public.vw_position_cash_flows c
     WHERE c.flow_kind = 'mark'
)
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
       f.frozen_return_pct::numeric AS frozen_weight_return_pct,
       f.frozen_status,
       f.frozen_reason,
       CASE
           WHEN r.engine_status = 'measured'
            AND f.frozen_status = 'measured'
            AND r.position_mwr_period_pct IS NOT NULL
            AND f.frozen_return_pct IS NOT NULL
           THEN (r.position_mwr_period_pct::double precision - f.frozen_return_pct)::numeric
           ELSE NULL::numeric
       END AS trading_effect_pct
  FROM public.mv_position_returns r
  CROSS JOIN LATERAL public.atlas_counterfactual_frozen(r.asset_id, (SELECT val.d FROM val))
       f(frozen_entry_date, frozen_qty, frozen_capital_usd, frozen_terminal_usd,
         frozen_mark_price, frozen_mark_date, frozen_return_pct, frozen_status, frozen_reason);
