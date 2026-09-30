-- Step 4 §8.3 — the verdict schema.
--
-- Memo v2 §3 defines `position_verdicts` as a `create table`; step 4 addendum
-- rev. B §4 defines a set of `alter table ... add column` on top of it, and §5
-- does the same for `book_risk_daily`.
--
-- **Neither table exists in production.** Memo v2 §3 was written but never
-- applied, and `book_risk_daily` only ever existed as a prose paragraph. So
-- rev. B's ALTERs have nothing to alter, and this migration has to author both
-- bases as well.
--
-- It is written as create-then-alter rather than one flattened CREATE on
-- purpose: each half diffs 1:1 against the document that specifies it, so a
-- reviewer can check §3 against the CREATE and §4 against the ALTER instead of
-- unpicking a merged column list. The four places the two documents disagree
-- are resolved below, in the open, rather than silently.
--
-- ## Where the documents conflict, and what won
--
-- 1. `peer_basis` is declared in BOTH §3 and rev. B §4. §4's real contribution
--    is not the column, it is the *vocabulary*: §3 allowed
--    `cluster | theme_fallback | none`, and rev. B §2.4 drops theme as a basis
--    entirely in favour of `book`. Kept as one column from §3, with rev. B's
--    vocabulary pinned by CHECK.
--
-- 2. `verdict_status` vocabulary. §3: `measured | one_sided | not_measurable |
--    insufficient_history`. Rev. B §3: `measured | one_sided | stale_mark |
--    ledger_mismatch`, having established by measurement that no schedule on
--    this book fails to support a rate — every refusal is a data-integrity
--    refusal, and collapsing `stale_mark` into `ledger_mismatch` would erase
--    the difference between a book that self-heals tonight and one that never
--    will. Rev. B supersedes; CHECK pins its four.
--
-- 3. `asset_id bigint` (§3) is wrong for this database — `assets.id`,
--    `positions.asset_id` and `mv_position_returns.asset_id` are all **uuid**.
--    Declared uuid with a real FK, so a verdict cannot outlive its asset.
--
-- 4. `cluster_id bigint` (§3) — `universe_clusters.cluster_id` is **integer**.
--
-- ## Sources for the "at entry" columns
--
-- Rev. B §4 attributes `conviction_at_entry` to `position_entry_context` and
-- `thesis_state` to "The Bench". `position_entry_context` **does not exist**.
-- The data does, under other names, and the writer in §8.7 will read:
--
--   conviction_at_entry    <- decisions.conviction          (164 rows, to 08-19)
--   coherence_at_entry     <- decisions.coherence_net       (same row)
--   confidence_at_entry    <- decisions.coherence_alignment
--   family_code_at_entry   <- signal_coherence.dominant_family
--   thesis_state           <- bench_claims.status           (18 rows, all 'untested')
--
-- Two caveats worth recording now rather than discovering at write time.
-- `decisions` covers 164 trades and the ledger runs to 2025-12-29, so the
-- older half of the book has no entry context and never will — which is
-- exactly rev. B's own argument for creating these columns today. And
-- `bench_claims.status` currently has one distinct value, `untested`; it is
-- not yet the INTACT/BENDING/BROKEN vocabulary §4 assumes, so `thesis_state`
-- is left unconstrained until the Bench emits the full enum.
--
-- ## Invariants as constraints, not just as job code
--
-- Rev. B §6 asks for the invariants to be "asserted in the nightly job,
-- failing loudly". Every §6 rule that is a predicate over a single row is
-- implemented here as a CHECK instead. The memo's own argument for writing
-- these columns from row one is that a history cannot be backfilled — and a
-- constraint the job cannot forget is a stronger guarantee than an assertion
-- it might. The job still asserts the two rules that span rows
-- (`sum(cluster_risk_share) = 1.0`, and no verdict row written while any
-- position carries a stale broker row); those cannot be CHECKs.

-- ============================================================
-- position_verdicts — memo v2 §3 base
-- ============================================================

