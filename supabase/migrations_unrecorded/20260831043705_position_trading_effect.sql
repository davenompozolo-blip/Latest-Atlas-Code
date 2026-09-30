-- ============================================================
-- The per-position trading-effect drill-down
-- memo v2 close-out §5.1 — "keep `trading_effect_pct` per row for drill-down"
-- ------------------------------------------------------------
-- §5.1 put the do-nothing baseline on the scorecard at BOOK level and said the
-- per-row figure stays available underneath. This is that layer. It exists
-- because three things about the book number are not visible from it, and two
-- of them will mislead a reader who drills in on the obvious substrate.
--
-- ## 1. Rates do not add up. Dollars do.
--
-- `vw_book_frozen_baseline` is an MWR over POOLED cash flows — every eligible
-- position's traded flows in one schedule, every position's frozen flows in
-- another, each solved by `atlas_mwr_period`. It is not a weighted average of
-- the per-position rates and no weighting recovers it. Anything that ranks
-- positions by `trading_effect_pct` and implies the column explains −1.03pp is
-- asserting an identity that does not hold.
--
-- What does decompose exactly is money. Each position's frozen path invests
-- `frozen_capital_usd` and ends at `frozen_terminal_usd`; its traded path is
-- the cash-flow schedule, whose signed sum is the traded gain. The difference
-- is additive across positions by construction, and on 2026-08-28 it sums to
-- **−$4,033.51** against a traded gain of $12,829.57 and a frozen gain of
-- $16,863.08.
--
-- So this view publishes BOTH, and the dollar column is the sort key. The two
-- will not tie to each other arithmetically — MWR time-weights capital and a
-- dollar difference does not — and that is stated on the surface rather than
-- papered over. They agree on the sign of the book verdict, which is the claim
-- the drill-down actually has to support.
--
-- ## 2. Dollars and rates disagree per position, and the disagreement is real
--
-- TSM is +$372 and −6.7pp. EWY is +$322 and −2.5pp. Eleven positions have
-- opposite signs in the two units and none of them is an error: the traded
-- path deployed more capital than the frozen one ($279,639 against $182,087
-- across the book), so adding to a name that kept rising makes more money at a
-- lower rate. `effects_disagree` marks those rows so the surface can say which
-- question it is answering instead of letting the reader assume they were the
-- same question.
--
-- This is the `regret_vs_best_pct` lesson in a new place. There, ranking on
-- the wrong column graded leverage; here it would grade capital deployed.
--
-- ## 3. The closed positions carry the whole number, and the verdict history
--    cannot see them
--
-- `position_verdicts` holds 57 rows a night — the OPEN book. The baseline
-- compares 77 positions, and the 21 closed ones absent from the history carry
-- **−$4,020.58 of the −$4,033.49**. The 56 open positions that are in the
-- history net −$12.91.
--
-- A drill-down built on `position_verdicts` — the natural choice, since it is
-- the aligned append-only history and already carries `trading_effect_pct` —
-- would therefore show a column of near-zeros and no trace of the number it
-- claims to explain. That is why this reads the live `vw_position_frozen`
-- instead, and why the surface must show its own `as_of` rather than inherit
-- the tile's: a live read beside a nightly row is the mixed-basis failure, and
-- the honest handling is to publish both dates.
--
-- The finding underneath is the drill-down's actual content. Selling is what
-- cost the money; resizing was a wash:
--
--   exit       21 positions   −$4,020.58
--   resized    42 positions      −$12.91
--   untouched  14 positions        $0.00
--
-- ## 4. An untouched position's effect is exactly zero, and the solver says 4e-7
--
-- A position bought once and never traded again has a frozen path identical to
-- its traded path. The effect is not small, it is zero by construction — but
-- `atlas_mwr_period` bisects to a tolerance and `position_mwr_period_pct` is
-- stored to 6dp, so the subtraction lands on ~1e-7 with an arbitrary sign.
-- Published raw that is fourteen positions of meaningless ±0.00004pp sorted
-- against each other.
--
-- These are snapped to zero, and the test is STRUCTURAL, not a magnitude
-- floor: one transaction and still open. A magnitude floor would be wrong here
-- and the data proves it — the largest untouched residual is 4.66e-7 while the
-- smallest genuinely-traded effect is 3.98e-8, an order of magnitude BELOW it.
-- Any threshold that caught the noise would also erase real measurements.
--
-- `structural_zero_breach` is the safeguard on the snap. A position classed
-- untouched whose raw effect exceeds 100× the observed residual is not snapped
-- and is flagged instead: at that size the classification or the counter-
-- factual is wrong, and silently zeroing it would hide the defect. Bounds are
-- 100× measured, not chosen — 1e-4 against a 4.66e-7 rate residual, $0.50
-- against a $0.005 dollar residual.
--
-- ## 5. Nine positions cannot be compared at all, and they say why
--
-- Comparability is not re-derived here; the row is comparable exactly when the
-- engine published a `trading_effect_pct`, so this cannot drift from the gate
-- the engine already applies. The reason is carried through — DD's
-- `basis_mismatch`, the GDX/PBR/OILK ledger gaps, and four OTC ADRs whose
-- frozen path has to mark to a tape 154 days dead. Note the last four read
-- `engine_status = 'measured'` with `frozen_status = 'stale_mark'`: the
-- traded return is fine and the COUNTERFACTUAL is what cannot be priced, so
-- the reason has to be read off the frozen side or it will look like nothing
-- is wrong.
--
-- ## 6. It has to run under `anon`, which the substrate did not
--
-- This is the first browser surface over `vw_position_frozen`. Measured on
-- arrival, that view took **2,768 ms** against `anon`'s 3,000 ms cap — a
-- read that would have been cancelled with `57014` on any colder cache and
-- surfaced as a panel that loads sometimes. It had never shown because its
-- only consumers ran as `service_role` at 300 s.
--
-- Fixed in the companion migration `20260831130000` (the valuation date is
-- computed once instead of 86 times) and this view carries the same discipline
-- — its `as_of` comes out of the `flows` aggregate rather than a second scan of
-- `vw_position_cash_flows`.
--
-- End to end: **2,786 ms → 727–767 ms** over four consecutive runs. The
-- remaining cost is CPU in the MWR solver rather than I/O, which is why the
-- spread is tight; per the 2026-08-18 entry the number that matters is the
-- max, and here it is 767 ms against a 3,000 ms cap.
-- ============================================================

