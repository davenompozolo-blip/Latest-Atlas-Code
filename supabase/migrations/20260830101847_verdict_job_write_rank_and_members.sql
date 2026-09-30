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

  -- Each anchor must match exactly once. A silent zero-match would leave the
  -- job unchanged while the migration reported success, which is the whole
  -- class of failure this sequence keeps finding.
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