CREATE TABLE IF NOT EXISTS public.position_verdicts (
  verdict_id            bigserial primary key,
  as_of                 date        not null,
  logic_version         text        not null,   -- encodes cluster threshold + basis

  -- identity
  asset_id              uuid        not null references public.assets(id),
  symbol                text        not null,
  position_state        text        not null,   -- open | closed
  side                  text        not null,

  -- status gate (drives rendering; never null)
  verdict_status        text        not null,   -- see CHECK below (rev. B §3)
  status_reason         text,                   -- why THIS verdict_status
  price_days_old        int,
  last_measurable_date  date,

  -- own performance, cash-flow matched
  first_entry_date      date,
  days_held             int,
  capital_deployed_usd  numeric,
  position_mwr_pct      numeric,                -- money-weighted, the ranking input
  position_twr_pct      numeric,                -- time-weighted, context
  annualised_return     numeric,                -- NULL where days_held < 90 (§2.7)
  entry_price           numeric,
  entry_efficiency_score numeric,

  -- peer set (frozen)
  peer_basis            text        not null,   -- cluster | book | none (rev. B §2.4)
  cluster_threshold_rho numeric     not null,   -- explicit, displayed (§2.2)
  cluster_id            int,
  cluster_members       text[],                 -- frozen membership
  cluster_size          int,
  avg_intra_rho         numeric,
  peer_window_start     date,
  peer_window_end       date,

  -- Brinson decomposition on cluster basis (§2.4)
  cf_median_return_pct  numeric,
  cf_best_return_pct    numeric,
  cf_best_symbol        text,
  cf_basket_return_pct  numeric,

  selection_effect_pct  numeric,                -- THE SCORE — vs cluster median
  allocation_effect_pct numeric,
  interaction_effect_pct numeric,
  regret_vs_best_pct    numeric,                -- display only, never sorts

  -- vol adjustment
  position_vol_annual   numeric,
  cluster_vol_annual    numeric,
  selection_effect_vol_adj numeric,

  -- risk contribution
  marginal_vol_contribution numeric,
  dollar_var_95_daily   numeric,
  cluster_risk_share    numeric,                -- sums to 1.0 across book per as_of

  -- verdict
  rank_in_cluster       int,
  verdict_label         text,                   -- leader | holding_own | lagging | cut_candidate
  suggested_reason_code text,                   -- nullable; pre-fills the ticket

  computed_at           timestamptz not null default now(),

  unique (as_of, asset_id, logic_version)
);

CREATE INDEX IF NOT EXISTS position_verdicts_as_of_version_idx
    ON public.position_verdicts (as_of desc, logic_version);
CREATE INDEX IF NOT EXISTS position_verdicts_asset_as_of_idx
    ON public.position_verdicts (asset_id, as_of desc);

-- ============================================================
-- rev. B §4 — additive columns
-- ============================================================

ALTER TABLE public.position_verdicts

  -- basis, explicit (step 3 established the toggle)
  ADD COLUMN IF NOT EXISTS ranking_basis          text not null default 'mwr',   -- mwr | since_entry
  ADD COLUMN IF NOT EXISTS engine_status          text,                          -- from mv_position_returns
  ADD COLUMN IF NOT EXISTS status_detail          text,                          -- why THIS engine_status

  -- the ladder (§2.4)
  ADD COLUMN IF NOT EXISTS cluster_eligible       boolean not null default false, -- rho >= 0.75 AND n >= 5
  ADD COLUMN IF NOT EXISTS cf_book_return_pct     numeric,                       -- cash flows into rest-of-book
  ADD COLUMN IF NOT EXISTS excess_vs_book_pct     numeric,                       -- Tier 2 score, all 63

  -- diversification finding, carried per row (§2.5)
  ADD COLUMN IF NOT EXISTS best_correlate_rho     numeric,
  ADD COLUMN IF NOT EXISTS best_correlate_symbol  text,

  -- conviction at entry
  ADD COLUMN IF NOT EXISTS conviction_at_entry    numeric,
  ADD COLUMN IF NOT EXISTS confidence_at_entry    numeric,
  ADD COLUMN IF NOT EXISTS family_code_at_entry   text,

  -- thesis state, from The Bench
  ADD COLUMN IF NOT EXISTS thesis_state           text,
  ADD COLUMN IF NOT EXISTS thesis_state_as_of     date,

  -- do-nothing baseline
  ADD COLUMN IF NOT EXISTS frozen_weight_return_pct numeric,
  ADD COLUMN IF NOT EXISTS trading_effect_pct       numeric, -- position_mwr_pct - frozen_weight_return_pct

  -- coherence at entry, from the Trade module
  ADD COLUMN IF NOT EXISTS coherence_at_entry     numeric,

  -- dispersion context
  ADD COLUMN IF NOT EXISTS cluster_dispersion     numeric,

  -- evidence typing (memo v2 §2.6)
  ADD COLUMN IF NOT EXISTS evidence_own_return_known boolean not null default true,
  ADD COLUMN IF NOT EXISTS evidence_staleness_days   int;

