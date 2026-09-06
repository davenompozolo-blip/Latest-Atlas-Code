-- ============================================================
-- Two defects in the risk-share layer
-- perf module three-level build spec §2.4c — fixed separately, before the build
-- ------------------------------------------------------------
-- ## Defect 2 — the correctness fault
--
-- `position_verdicts.cluster_id` was taken from `t1`, the tier-1 subquery,
-- which attaches the partition id INSIDE the join to `mv_position_tier1`:
--
--     LEFT JOIN (SELECT t.*, c.cluster_id
--                  FROM public.mv_position_tier1 t
--                  LEFT JOIN clus c ON c.symbol = t.symbol) t1
--            ON t1.asset_id = o.asset_id
--
-- A position with no tier-1 row loses the whole subquery — `cluster_id`
-- included — even though `clus` knows its partition perfectly well. The share,
-- meanwhile, is looked up on an independent path (`LEFT JOIN clus cl ON
-- cl.symbol = o.symbol`), so the SHARE was always right and only the published
-- id came back NULL.
--
-- **24 of 59 open positions were affected**: AAPL, ABEV, AMZN, ANF, ATAT,
-- AVEE, BKR, BMY, C, CPER, GILD, HAL, JNJ, META, MSFT, NEE, NKE, NVDA, PFE,
-- PG, SONY, TIP, TM, UAE. Every one belongs to a real cluster in
-- `universe_clusters`.
--
-- AMZN is how it surfaced. It shares cluster 204 with GOOGL, so the two rows
-- carried an identical share to sixteen decimal places while only GOOGL
-- carried the id — which looked like a share computed against the wrong
-- cluster. It was not: the share was correct and the id was missing. Every
-- other affected name is the sole held member of its cluster, so its share
-- looked like a plausible per-position value and hid the fault entirely.
--
-- The fix is one token: read `cluster_id` from `cl`, already joined directly
-- on the position. For a position that HAS a tier-1 row both resolve to the
-- same value — same symbol, same `clus` — so this is a strict repair.
--
-- **This matters beyond the invariant.** The three-level build segments level
-- 2 on `cluster_id` (§2.1), so 24 positions would have fallen to theme or
-- Unpaired that belong in a partition bucket.
--
-- ## Defect 1 — the reporting fault
--
-- The nightly invariant computed
--
--     sum(DISTINCT cluster_risk_share)
--       over (SELECT DISTINCT cluster_id, cluster_risk_share ...)
--
-- which deduplicates by VALUE, not by bucket: two distinct buckets holding an
-- equal share collapse into one. AMZN and cluster 204 did exactly that, so the
-- job reported **1.0000000000 while the true sum was 1.0435** — an invariant
-- reporting green while 4.4% out, and passing only because the collapse
-- happened to cancel the defect above. Two faults, each hiding the other.
--
-- Bucketed explicitly instead, per the spec:
--
--     coalesce(cluster_id::text, 'pos:' || asset_id::text)
--
-- ## Proof
--
-- Anchors asserted to match exactly once, patched textually against
-- `pg_get_functiondef` so the remaining ~17k characters are byte-identical,
-- and guarded so a re-run is a no-op.
--
-- Then run for real: `atlas_write_verdicts` invoked under a throwaway
-- `logic_version` inside a transaction ending on RAISE, so it rolled back —
--
--     rows=59   cluster_id NULL=2   bucketed_share_sum=1.0000000000
--
-- against 26 NULL and 1.0435330992 before. The 2 remaining (IXC, KMTUY) are
-- genuinely absent from `universe_clusters` and carry a NULL share, so they
-- are excluded by the IS NOT NULL filter rather than counted as zero.
-- ============================================================

DO $patch$
DECLARE
  src   text;
  out_s text;
  a_old text := E'               t1.cluster_id,\n';
  a_new text := E'               cl.cluster_id,   -- partition, not the tier-1 join (spec 2.4c)\n';
  b_old text := E'SELECT sum(DISTINCT cluster_risk_share) INTO v_share_sum\n      FROM (SELECT DISTINCT cluster_id, cluster_risk_share\n              FROM public.position_verdicts pv\n             WHERE pv.as_of = v_as_of AND pv.logic_version = p_logic_version\n               AND cluster_risk_share IS NOT NULL) s;\n';
  b_new text := E'SELECT sum(s.share) INTO v_share_sum\n      FROM (SELECT DISTINCT coalesce(pv.cluster_id::text, ''pos:'' || pv.asset_id::text) AS bucket,\n                   pv.cluster_risk_share AS share\n              FROM public.position_verdicts pv\n             WHERE pv.as_of = v_as_of AND pv.logic_version = p_logic_version\n               AND pv.cluster_risk_share IS NOT NULL) s;\n';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'atlas_write_verdicts';

  IF src IS NULL THEN RAISE EXCEPTION 'atlas_write_verdicts not found'; END IF;

  IF position('cl.cluster_id,   -- partition' in src) > 0 THEN
      RAISE NOTICE 'atlas_write_verdicts already patched; nothing to do';
      RETURN;
  END IF;

  IF (length(src)-length(replace(src,a_old,'')))/length(a_old) <> 1 THEN
      RAISE EXCEPTION 'anchor A (t1.cluster_id in select list) matched % times, expected 1',
            (length(src)-length(replace(src,a_old,'')))/length(a_old); END IF;
  IF (length(src)-length(replace(src,b_old,'')))/length(b_old) <> 1 THEN
      RAISE EXCEPTION 'anchor B (share-sum assertion) matched % times, expected 1',
            (length(src)-length(replace(src,b_old,'')))/length(b_old); END IF;

  out_s := replace(replace(src, a_old, a_new), b_old, b_new);
  IF out_s = src THEN RAISE EXCEPTION 'patch produced no change'; END IF;

  EXECUTE out_s;
END
$patch$;
