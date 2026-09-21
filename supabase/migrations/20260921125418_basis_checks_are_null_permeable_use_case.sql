-- ============================================================
-- An enumerated-states CHECK is still NULL-permeable
-- ------------------------------------------------------------
-- Found by testing the two constraints added in 20260921125151 rather than
-- reading them, and then asking whether the same shape existed elsewhere. It
-- did -- on the constraint this codebase had already rewritten once for a
-- related fault.
--
--   vol_basis = NULL, total_vol_annual = 0.195, vol_matrix_as_of = NULL
--     branch 1: (total_vol_annual IS NULL)                        -> FALSE
--     branch 2: TRUE AND (NULL = 'weight_sq_undiversified') AND TRUE -> NULL
--     branch 3: TRUE AND NULL AND FALSE                           -> FALSE
--     FALSE OR NULL OR FALSE  ->  NULL  ->  the CHECK PASSES
--
-- So `book_risk_daily` accepted a vol figure with NO basis at all -- exactly
-- the state 20260915074500 was written to make impossible, and which CLAUDE.md
-- records as "now true rather than merely written down". It was not true.
-- Verified by UPDATE inside a rolled-back subtransaction, not by inspection.
--
-- A CHECK passes on NULL. Enumerating the permitted states is necessary and
-- NOT sufficient: the enumeration itself has to be TOTAL. A CASE over IS NULL
-- / IS NOT NULL tests with an ELSE false cannot yield NULL on any input, so
-- the biconditional holds for every row including those with a NULL basis.
--
-- Same family as the NaN finding on PR #783 -- there a one-sided bound admitted
-- a sentinel that sorts above every finite value; here three-valued logic
-- admits a NULL that short-circuits an OR chain. Both look correct on
-- inspection and both are found only by trying the value.
--
-- 14 violating states refused after this, 0 wrongly accepted, nothing written.
-- No existing row in any of the three tables is refused (17 / 1,006 / 531
-- checked before applying).
-- ============================================================

ALTER TABLE public.book_risk_daily
  DROP CONSTRAINT IF EXISTS brd_vol_basis_ck,
  ADD  CONSTRAINT brd_vol_basis_ck CHECK (
    CASE
      WHEN vol_basis IS NULL
        THEN (total_vol_annual IS NULL AND vol_matrix_as_of IS NULL)
      WHEN vol_basis = 'weight_sq_undiversified'
        THEN (total_vol_annual IS NOT NULL AND vol_matrix_as_of IS NULL)
      WHEN vol_basis = 'mctr_covariance'
        THEN (total_vol_annual IS NOT NULL AND vol_matrix_as_of IS NOT NULL)
      ELSE false
    END);

ALTER TABLE public.position_verdicts
  DROP CONSTRAINT IF EXISTS position_verdicts_risk_basis_ck,
  ADD  CONSTRAINT position_verdicts_risk_basis_ck CHECK (
    CASE
      WHEN risk_basis IS NULL
        THEN (risk_matrix_as_of IS NULL
              AND marginal_vol_contribution IS NULL
              AND cluster_risk_share IS NULL)
      WHEN risk_basis = 'weight_x_vol_undiversified' THEN risk_matrix_as_of IS NULL
      WHEN risk_basis = 'mctr_euler'                 THEN risk_matrix_as_of IS NOT NULL
      ELSE false
    END);

ALTER TABLE public.segment_verdicts
  DROP CONSTRAINT IF EXISTS segment_verdicts_risk_basis_ck,
  ADD  CONSTRAINT segment_verdicts_risk_basis_ck CHECK (
    CASE
      WHEN risk_basis IS NULL THEN (risk_matrix_as_of IS NULL AND risk_share IS NULL)
      WHEN risk_basis = 'weight_x_vol_undiversified' THEN risk_matrix_as_of IS NULL
      WHEN risk_basis = 'mctr_euler'                 THEN risk_matrix_as_of IS NOT NULL
      ELSE false
    END);