-- ============================================================
-- rev. B §6 — the single-row invariants, as constraints
-- ============================================================

-- rev. B §3. `not_measurable` and `insufficient_history` from memo v2 §3 are
-- deliberately absent: no schedule on this book fails to support a rate.
ALTER TABLE public.position_verdicts
  DROP CONSTRAINT IF EXISTS position_verdicts_status_ck;
ALTER TABLE public.position_verdicts
  ADD CONSTRAINT position_verdicts_status_ck
  CHECK (verdict_status IN ('measured','one_sided','stale_mark','ledger_mismatch'));

-- rev. B §2.4. `theme_fallback` from memo v2 §3 is dropped: theme is 22.9%
-- unmapped and hand-kept, and sector is the label the brief already rejected.
ALTER TABLE public.position_verdicts
  DROP CONSTRAINT IF EXISTS position_verdicts_peer_basis_ck;
ALTER TABLE public.position_verdicts
  ADD CONSTRAINT position_verdicts_peer_basis_ck
  CHECK (peer_basis IN ('cluster','book','none'));

ALTER TABLE public.position_verdicts
  DROP CONSTRAINT IF EXISTS position_verdicts_ranking_basis_ck;
ALTER TABLE public.position_verdicts
  ADD CONSTRAINT position_verdicts_ranking_basis_ck
  CHECK (ranking_basis IN ('mwr','since_entry'));

-- §6: `peer_basis = 'cluster'` requires `cluster_eligible = true`.
ALTER TABLE public.position_verdicts
  DROP CONSTRAINT IF EXISTS position_verdicts_cluster_basis_ck;
ALTER TABLE public.position_verdicts
  ADD CONSTRAINT position_verdicts_cluster_basis_ck
  CHECK (peer_basis <> 'cluster' OR cluster_eligible);

-- §6: `cluster_eligible = true` requires rho >= 0.75 AND cluster size >= 5.
-- The threshold is read from the row's own `cluster_threshold_rho` rather than
-- hardcoded, so the constraint still holds if a future logic_version moves it
-- — but rev. B §2.2 fixes it at 0.75 and refuses to loosen it to manufacture
-- peers: a name at rho 0.66 is the sector-label claim with a number attached.
ALTER TABLE public.position_verdicts
  DROP CONSTRAINT IF EXISTS position_verdicts_cluster_eligible_ck;
ALTER TABLE public.position_verdicts
  ADD CONSTRAINT position_verdicts_cluster_eligible_ck
  CHECK (
    NOT cluster_eligible
    OR (cluster_threshold_rho >= 0.75 AND cluster_size >= 5 AND avg_intra_rho >= 0.75)
  );

-- §6: `verdict_label = 'cut_candidate'` requires `verdict_status = 'measured'`.
-- The whole point of the status gate: an unmeasurable position must never be
-- proposed for sale on the strength of a number nobody could compute.
ALTER TABLE public.position_verdicts
  DROP CONSTRAINT IF EXISTS position_verdicts_label_ck;
ALTER TABLE public.position_verdicts
  ADD CONSTRAINT position_verdicts_label_ck
  CHECK (
    (verdict_label IS NULL OR verdict_label IN ('leader','holding_own','lagging','cut_candidate'))
    AND (verdict_label <> 'cut_candidate' OR verdict_status = 'measured')
  );

-- §6 + §7: reason codes are a closed enum, NULL unless measured, and
-- `switch_to_cluster_leader` is only offerable on the cluster tier — on Tier 2
-- there is no leader to switch into, and the equivalent action is a trim.
ALTER TABLE public.position_verdicts
  DROP CONSTRAINT IF EXISTS position_verdicts_reason_ck;
