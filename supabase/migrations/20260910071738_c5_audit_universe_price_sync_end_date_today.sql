-- Audit finding (2026-09-10): the universe price leg was pinned to yesterday.
--
-- cron.job 34 sync_alpaca_prices_universe sent
--     'end_date', (current_date - 1)
-- while the book leg (job 17, 22:00) sends
--     'end_date', current_date
--
-- So every non-held symbol -- ~1,900 of them, including 13 of the 16 A0
-- regime legs -- was permanently ONE SESSION behind the book, by
-- construction, every night. Not a hole: the five-day window re-fetches, so
-- the bar always arrives the following night. Permanently late, never
-- missing, which is why nothing caught it:
--
--   * universe_price_coverage passes at a median lag <= 3 days, so a
--     structural 1-day lag sits inside its tolerance for weekends and
--     holidays. The check was not wrong; it simply cannot distinguish
--     "Saturday" from "always a day late".
--   * The job logs success every night, because it is succeeding at what it
--     was told to fetch.
--
-- C5's reconciliation is what surfaced it: Yahoo had 2026-09-09 for all 16
-- legs while Alpaca had it for only the 3 that are also held (SPY, XLE,
-- CPER) and therefore covered by the book leg an hour earlier.
--
-- The book leg proves current_date is available at 22:00 UTC (18:00 ET), so
-- it is certainly available at 23:20. The upsert on
-- (asset_id, price_date, "interval") makes the overlap free.

select cron.alter_job(
    (select jobid from cron.job where jobname = 'sync_alpaca_prices_universe'),
    command := $cmd$
    select net.http_post(
      url := 'https://vdmojjszvvcithuxwexx.supabase.co/functions/v1/sync_alpaca_prices',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object(
        'scope', 'universe',
        'source', 'cron_universe',
        'start_date', (current_date - 5)::text,
        'end_date', current_date::text
      ),
      timeout_milliseconds := 300000
    );
$cmd$);
