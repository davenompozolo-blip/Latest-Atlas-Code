-- Universe price sync + a validation check that can see it fail.
--
-- WHAT WAS BROKEN
-- ---------------
-- `price_history` holds ~1,523 symbols. Only ~67 of them were being refreshed.
--
-- `sync_alpaca_prices` derives its symbol list by joining `positions`, so it
-- prices the book and nothing else. That is correct for what it was written to
-- do, and it has never failed — 17 consecutive nightly runs, every one
-- 'success', 1.3-3.9s, 228-330 rows. The other ~1,441 names arrived in the
-- one-off Trade backfill and then had no writer at all. Every non-held name
-- froze at 2026-08-10 and stayed frozen for eleven sessions.
--
-- Held names:      median last bar 2026-08-21  (current)
-- Universe names:  median last bar 2026-08-10  (frozen)
--
-- This is why the terminal felt "on and off" and inconsistent between
-- components rather than plainly broken. Anything reading a held name was
-- correct; anything reading the wider universe — screener, valuation comps,
-- bench peers, correlation inputs, the has_prices flag on ticker search — was
-- serving prices up to eleven sessions old, with no error anywhere to show it.
--
-- WHY NOTHING CAUGHT IT
-- ---------------------
-- `price_coverage` asks whether every traded day has a price book, counting
-- only holdings: "Every traded day in the last 30 has a price book (70
-- holdings tracked)". It passed, correctly, every single night. A check scoped
-- to the book cannot see the universe stop. Same lesson as the views and the
-- bench pager, in a third layer: price_history is a 1,500-name universe, not
-- the book, and anything that reasons about it must say which one it means.

-- ── 1. Price the universe, not just the book ────────────────────────────────
-- 23:20 Mon-Sat: after the book run (22:00) and clear of the trade chain's
-- 22:30-23:15 window, so a ~1,500-symbol job never contends with the stages
-- gated on prices being current. Five-day window for the same reason the book
-- run uses one — an overlapping upsert is free on
-- (asset_id, price_date, "interval"), so a missed night self-heals on the next
-- run instead of leaving a permanent hole.
select cron.unschedule('sync_alpaca_prices_universe')
where exists (select 1 from cron.job where jobname = 'sync_alpaca_prices_universe');

select cron.schedule('sync_alpaca_prices_universe', '20 23 * * 1-6', $c$
    select net.http_post(
      url := 'https://vdmojjszvvcithuxwexx.supabase.co/functions/v1/sync_alpaca_prices',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object(
        'scope', 'universe',
        'source', 'cron_universe',
        'start_date', (current_date - 5)::text,
        'end_date', (current_date - 1)::text
      ),
      timeout_milliseconds := 300000
    );
$c$);

-- ── 2. Let validation see the universe ──────────────────────────────────────
-- Warning, not critical: a stale universe degrades comparison surfaces, it
-- does not make the book wrong, and per the standing rule a light that cannot
-- go green is one you learn to ignore. It goes critical only if the universe
-- falls more than a fortnight behind the book, which no longer happens once
-- the job above runs.
create or replace function public.atlas_check_universe_price_coverage()
returns table (check_name text, status text, severity text, message text, details jsonb)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
    v_book_max   date;
    v_uni_median date;
    v_uni_count  bigint;
    v_lag        integer;
    v_status     text;
    v_severity   text;
begin
    with held as (select distinct asset_id from positions where quantity <> 0),
    last_bar as (
        select ph.asset_id, max(ph.price_date) as last_date
          from price_history ph
         where ph."interval" = '1d'
         group by ph.asset_id
    )
    select max(lb.last_date) filter (where h.asset_id is not null),
           percentile_disc(0.5) within group (
               order by lb.last_date) filter (where h.asset_id is null),
           count(*) filter (where h.asset_id is null)
      into v_book_max, v_uni_median, v_uni_count
      from last_bar lb
      left join held h on h.asset_id = lb.asset_id;

    v_lag := coalesce(v_book_max, current_date) - coalesce(v_uni_median, current_date);

    -- Measured against the book's own newest bar, never against now(): the
    -- universe is not late on a weekend, and wall-clock would fire every
    -- Sunday exactly like the feed_coverage bug this avoids.
    if v_lag <= 3 then
        v_status := 'passed';   v_severity := 'info';
    elsif v_lag <= 14 then
        v_status := 'warning';  v_severity := 'warning';
    else
        v_status := 'failed';   v_severity := 'critical';
    end if;

    return query select
        'universe_price_coverage'::text,
        v_status,
        v_severity,
        case when v_lag <= 3
             then format('Universe priced with the book (%s non-held symbols, median lag %s day(s)).',
                         v_uni_count, v_lag)
             else format('Universe price feed is %s day(s) behind the book: %s non-held symbols, median last bar %s vs book %s.',
                         v_lag, v_uni_count, v_uni_median, v_book_max)
        end,
        jsonb_build_object(
            'book_last_bar', v_book_max,
            'universe_median_last_bar', v_uni_median,
            'universe_symbols', v_uni_count,
            'lag_days', v_lag
        );
end;
$fn$;

comment on function public.atlas_check_universe_price_coverage() is
  'Universe price freshness vs the book. price_coverage only counts holdings, '
  'so it passed every night through an eleven-session universe freeze.';

-- ── 3. Log it alongside the rest ────────────────────────────────────────────
-- Appended to atlas_run_validation's cron slot rather than spliced into its
-- body: the runner assembles every check into one v_results array before
-- inserting, so adding one means re-declaring the whole function. Re-emitting
-- ~170 lines of plpgsql to append ten is how a transcription error gets into
-- the health spine. This writes the same row shape to the same table on the
-- same schedule, and escalates atlas_sync_status on critical exactly as the
-- runner does.
create or replace function public.atlas_log_universe_price_coverage()
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
    r record;
begin
    select * into r from atlas_check_universe_price_coverage();

    insert into atlas_validation_log (check_name, status, severity, message, details)
    values (r.check_name, r.status, r.severity, r.message, coalesce(r.details, '{}'::jsonb));

    if r.severity = 'critical' and r.status <> 'passed' then
        update atlas_sync_status
           set last_sync_status       = 'error',
               last_validation_passed = false,
               consecutive_failures   = consecutive_failures + 1,
               updated_at             = now()
         where id = 1;

        insert into atlas_memory (category, key, content, tags, priority, source)
        values ('bug', 'universe_price_coverage', r.message,
                array['validation', 'prices'], 2, 'atlas_run_validation')
        on conflict (category, key) do update
           set content = excluded.content, updated_at = now();
    end if;
end;
$fn$;

select cron.unschedule('atlas_run_validation')
where exists (select 1 from cron.job where jobname = 'atlas_run_validation');

select cron.schedule('atlas_run_validation', '40 23 * * 1-5', $c$
    select public.atlas_run_validation();
    select public.atlas_log_universe_price_coverage();
$c$);