ALTER TABLE public.position_verdicts
  ADD CONSTRAINT position_verdicts_reason_ck
  CHECK (
    (suggested_reason_code IS NULL OR verdict_status = 'measured')
    AND (suggested_reason_code IS NULL OR suggested_reason_code IN (
          'switch_to_cluster_leader',
          'cut_underperforming_comparables',
          'trim_concentration',
          'add_on_conviction',
          'exit_thesis_broken',
          'exit_unmeasurable'))
    AND (suggested_reason_code <> 'switch_to_cluster_leader' OR peer_basis = 'cluster')
  );

-- §6 / §2.7: no annualised figure under 90 days held. AMD showed +545.58%
-- CAGR over ~174 days — arithmetically correct, presentationally indefensible,
-- and sortable. Step 0b closed it in `vw_performance_suite`; this stops it
-- being reintroduced in the history.
ALTER TABLE public.position_verdicts
  DROP CONSTRAINT IF EXISTS position_verdicts_annualisation_floor_ck;
ALTER TABLE public.position_verdicts
  ADD CONSTRAINT position_verdicts_annualisation_floor_ck
  CHECK (annualised_return IS NULL OR days_held >= 90);

-- §6: `evidence_own_return_known = false` wherever the terminal price is
-- gated. Stops a future reader — or a grading query — treating unmeasured as
-- flat, which is the failure the evidence typing exists to prevent.
ALTER TABLE public.position_verdicts
  DROP CONSTRAINT IF EXISTS position_verdicts_evidence_ck;
ALTER TABLE public.position_verdicts
  ADD CONSTRAINT position_verdicts_evidence_ck
  CHECK (evidence_own_return_known = (verdict_status = 'measured'));

ALTER TABLE public.position_verdicts
  DROP CONSTRAINT IF EXISTS position_verdicts_state_ck;
ALTER TABLE public.position_verdicts
  ADD CONSTRAINT position_verdicts_state_ck
  CHECK (position_state IN ('open','closed'));

COMMENT ON TABLE public.position_verdicts IS
 'Nightly per-position verdict history (memo v2 §3 + step 4 addendum rev. B §4). Written by the nightly job under service_role, read by Performance as a single indexed lookup - the computation behind it cannot clear anon''s 3s cap. Append-only history: a row is a frozen record of what was known on `as_of` under `logic_version`, never updated in place.';

COMMENT ON COLUMN public.position_verdicts.verdict_status IS
 'measured | one_sided | stale_mark | ledger_mismatch. Rev. B §3: every refusal on this book is a data-integrity refusal, never a solver failure. stale_mark self-heals when the feed returns; ledger_mismatch does not.';
COMMENT ON COLUMN public.position_verdicts.status_reason IS
 'Free text explaining verdict_status, e.g. ''price_days_old=163''.';
COMMENT ON COLUMN public.position_verdicts.engine_status IS
 'The upstream mv_position_returns.engine_status this verdict was derived from. verdict_status is the verdict layer''s reading of it; keeping both means a later change to the mapping is visible in the history rather than invisible.';
COMMENT ON COLUMN public.position_verdicts.status_detail IS
 'Free text explaining engine_status (mv_position_returns.engine_reason), as distinct from status_reason which explains verdict_status.';
COMMENT ON COLUMN public.position_verdicts.peer_basis IS
 'cluster | book | none. Which tier produced the score. Rev. B §2.4: never fall back between tiers without recording which was used.';
COMMENT ON COLUMN public.position_verdicts.cluster_eligible IS
 'rho >= 0.75 AND cluster size >= 5. True for ~19 of 63 positions - the book is single names, ADRs, sector ETFs and commodity trackers, and most of it has no close peer by construction. A portfolio property, not a data gap.';
COMMENT ON COLUMN public.position_verdicts.excess_vs_book_pct IS
 'Tier 2 score: this position''s cash-flow schedule run into the rest of the book at prevailing weights, differenced against its own return. Available for every position, needs no peer. Every dollar in a name is a dollar not spread across the other 62.';
COMMENT ON COLUMN public.position_verdicts.best_correlate_rho IS
 'Highest correlation to any other held name. Carried per row so the diversification finding stays answerable over time - 17 of 63 positions have no correlate above 0.65, and the median position''s best correlate is 0.771.';
