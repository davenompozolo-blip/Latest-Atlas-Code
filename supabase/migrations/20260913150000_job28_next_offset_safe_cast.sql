-- CI's unsafe-casts guard caught a real defect, not a lint nit.
--
-- atlas_fundamentals_next_offset() read the cursor by extracting next_offset
-- from sync_log.details and casting the result straight to integer.
-- details is a JSONB blob, and a bare cast on it throws on anything that is
-- not a clean integer. This function
-- is called from cron.job.command, so a single malformed details row would not
-- degrade the offset -- it would make JOB 28 FAIL TO FIRE AT ALL, which is a
-- worse outcome than the permanently-skipped slices it was written to fix.
--
-- The rows that motivated it are already in the table: the reaped runs #46383
-- and #46964 carry details with next_offset absent entirely. The `is not null`
-- filter covered that case; it did not cover a decimal, an empty string or
-- junk, and safe_bigint does.
--
-- safe_bigint returns NULL rather than raising, so a bad row now falls through
-- to the next candidate and, failing that, to the coalesce default of 0.
-- Restarting the rotation is a cost; not running is not.
--
-- This migration is what repaired the live database. The original migration
-- (20260913120000) has also been corrected in place so a fresh apply never
-- creates the unsafe version; applying both in order is idempotent.

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
  -- safe_bigint, never a bare ::int -- see the header. `order by id desc limit
  -- 1` still picks the most recent usable cursor because the WHERE clause drops
  -- rows safe_bigint cannot parse.
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
'Resume cursor for cron job 28 (sync_universe_fundamentals): the last universe run''s details.next_offset, wrapped at the equity universe size. Replaces a day-of-year formula that advanced 720/day while the wall-clock budget only covered ~90, permanently skipping the remainder. Reads the cursor through safe_bigint: this runs inside cron.job.command, where a bare cast on a malformed details blob would stop the job firing at all.';

revoke execute on function public.atlas_fundamentals_next_offset() from public, anon, authenticated;
