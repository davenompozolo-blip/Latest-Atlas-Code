-- 23:39 UTC Mon-Fri, one minute after atlas_write_segment_verdicts.
--
-- Placed AFTER both verdict jobs rather than merely after the clustering,
-- so the identity rows describe the same partition those jobs graded. The
-- chain above it is 23:10 factor scores -> 23:30 ts_clusters -> 23:37
-- verdicts -> 23:38 segments.
--
-- No gate. The function derives its as_of from universe_clusters itself, and
-- its sample is bounded at that date at both ends, so a night the clustering
-- does not advance re-states the same rows from the same inputs rather than
-- silently re-fitting an old date against a longer window. A gate here would
-- be one that tracks nothing -- the "gate you learn to ignore" in a new shape.
--
-- Weekdays only, matching the jobs it follows. `cron.schedule` is idempotent
-- on the job NAME, so re-running this migration re-points the existing job
-- rather than creating a second one.
select cron.schedule(
    'atlas_refresh_cluster_identity',
    '39 23 * * 1-5',
    $job$ select public.atlas_refresh_cluster_identity(); $job$
);
