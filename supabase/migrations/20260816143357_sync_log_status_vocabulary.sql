-- A stage that declined to run is neither a success nor an error, and the
-- chain needs to say so. 'skipped' is added rather than overloading 'success',
-- because a skipped stage that reads as success is how a dark feed hides.
--
-- This also unblocks sync_funddata_prices, which is the real reason 41 rows
-- have sat open since 2026-06-05: it patches its terminal status as
-- 'succeeded' / 'failed' / 'skipped_cache', none of which the constraint
-- allowed, so every close was rejected with 23514 and then swallowed by the
-- console.warn at supabase/functions/sync_funddata_prices/index.ts:44. The
-- job worked perfectly; only its bookkeeping was refused.
alter table public.sync_log drop constraint if exists sync_log_status_check;

alter table public.sync_log add constraint sync_log_status_check
    check (status = any (array[
        'running'::text, 'success'::text, 'partial'::text,
        'error'::text, 'skipped'::text
    ]));
