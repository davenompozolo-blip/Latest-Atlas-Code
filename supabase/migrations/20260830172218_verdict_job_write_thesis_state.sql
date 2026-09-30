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
      RAISE NOTICE 'already carries thesis_state; nothing to patch';
      RETURN;
  END IF;

  IF (length(src)-length(replace(src,a_old,'')))/length(a_old) <> 1 THEN
      RAISE EXCEPTION 'anchor A matched % times', (length(src)-length(replace(src,a_old,'')))/length(a_old); END IF;
  IF (length(src)-length(replace(src,b_old,'')))/length(b_old) <> 1 THEN
      RAISE EXCEPTION 'anchor B matched % times', (length(src)-length(replace(src,b_old,'')))/length(b_old); END IF;
  IF (length(src)-length(replace(src,c_old,'')))/length(c_old) <> 1 THEN
      RAISE EXCEPTION 'anchor C matched % times', (length(src)-length(replace(src,c_old,'')))/length(c_old); END IF;
  IF (length(src)-length(replace(src,d_old,'')))/length(d_old) <> 1 THEN
      RAISE EXCEPTION 'anchor D matched % times', (length(src)-length(replace(src,d_old,'')))/length(d_old); END IF;

  out_s := replace(replace(replace(replace(src,a_old,a_new),b_old,b_new),c_old,c_new),d_old,d_new);
  IF out_s = src THEN RAISE EXCEPTION 'patch produced no change'; END IF;

  EXECUTE out_s;
END
$patch$;
