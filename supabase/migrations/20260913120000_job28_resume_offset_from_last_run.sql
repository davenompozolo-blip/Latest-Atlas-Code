-- NOTE: this file was applied live reading the cursor through a bare integer
-- cast on the JSON extraction, and CI's unsafe-casts guard rejected it before
-- merge. It is corrected here so
-- a fresh apply never creates the unsafe version even briefly;
-- 20260913150000_job28_next_offset_safe_cast.sql is what repaired the already-
-- migrated database, and applying both in order is idempotent.

-- Job 28's universe offset was a CALENDAR formula, not a cursor:
--     'offset', ((extract(doy from current_date)::int * 720) % 7680)
--
-- So every weekday it jumped 720 symbols forward regardless of how many the
-- run actually managed. With the wall-clock budget a run covers ~90 symbols,
-- so ~630 of every 720 were stepped over and never revisited -- a permanent
-- hole, not a delay. `equity_cache` carries 892 overview rows against a 7,943
-- symbol universe: 11% after months of the job reporting healthy.
--
-- The edge function already publishes an honest cursor. Its own comment says
-- why: "a caller that resumes from next_offset after a truncated run would
-- otherwise skip every symbol the budget cut off, silently and permanently."
-- Nothing was reading it. This makes the caller resume.

create or replace function public.atlas_fundamentals_next_offset()
returns integer
language sql
stable
set search_path = public, pg_catalog
as $$
  -- The last UNIVERSE run's cursor, wrapped at the live universe size so the
  -- rotation closes instead of paginating off the end. Falls back to 0, which
  -- is also what a first run after this migration gets.
  --
  -- Scoped to mode='universe': job 13 sends an explicit holdings list and its
  -- next_offset is meaningless here -- reading it would reset the rotation to
  -- the size of the book every weekday at 12:00.
  --
  -- safe_bigint, never a bare ::int. sync_log.details is a JSONB blob and this
  -- function is called from cron.job.command: a bare cast on a malformed row
  -- would not degrade the offset, it would stop job 28 firing at all. The rows
  -- that motivate it are already in the table -- the reaped runs #46383 and
  -- #46964 carry details with next_offset absent. safe_bigint returns NULL
  -- instead of raising, so a bad row falls through to the next candidate and,
  -- failing that, to 0.
  select coalesce(
    (select (public.safe_bigint(s.details->>'next_offset')
              % greatest((select count(*)::bigint from public.assets
                           where asset_class in ('Stock','us_equity','equity','etf')), 1))::int
       from public.sync_log s
      where s.function_name = 'sync_fundamentals'
        and s.details->>'mode' = 'universe'
        and public.safe_bigint(s.details->>'next_offset') is not null
      order by s.id desc
      limit 1),
    0);
$$;

comment on function public.atlas_fundamentals_next_offset() is
'Resume cursor for cron job 28 (sync_universe_fundamentals): the last universe run''s details.next_offset, wrapped at the equity universe size. Replaces a day-of-year formula that advanced 720/day while the wall-clock budget only covered ~90, permanently skipping the remainder.';

-- Postgres grants EXECUTE to PUBLIC by default and anon/authenticated inherit
-- it from there, so revoking those roles by name alone leaves the grant in
-- place. Revoke PUBLIC explicitly. pg_cron executes as the job owner, so the
-- schedule is unaffected.
revoke execute on function public.atlas_fundamentals_next_offset() from public, anon, authenticated;

-- limit 300 is the function's own hard clamp (Math.min(300, ...)). Asking for
-- 720 was asking for something it could never return, which made the log read
-- as a 720-symbol slice that only ever attempted a fraction of one.
select cron.alter_job(
  28,
  command := $cmd$
  select net.http_post(
    url := 'https://vdmojjszvvcithuxwexx.supabase.co/functions/v1/sync_fundamentals',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'offset', public.atlas_fundamentals_next_offset(),
      'limit', 300, 'only_missing', true),
    timeout_milliseconds := 280000);
  $cmd$
);
