-- Close the sync_log row cron job 28 left open on 2026-09-10 12:30.
--
-- The invocation was killed by the edge-function wall clock mid-loop: 30 rows
-- landed in equity_cache between 12:30:11 and 12:32:29 and nothing after, so
-- the terminal PATCH never ran. The function cannot come back to close it.
--
-- Recorded as `error` with the real cause rather than left `running`: an open
-- row that will never close is not evidence of a job in progress, and
-- stuck_syncs should report live state tonight, not a row already diagnosed.
-- duration_ms is GENERATED ALWAYS -- set finished_at and let it derive.
--
-- The code fix (a wall-clock budget so the loop always reaches the close) is
-- in PR #768 and is NOT deployed. Until it is, expect one such row per weekday
-- from job 28.
update public.sync_log
   set status        = 'error',
       finished_at   = timestamptz '2026-09-10 12:32:29.065+00',
       error_message = 'invocation killed by edge-function wall clock mid-loop; '
                       'terminal close never ran. 30 of 300 symbols cached '
                       '(12:30:11 to 12:32:29). Closed retrospectively; see PR #768.',
       details       = coalesce(details, '{}'::jsonb) || jsonb_build_object(
                         'closed_retrospectively', true,
                         'enriched_observed', 30,
                         'last_cache_write', '2026-09-10T12:32:29.065+00:00',
                         'cause', 'wall_clock_kill_no_budget')
 where id = 46313
   and status = 'running'
   and finished_at is null;
