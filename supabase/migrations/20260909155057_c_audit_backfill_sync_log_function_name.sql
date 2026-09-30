-- Cron/sync_log audit: attribute the orphaned rows.
--
-- 147 sync_log rows carried function_name = NULL: 94 from
-- `api/options-snapshot.js` and 53 from `api/vol-dispersion-sync.js`. Both
-- handlers set `source` and never `function_name`, so every row they wrote was
-- invisible to any monitoring query keyed on function_name -- which is how a
-- reader enumerates writers.
--
-- `api/trade-sync.js` already does this correctly (function_name =
-- 'trade_sync_' || job), so the two handlers were the exception, not the rule.
-- Both are fixed at the source in this same change; this backfills the history.
--
-- The backfill is exact rather than inferred: every one of the 147 rows carries
-- a `source` that is already the job's real name ('options_snapshot' or
-- 'vol_dispersion_sync'), so there is nothing to guess. Rows whose source is a
-- generic trigger label are deliberately left alone.
--
-- Note this leaves TWO rows per run for these two stages, as it already does
-- for the trade-sync stages: `atlas_chain_dispatch` writes one
-- (source='pg_cron_chain', carrying the HTTP status) and the Vercel handler
-- writes another (carrying the real work detail). That is not a duplicate --
-- read `source` to tell the layers apart.

update public.sync_log
   set function_name = source
 where function_name is null
   and source in ('options_snapshot', 'vol_dispersion_sync');
