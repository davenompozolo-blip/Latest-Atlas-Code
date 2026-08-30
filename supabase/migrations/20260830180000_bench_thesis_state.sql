-- ============================================================
-- The Bench's thesis state, resolved once, for the verdict layer
-- memo v2 close-out §5.2
-- ------------------------------------------------------------
-- `position_verdicts.thesis_state` and `.thesis_state_as_of` have been
-- declared since the schema and NULL on every row ever written, because
-- nothing populated them. §5.2 puts `thesis_state` on the verdict card, so it
-- has to come from somewhere; this view is that somewhere.
--
-- ## The rule is Bench's, not a new one
--
-- Integrity is NOT a column anyone writes today. It resolves in two steps,
-- exactly as `nexusBenchCompute.js` does it:
--
--   1. `opportunity_assessments.thesis_integrity` — the assessment writer's
--      ruling, when it has ruled.
--   2. otherwise derive from the claim tally (`deriveIntegrity`):
--
--        no claims                                  -> NULL (no read at all)
--        every claim pending                        -> untested
--        contradicted > half                        -> broken
--        >=1 contradicted and >=1 other             -> bending
--        confirmed > half and none contradicted     -> intact
--        anything else                              -> untested
--
-- Ported rather than re-invented. Two implementations of one rule drift, and a
-- Performance card disagreeing with the Bench about the same thesis is the
-- "two surfaces, one question, different answers" failure this codebase keeps
-- finding. `supabase/tests/bench_thesis_state_truth_table.sql` pins the SQL
-- against the same cases the JS is written to.
--
-- EXPIRED never derives — it needs the macro-vs-capture distinction and is
-- model-authored only. The CASE below cannot produce it, on purpose.
--
-- ## What the data actually says today (2026-08-30)
--
--   bench_claims                18 claims, 18 symbols, ALL status 'untested'
--   status_changed_at           NULL on all 18 — no state is dateable
--   opportunity_assessments     4,234 rows, 486 symbols, current to 08-28,
--                               thesis_integrity NULL on every one
--   overlap with the open book  16 of 57 positions
--
-- So every resolved state is `untested` and none carries a date. That is not a
-- fault in this view — it is the honest reading of a Bench that has 18
-- hand-written theses, each with a falsifier and a review date, and has never
-- judged one of them. The gate downstream renders that as UNTESTED, which is
-- what it is.
-- ============================================================

CREATE OR REPLACE VIEW public.vw_bench_thesis_state AS
WITH tally AS (
    SELECT c.symbol,
           count(*)                                                      AS total,
           count(*) FILTER (WHERE c.status = 'confirmed')                AS confirmed,
           count(*) FILTER (WHERE c.status = 'contradicted')             AS contradicted,
           -- Everything that is neither is pending, matching claimsTally's
           -- `else t.pending++` — 'untested', 'pending' and any future member
           -- of the status vocabulary all land here rather than being dropped.
           count(*) FILTER (WHERE c.status NOT IN ('confirmed', 'contradicted')) AS pending,
           max(c.status_changed_at)                                      AS last_state_change,
           min(c.review_by)                                              AS review_by,
           max(c.created_at)                                             AS last_claim_written
      FROM public.bench_claims c
     WHERE c.symbol IS NOT NULL
     GROUP BY c.symbol
),
-- The writer's ruling takes precedence where it exists. It never does today
-- (thesis_integrity is NULL on all 4,234 rows), but encoding the precedence
-- now means the verdict layer follows the Bench the day the writer starts
-- ruling, instead of quietly continuing to derive.
ruled AS (
    SELECT DISTINCT ON (a.symbol)
           a.symbol,
           a.thesis_integrity,
           COALESCE(a.as_of_date, a.created_at::date) AS ruled_as_of
      FROM public.opportunity_assessments a
     WHERE a.thesis_integrity IS NOT NULL
     ORDER BY a.symbol, COALESCE(a.as_of_date, a.created_at::date) DESC
)
SELECT t.symbol,
       CASE
           WHEN r.thesis_integrity IS NOT NULL THEN r.thesis_integrity
           WHEN t.total = 0                    THEN NULL
           WHEN t.pending = t.total            THEN 'untested'
           WHEN t.contradicted * 2 > t.total   THEN 'broken'
           WHEN t.contradicted >= 1
                AND (t.confirmed + t.pending) >= 1 THEN 'bending'
           WHEN t.confirmed * 2 > t.total
                AND t.contradicted = 0         THEN 'intact'
           ELSE 'untested'
       END AS thesis_state,
       -- When the state was last established. NOT the claim's creation date:
       -- a thesis written in March and never judged has been untested since
       -- March, but "as of" has to mean "when this reading was taken", and no
       -- reading has been taken. NULL here is what makes the gate downstream
       -- refuse to publish a confident state.
       CASE WHEN r.thesis_integrity IS NOT NULL THEN r.ruled_as_of
            ELSE t.last_state_change::date
       END AS thesis_state_as_of,
       CASE WHEN r.thesis_integrity IS NOT NULL THEN 'assessment' ELSE 'claims' END AS state_source,
       t.total        AS claims_total,
       t.confirmed    AS claims_confirmed,
       t.contradicted AS claims_contradicted,
       t.pending      AS claims_pending,
       -- The thesis's own falsification deadline. Better than a global
       -- staleness threshold where it exists, because the claim itself said
       -- when it should next be examined.
       t.review_by,
       t.last_claim_written::date AS last_claim_written
  FROM tally t
  LEFT JOIN ruled r ON r.symbol = t.symbol;

COMMENT ON VIEW public.vw_bench_thesis_state IS
 'Thesis integrity per symbol for the verdict layer (memo v2 close-out §5.2). Resolves the way the Bench does: opportunity_assessments.thesis_integrity where the writer has ruled, otherwise derived from the bench_claims tally by the same rule as nexusBenchCompute.deriveIntegrity. EXPIRED is model-authored and never derives here. thesis_state_as_of is when the STATE was established (a ruling date, or the last claim status change) and is NULL when no reading has ever been taken - which is every row today, because all 18 claims are untested and none carries a status_changed_at. Consumers must gate on that NULL rather than publish an undated state.';

GRANT SELECT ON public.vw_bench_thesis_state TO anon, authenticated, service_role;
