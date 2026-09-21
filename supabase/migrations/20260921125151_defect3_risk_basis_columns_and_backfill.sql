-- ============================================================
-- Defect 3, step 1: declare the risk basis on the row
-- ------------------------------------------------------------
-- `vw_risk_analysis.marginal_vol_contribution` is `weight * annual_vol` -- a
-- share of the UNDIVERSIFIED sum, with no covariance in it anywhere. It cannot
-- express that adding to a name which offsets the rest of the book LOWERS
-- portfolio risk, and it has no Euler additivity. B4 built the real derivative
-- in `vw_book_mctr` (Euler residual 2.8e-17); the next two migrations repoint
-- the nightly jobs at it.
--
-- `position_verdicts` (1,006 rows) and `segment_verdicts` (531) are append-only
-- histories already written on the old basis and cannot be restated. So the
-- basis is declared ON THE ROW -- the `peer_basis` / `dispersion_basis` /
-- `vol_basis` construction -- and the discontinuity is legible at the exact row
-- where it happens.
--
-- ## Why not bump `logic_version`
--
-- Because the version string is a PARAMETER FINGERPRINT, not a serial number:
-- `v1:rho0.75:n5:mwr` names the peer threshold, the cluster minimum and the
-- return basis. None of those change here. Bumping it would assert a change to
-- rho, n or MWR that did not happen -- the mirror of the error defect 2 avoided
-- when it declined to bump for a change in one column of a companion table.
-- A basis column says exactly what changed; a version bump says "something".
--
-- Checked before choosing: no consumer pins a logic_version value. Every
-- loader reads it and reports it (`bookBaseline.js`, `verdictCard.js`,
-- `clusterView.js`, `segmentView.js`); `counterView.js` filters only when
-- given one explicitly.
--
-- ## The numerics are two-sided ranges
--
-- PostgreSQL sorts `numeric 'NaN'` ABOVE every finite value, so a one-sided
-- `>= 0` admits NaN and `+Infinity` both (PR #783). `risk_withheld_weight_pct`
-- is bounded at BOTH ends; NULL still yields NULL and passes, so a genuinely
-- absent measurement is untouched.
--
-- NOTE: the basis CHECKs added here were themselves NULL-permeable and are
-- replaced in the very next migration. See 20260921125418 -- that fault, and
-- the live one it turned up on `book_risk_daily`, are the reason this pair is
-- two migrations rather than one.
-- ============================================================

ALTER TABLE public.position_verdicts
  ADD COLUMN IF NOT EXISTS risk_basis        text,
  ADD COLUMN IF NOT EXISTS risk_matrix_as_of date;

ALTER TABLE public.segment_verdicts
  ADD COLUMN IF NOT EXISTS risk_basis                text,
  ADD COLUMN IF NOT EXISTS risk_matrix_as_of         date,
  ADD COLUMN IF NOT EXISTS risk_members_withheld     integer,
  ADD COLUMN IF NOT EXISTS risk_withheld_weight_pct  numeric;

-- Backfill: every existing row was written on weight x vol. Marked rather than
-- left null, because a null basis beside a real number is exactly the "flag
-- nobody checks" this codebase warns about -- a reader would not know the rows
-- predate the re-basing.
UPDATE public.position_verdicts
   SET risk_basis = 'weight_x_vol_undiversified'
 WHERE risk_basis IS NULL
   AND (marginal_vol_contribution IS NOT NULL OR cluster_risk_share IS NOT NULL);

UPDATE public.segment_verdicts
   SET risk_basis = 'weight_x_vol_undiversified'
 WHERE risk_basis IS NULL
   AND risk_share IS NOT NULL;

ALTER TABLE public.position_verdicts
  DROP CONSTRAINT IF EXISTS position_verdicts_risk_basis_ck,
  ADD  CONSTRAINT position_verdicts_risk_basis_ck CHECK (
        (risk_basis IS NULL
           AND risk_matrix_as_of IS NULL
           AND marginal_vol_contribution IS NULL
           AND cluster_risk_share IS NULL)
     OR (risk_basis = 'weight_x_vol_undiversified' AND risk_matrix_as_of IS NULL)
     OR (risk_basis = 'mctr_euler'                 AND risk_matrix_as_of IS NOT NULL));

ALTER TABLE public.segment_verdicts
  DROP CONSTRAINT IF EXISTS segment_verdicts_risk_basis_ck,
  ADD  CONSTRAINT segment_verdicts_risk_basis_ck CHECK (
        (risk_basis IS NULL AND risk_matrix_as_of IS NULL AND risk_share IS NULL)
     OR (risk_basis = 'weight_x_vol_undiversified' AND risk_matrix_as_of IS NULL)
     OR (risk_basis = 'mctr_euler'                 AND risk_matrix_as_of IS NOT NULL));

ALTER TABLE public.segment_verdicts
  DROP CONSTRAINT IF EXISTS segment_verdicts_risk_withheld_ck,
  ADD  CONSTRAINT segment_verdicts_risk_withheld_ck CHECK (
        risk_withheld_weight_pct IS NULL
     OR (risk_withheld_weight_pct >= 0 AND risk_withheld_weight_pct <= 100));

ALTER TABLE public.segment_verdicts
  DROP CONSTRAINT IF EXISTS segment_verdicts_risk_members_withheld_ck,
  ADD  CONSTRAINT segment_verdicts_risk_members_withheld_ck CHECK (
        risk_members_withheld IS NULL
     OR (risk_members_withheld >= 0 AND risk_members_withheld <= member_count));

COMMENT ON COLUMN public.position_verdicts.risk_basis IS
  'Which measure marginal_vol_contribution and cluster_risk_share were computed on. weight_x_vol_undiversified = weight x annual vol, no covariance, positive by construction (rows before 2026-09-21). mctr_euler = the Euler-additive partial derivative from vw_book_mctr, which CAN be negative for a name that diversifies the book.';

COMMENT ON COLUMN public.position_verdicts.risk_matrix_as_of IS
  'The universe_correlations snapshot the Euler measure rests on. NOT NULL exactly when risk_basis = mctr_euler. ts_clusters is on record failing with a 504 and leaving a downstream job on a stale partition; without this a silently stale matrix would move every share with nothing on the row to say so.';

COMMENT ON COLUMN public.segment_verdicts.risk_withheld_weight_pct IS
  'Share of the segment''s weight whose members have no MCTR, so a segment states its denominator instead of renormalising the gap away.';
