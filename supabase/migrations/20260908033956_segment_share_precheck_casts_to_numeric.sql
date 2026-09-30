-- `marginal_vol_contribution` is double precision, so the pre-write share
-- check's round(x, n) had no matching function. Cast at the aggregate.
DO $$
DECLARE src text; patched text; a_old text; n int;
BEGIN
    SELECT pg_get_functiondef(oid) INTO src FROM pg_proc
     WHERE proname = 'atlas_write_segment_verdicts';

    IF position('sum(rk.rc)::numeric' in src) > 0 THEN
        RAISE NOTICE 'already cast'; RETURN;
    END IF;

    a_old := E'         sg AS (SELECT p.grouping, sum(rk.rc) rc, sum(rk.w) w\n';
    n := (length(src) - length(replace(src, a_old, ''))) / length(a_old);
    IF n <> 1 THEN RAISE EXCEPTION 'anchor matched % times', n; END IF;

    patched := replace(src, a_old,
        E'         sg AS (SELECT p.grouping, sum(rk.rc)::numeric rc, sum(rk.w)::numeric w\n');
    EXECUTE patched;
END $$;