CREATE OR REPLACE VIEW public.vw_position_trading_effect AS
WITH flows AS (
    SELECT c.asset_id,
           -- Signed sum of the schedule: buys negative, sells and the terminal
           -- mark positive. For a closed position the final sell IS the
           -- terminal, so this is the realised gain with no mark involved.
           sum(c.flow_usd)                                            AS traded_gain_usd,
           sum(CASE WHEN c.flow_usd < 0 THEN -c.flow_usd ELSE 0 END)  AS traded_capital_usd,
           count(*) FILTER (WHERE c.qty_delta > 0)                    AS n_buys,
           count(*) FILTER (WHERE c.qty_delta < 0)                    AS n_sells,
           min(c.flow_date) FILTER (WHERE c.qty_delta > 0)            AS first_buy_date,
           max(c.flow_date) FILTER (WHERE c.qty_delta <> 0)           AS last_trade_date,
           -- Carried out of this scan rather than fetched by a second one.
           -- `vw_position_cash_flows` is the most expensive read in the return
           -- engine, and referencing it twice here would evaluate it twice —
           -- the same argument that took the frozen view from 2,768 to 803 ms.
           max(c.flow_date) FILTER (WHERE c.flow_kind = 'mark')       AS mark_date
      FROM public.vw_position_cash_flows c
     GROUP BY c.asset_id
), val AS (
    -- The valuation date the whole comparison marks to. Same anchor as
    -- `vw_book_frozen_baseline`, so the two surfaces cannot silently drift on
    -- to different terminal dates.
    SELECT max(fl.mark_date) AS as_of FROM flows fl
), base AS (
    SELECT f.asset_id,
           f.symbol,
           f.position_state,
           f.engine_status,
           f.frozen_status,
           f.frozen_reason,
           f.frozen_entry_date,
           f.frozen_capital_usd,
           f.frozen_terminal_usd,
           f.frozen_mark_date,
           f.position_mwr_period_pct,
           f.frozen_weight_return_pct,
           f.trading_effect_pct                                       AS raw_effect_pct,
           coalesce(fl.n_buys, 0)                                     AS n_buys,
           coalesce(fl.n_sells, 0)                                    AS n_sells,
           fl.first_buy_date,
           fl.last_trade_date,
           fl.traded_capital_usd,
           fl.traded_gain_usd,
           (f.frozen_terminal_usd - f.frozen_capital_usd)             AS frozen_gain_usd,
           (fl.traded_gain_usd - (f.frozen_terminal_usd - f.frozen_capital_usd))
                                                                      AS raw_effect_usd,
           -- What the trading actually was. A closed position's trade is the
           -- decision to sell out; the frozen book still holds it, which is
           -- the entire point of the counterfactual.
           CASE
               WHEN f.position_state <> 'open'                        THEN 'exit'
               WHEN coalesce(fl.n_buys, 0) + coalesce(fl.n_sells, 0) > 1 THEN 'resized'
               ELSE 'untouched'
           END                                                        AS trade_kind
      FROM public.vw_position_frozen f
      LEFT JOIN flows fl ON fl.asset_id = f.asset_id
)
SELECT b.asset_id,
       b.symbol,
       b.position_state,
       (SELECT val.as_of FROM val)                                    AS as_of,
       b.trade_kind,
       b.n_buys,
       b.n_sells,
       b.first_buy_date,
       b.last_trade_date,
       b.frozen_entry_date,
       b.frozen_mark_date,

       -- Comparability is the engine's gate, read not re-derived.
       (b.raw_effect_pct IS NOT NULL)                                 AS comparable,
       CASE
           WHEN b.raw_effect_pct IS NOT NULL          THEN NULL
           WHEN b.engine_status <> 'measured'         THEN b.engine_status
           WHEN b.frozen_status <> 'measured'         THEN b.frozen_status
           ELSE 'unmeasurable'
       END                                                            AS unmeasurable_reason,
       -- The four OTC ADRs read `measured` on the position and fail on the
       -- counterfactual, so the detail has to come off the frozen side.
       CASE WHEN b.raw_effect_pct IS NULL THEN b.frozen_reason END     AS unmeasurable_detail,

       -- ── dollars: additive, the sort key ──────────────────
       CASE WHEN b.raw_effect_pct IS NULL THEN NULL ELSE b.traded_capital_usd END
                                                                      AS traded_capital_usd,
       CASE WHEN b.raw_effect_pct IS NULL THEN NULL ELSE b.frozen_capital_usd END
                                                                      AS frozen_capital_usd,
       CASE WHEN b.raw_effect_pct IS NULL THEN NULL ELSE b.traded_gain_usd END
                                                                      AS traded_gain_usd,
       CASE WHEN b.raw_effect_pct IS NULL THEN NULL ELSE b.frozen_gain_usd END
                                                                      AS frozen_gain_usd,
       CASE
           WHEN b.raw_effect_pct IS NULL THEN NULL
           WHEN b.trade_kind = 'untouched' AND abs(b.raw_effect_usd) <= 0.50 THEN 0::numeric
           ELSE b.raw_effect_usd
       END                                                            AS trading_effect_usd,

       -- ── rate: what the engine published, non-additive ────
       b.position_mwr_period_pct                                      AS traded_return_pct,
       b.frozen_weight_return_pct                                     AS frozen_return_pct,
       CASE
           WHEN b.raw_effect_pct IS NULL THEN NULL
           WHEN b.trade_kind = 'untouched' AND abs(b.raw_effect_pct) <= 0.0001 THEN 0::numeric
           ELSE b.raw_effect_pct
       END                                                            AS trading_effect_pct,

       -- ── the two flags ────────────────────────────────────
       -- Opposite signs in the two units. Not an error: the traded path
       -- deployed different capital from the frozen one.
       (b.raw_effect_pct IS NOT NULL
        AND b.trade_kind <> 'untouched'
        AND b.raw_effect_usd <> 0 AND b.raw_effect_pct <> 0
        AND sign(b.raw_effect_usd) <> sign(b.raw_effect_pct))         AS effects_disagree,

       -- A structural zero that is not zero. Never snapped, always flagged.
       (b.trade_kind = 'untouched'
        AND b.raw_effect_pct IS NOT NULL
        AND (abs(b.raw_effect_usd) > 0.50 OR abs(b.raw_effect_pct) > 0.0001))
                                                                      AS structural_zero_breach
  FROM base b;

COMMENT ON VIEW public.vw_position_trading_effect IS
    'Per-position drill-down under the do-nothing baseline (memo v2 §5.1). '
    'trading_effect_usd is additive across positions and ties to the book; '
    'trading_effect_pct is the engine rate and does NOT sum to the book MWR. '
    'Rank on dollars. Reads live vw_position_frozen, not position_verdicts, '
    'because the verdict history is open-book only and the closed exits carry '
    'essentially the whole book effect.';

GRANT SELECT ON public.vw_position_trading_effect TO anon, authenticated;
