-- ============================================================
-- The nightly job carries rank_in_cluster and cluster_members through
-- memo v2 close-out §5.3
-- ------------------------------------------------------------
-- Companion to 20260830110000. That migration made `vw_position_tier1`
-- produce the two columns; this one makes `atlas_write_verdicts` write them
-- into the history.
--
-- Patched textually against `pg_get_functiondef` rather than restated, because
-- the function is ~17k characters and re-typing it to add two identifiers is
-- how a body drifts from the migration that is supposed to describe it.
--
-- Three anchors, each asserted to match EXACTLY once before anything is
-- replaced. A silent zero-match would leave the job unchanged while the
-- migration reported success — the same shape as the no-op that reported 200,
-- and as the columns this migration exists to fill.
--
--   A  the base CTE's tier-1 select      (columns enter the pipeline)
--   B  the INSERT column list
--   C  the INSERT's select list
--
-- Nothing else is needed: `labelled` is `SELECT a.*, …` over the base CTE, so
-- anything added at A reaches C without a fourth edit.
--
-- Proven before commit by calling the job under a throwaway logic_version
-- inside a transaction that ends on RAISE: 57 rows written, 19 with a rank,
-- 19 with a frozen membership (SHY #1 of 6, MU #1 of 16, SNDK #2 of 12,
-- AMD #3 of 13), then rolled back — 0 rows left behind.
-- ============================================================

DO $patch$
DECLARE
  src   text;
  out_s text;
  a_old text := E'               t1.cluster_dispersion,\n';
  a_new text := E'               t1.cluster_dispersion,\n               t1.rank_in_cluster,\n               t1.cluster_members,\n';
  b_old text := E'        frozen_weight_return_pct, trading_effect_pct, cluster_dispersion,\n        evidence_own_return_known, evidence_staleness_days)';
  b_new text := E'        frozen_weight_return_pct, trading_effect_pct, cluster_dispersion,\n        rank_in_cluster, cluster_members,\n        evidence_own_return_known, evidence_staleness_days)';
  c_old text := E'           l.frozen_weight_return_pct, l.trading_effect_pct, l.cluster_dispersion,\n           (l.verdict_status = ''measured''), l.mark_days_old';
  c_new text := E'           l.frozen_weight_return_pct, l.trading_effect_pct, l.cluster_dispersion,\n           l.rank_in_cluster, l.cluster_members,\n           (l.verdict_status = ''measured''), l.mark_days_old';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'atlas_write_verdicts';

  IF src IS NULL THEN RAISE EXCEPTION 'atlas_write_verdicts not found'; END IF;

  -- Re-run guard. Anchor A survives its own replacement (the old text is a
  -- prefix of the new), so a second run would insert the two lines AGAIN and
  -- the function would fail to compile on duplicate columns. B and C are
  -- self-healing; A is not, so the whole patch is gated on the body not
  -- already carrying the column.
  IF position('t1.rank_in_cluster' in src) > 0 THEN
      RAISE NOTICE 'atlas_write_verdicts already carries rank_in_cluster; nothing to patch';
      RETURN;
  END IF;

  IF (length(src) - length(replace(src, a_old, ''))) / length(a_old) <> 1 THEN
      RAISE EXCEPTION 'anchor A (base CTE tier1 select) matched % times, expected 1',
            (length(src) - length(replace(src, a_old, ''))) / length(a_old);
  END IF;
  IF (length(src) - length(replace(src, b_old, ''))) / length(b_old) <> 1 THEN
      RAISE EXCEPTION 'anchor B (INSERT column list) matched % times, expected 1',
            (length(src) - length(replace(src, b_old, ''))) / length(b_old);
  END IF;
  IF (length(src) - length(replace(src, c_old, ''))) / length(c_old) <> 1 THEN
      RAISE EXCEPTION 'anchor C (INSERT select list) matched % times, expected 1',
            (length(src) - length(replace(src, c_old, ''))) / length(c_old);
  END IF;

  out_s := replace(replace(replace(src, a_old, a_new), b_old, b_new), c_old, c_new);

  IF out_s = src THEN RAISE EXCEPTION 'patch produced no change'; END IF;

  EXECUTE out_s;
END
$patch$;
