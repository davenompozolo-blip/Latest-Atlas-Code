-- ============================================================
-- The nightly job records the Bench's thesis state
-- memo v2 close-out §5.2
-- ------------------------------------------------------------
-- Companion to 20260830180000, which built `vw_bench_thesis_state`. This
-- makes `atlas_write_verdicts` write `thesis_state` and `thesis_state_as_of`
-- into the history, so a verdict row says what the Bench thought of the
-- thesis on the night it was written rather than what the Bench thinks now.
--
-- That distinction is the point. `position_verdicts` is a history; joining it
-- to a live Bench read at display time would let a thesis judged in October
-- appear beside an August verdict, which is the mixed-basis failure §5.2
-- exists to prevent, one layer lower down.
--
-- Four anchors, each asserted to match EXACTLY once, patched textually against
-- `pg_get_functiondef` rather than restating a ~17k-character body:
--
--   A  the base CTE's select      (the two columns enter the pipeline)
--   B  the join block             (vw_bench_thesis_state joins on symbol)
--   C  the INSERT column list
--   D  the INSERT's select list
--
-- Gated on the body not already carrying `bt.thesis_state`, for the same
-- reason as the rank patch: anchor A survives its own replacement, so a second
-- run would duplicate the insert and the function would not compile.
--
-- Proven before commit by running the job under a throwaway logic_version
-- inside a transaction that ends on RAISE: 57 rows, 16 carrying a thesis
-- state, 0 carrying a date — then rolled back. Those numbers are the honest
-- state of the Bench today: 18 claims over 18 symbols, 16 of them held, every
-- one `untested`, and `bench_claims_status_stamp` NULLs the date for anything
-- unresolved. Nothing has been judged, so nothing is dated.
-- ============================================================

DO $patch$
DECLARE
  src   text;
  out_s text;
  a_old text := E'               t1.rank_in_cluster,\n';
  a_new text := E'               t1.rank_in_cluster,\n               bt.thesis_state,\n               bt.thesis_state_as_of,\n';
  b_old text := E'          LEFT JOIN public.mv_position_tier2 t2 ON t2.asset_id = o.asset_id\n';
  b_new text := E'          LEFT JOIN public.mv_position_tier2 t2 ON t2.asset_id = o.asset_id\n          LEFT JOIN public.vw_bench_thesis_state bt ON bt.symbol = o.symbol\n';
  c_old text := E'        rank_in_cluster, cluster_members,\n';
  c_new text := E'        rank_in_cluster, cluster_members,\n        thesis_state, thesis_state_as_of,\n';
  d_old text := E'           l.rank_in_cluster, l.cluster_members,\n';
  d_new text := E'           l.rank_in_cluster, l.cluster_members,\n           l.thesis_state, l.thesis_state_as_of,\n';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'atlas_write_verdicts';

  IF src IS NULL THEN RAISE EXCEPTION 'atlas_write_verdicts not found'; END IF;

  IF position('bt.thesis_state' in src) > 0 THEN
      RAISE NOTICE 'atlas_write_verdicts already carries thesis_state; nothing to patch';
      RETURN;
  END IF;

  IF (length(src)-length(replace(src,a_old,'')))/length(a_old) <> 1 THEN
      RAISE EXCEPTION 'anchor A (base CTE select) matched % times, expected 1',
            (length(src)-length(replace(src,a_old,'')))/length(a_old); END IF;
  IF (length(src)-length(replace(src,b_old,'')))/length(b_old) <> 1 THEN
      RAISE EXCEPTION 'anchor B (join block) matched % times, expected 1',
            (length(src)-length(replace(src,b_old,'')))/length(b_old); END IF;
  IF (length(src)-length(replace(src,c_old,'')))/length(c_old) <> 1 THEN
      RAISE EXCEPTION 'anchor C (INSERT column list) matched % times, expected 1',
            (length(src)-length(replace(src,c_old,'')))/length(c_old); END IF;
  IF (length(src)-length(replace(src,d_old,'')))/length(d_old) <> 1 THEN
      RAISE EXCEPTION 'anchor D (INSERT select list) matched % times, expected 1',
            (length(src)-length(replace(src,d_old,'')))/length(d_old); END IF;

  out_s := replace(replace(replace(replace(src,a_old,a_new),b_old,b_new),c_old,c_new),d_old,d_new);

  IF out_s = src THEN RAISE EXCEPTION 'patch produced no change'; END IF;

  EXECUTE out_s;
END
$patch$;