COMMENT ON COLUMN public.position_verdicts.conviction_at_entry IS
 'decisions.conviction at the opening trade. Unrecoverable if not captured at open - `decisions` starts 2026, the ledger starts 2025-12-29, so the older half of the book will carry NULL permanently.';
COMMENT ON COLUMN public.position_verdicts.trading_effect_pct IS
 'position_mwr_pct - frozen_weight_return_pct. The one number answering "did my trading help". Negative means the do-nothing book beat the traded book.';
COMMENT ON COLUMN public.position_verdicts.evidence_own_return_known IS
 'False wherever the terminal price is gated. Constrained to track verdict_status = measured, so unmeasured can never be read as flat.';

-- ============================================================
-- book_risk_daily — memo v2 §3 (prose) + rev. B §5
-- ============================================================

CREATE TABLE IF NOT EXISTS public.book_risk_daily (
  as_of                     date        not null,
  logic_version             text        not null,

  -- memo v2 §3 book-level companion
  total_vol_annual          numeric,
  book_var_95_daily         numeric,
  sum_contributions         numeric,
  residual                  numeric,       -- displayed, never swept up (§2.8)
  effective_bets            numeric,       -- 1 / sum(cluster_risk_share^2)
  cluster_shares            jsonb,
  unmapped_theme_weight     numeric,
  cluster_threshold_rho     numeric     not null,

  -- rev. B §5
  traded_book_return_pct    numeric,
  frozen_book_return_pct    numeric,
  trading_effect_pct        numeric,
  positions_cluster_eligible int,          -- ~19 of 63
  positions_no_correlate     int,          -- 17 above rho 0.65

  computed_at               timestamptz not null default now(),

  primary key (as_of, logic_version)
);

COMMENT ON TABLE public.book_risk_daily IS
 'Book-level companion to position_verdicts, one row per as_of per logic_version. Carries the risk reconciliation identity (position -> cluster -> book, residual explicit) and the do-nothing baseline at book level.';
COMMENT ON COLUMN public.book_risk_daily.residual IS
 'Total vol less the sum of weighted marginal contributions. Written explicitly and displayed - a decomposition that cannot close should say so rather than absorb the gap into the largest bucket.';
COMMENT ON COLUMN public.book_risk_daily.effective_bets IS
 '1 / sum(cluster_risk_share^2). 63 positions are expected to resolve to five or six bets. Absorbs the older Diversification Score and Redundant Pairs, which are weaker estimators of the same idea.';
COMMENT ON COLUMN public.book_risk_daily.frozen_book_return_pct IS
 'Every position held at its opening weight, never added to, never trimmed. If this beats traded_book_return_pct, trading is a cost centre.';
COMMENT ON COLUMN public.book_risk_daily.positions_no_correlate IS
 'Positions with no correlate above rho 0.65. Carried as a time series so the diversification trend is answerable, not a one-off measurement.';

-- ============================================================
-- Access — read for the terminal, write for the nightly job only
-- ============================================================
--
-- Follows `atlas_validation_log`: SELECT to anon/authenticated, everything
-- else to service_role. Deliberately NOT `universe_clusters`'s pattern, which
-- grants ALL to anon — that is a hole, and a history the UI can rewrite is not
-- a history.

ALTER TABLE public.position_verdicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_risk_daily   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS position_verdicts_read ON public.position_verdicts;
CREATE POLICY position_verdicts_read ON public.position_verdicts
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS position_verdicts_service ON public.position_verdicts;
CREATE POLICY position_verdicts_service ON public.position_verdicts
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS book_risk_daily_read ON public.book_risk_daily;
CREATE POLICY book_risk_daily_read ON public.book_risk_daily
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS book_risk_daily_service ON public.book_risk_daily;
CREATE POLICY book_risk_daily_service ON public.book_risk_daily
    FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.position_verdicts TO anon, authenticated;
GRANT SELECT ON public.book_risk_daily   TO anon, authenticated;
GRANT ALL    ON public.position_verdicts TO service_role;
GRANT ALL    ON public.book_risk_daily   TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.position_verdicts_verdict_id_seq TO service_role;
