-- ============================================================
-- One scheduler, one ordered chain
-- ------------------------------------------------------------
-- Scheduled work lived in three places: pg_cron (9 jobs), Vercel Cron (7 in
-- vercel.json) and GitHub Actions (2 workflows). Only the pg_cron half was
-- reliably firing — of the seven Vercel crons, only options-snapshot and
-- vol-dispersion-sync demonstrably produced rows.
--
-- Worse than the missing jobs was the missing ORDER. The nightly work spanned
-- 21:00–23:00 across two schedulers with no dependency between them, and
-- atlas_run_validation ran at 22:40 — BEFORE options-snapshot at 23:00 and
-- before the signals job at 22:45. Validation could therefore never see the
-- night it was validating; it always graded the previous day's result.
--
-- This makes pg_cron the only scheduler and turns the night into a chain.
--
-- Firing everything at one instant would have been the wrong fix: these stages
-- have real dependencies — prices must land before signals, signals before
-- validation — and a simultaneous fire makes each stage read a table its
-- upstream has not written yet. That is non-deterministic staleness, which
-- presents exactly like the bug it was meant to cure. So the stages stay
-- staggered, and each one is GATED on its upstream actually having landed.
--
-- Transport: the Vercel handlers stay exactly where they are and keep their
-- own logic. pg_cron simply becomes the thing that calls them, over pg_net,
-- with the same Bearer CRON_SECRET the Vercel scheduler used. Nothing is
-- rewritten or ported; only the trigger moves.
-- ============================================================

-- ── The secret ────────────────────────────────────────────────
-- CRON_SECRET lives in Vercel's env. For pg_cron to call the same endpoints it
-- needs the same value, held in Supabase Vault. Until it is set, every HTTP
-- stage logs a clean 'skipped' rather than a 401 — an unconfigured chain is
-- quiet and obvious, not noisy and broken.
create or replace function public.atlas_cron_secret()
returns text
language sql
stable
security definer
set search_path to 'public', 'vault'
as $$
    select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' limit 1;
$$;

comment on function public.atlas_cron_secret() is
'The CRON_SECRET the Vercel handlers authenticate against, read from Vault.
Set it once with:  select vault.create_secret(''<value>'', ''CRON_SECRET'');
Never inline the value in a cron command — cron.job.command is world-readable
to anyone with database access.';

-- ── The gate ──────────────────────────────────────────────────
-- Everything downstream of the price sync is only meaningful once the price
-- book for the last traded session exists. This is the predicate the chain
-- gates on, and it is deliberately about DATA rather than about whether some
-- upstream job reported success: a job that succeeds and writes nothing has
-- not satisfied its dependents.
create or replace function public.atlas_prices_current()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
    select exists (
        select 1
        from price_history ph
        where ph.price_date = atlas_last_traded_day()
        group by ph.price_date
        having count(*) >= 20
    );
$$;

comment on function public.atlas_prices_current() is
'True when the price book for the last traded session has landed. The row-count
floor keeps a single stray benchmark bar from reading as a full book — the same
failure mode that let eleven Fridays pass with only a SPY row.';

-- ── Dispatch ──────────────────────────────────────────────────
-- Opens a sync_log row, checks the gate, fires the request, and records the
-- pg_net request id so the reaper can close the row with the real status.
--
-- pg_net is asynchronous: http_post returns a request id immediately and the
-- response lands in net._http_response later. A stage therefore cannot be
-- closed at dispatch time, which is precisely why every one of these jobs was
-- previously invisible. The reaper below is the other half.
create or replace function public.atlas_chain_dispatch(
    p_stage      text,
    p_path       text,
    p_gate       boolean default false,
    p_timeout_ms integer default 300000
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_secret  text;
    v_log_id  bigint;
    v_req_id  bigint;
    v_base    text := 'https://latest-atlas-code-o19a.vercel.app';
begin
    insert into sync_log (function_name, status, source, started_at)
    values (p_stage, 'running', 'pg_cron_chain', now())
    returning id into v_log_id;

    v_secret := atlas_cron_secret();
    if v_secret is null or length(trim(v_secret)) = 0 then
        update sync_log set
            status = 'skipped', finished_at = now(),
            error_message = 'CRON_SECRET not present in Vault - chain stage not armed',
            details = jsonb_build_object('path', p_path, 'reason', 'no_secret')
        where id = v_log_id;
        return v_log_id;
    end if;

    if p_gate and not atlas_prices_current() then
        update sync_log set
            status = 'skipped', finished_at = now(),
            error_message = 'Upstream gate not met - no price book for '
                            || coalesce(atlas_last_traded_day()::text, 'unknown'),
            details = jsonb_build_object('path', p_path, 'reason', 'gate_prices_not_current',
                                         'last_traded_day', atlas_last_traded_day())
        where id = v_log_id;
        return v_log_id;
    end if;

    select net.http_post(
        url := v_base || p_path,
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || v_secret,
            'Content-Type', 'application/json'),
        body := jsonb_build_object('source', 'pg_cron_chain'),
        timeout_milliseconds := p_timeout_ms
    ) into v_req_id;

    update sync_log set
        details = jsonb_build_object('path', p_path, 'request_id', v_req_id)
    where id = v_log_id;

    return v_log_id;
end;
$$;

-- ── Reap ──────────────────────────────────────────────────────
-- Closes dispatched rows once pg_net has the response, and fails anything
-- still open well past its timeout. This also cures the stuck-'running' class
-- generally: sync_funddata_prices has left an open row on every run since
-- 2026-06-05 because its own terminal PATCH is swallowed by a console.warn.
create or replace function public.atlas_chain_reap()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_closed integer := 0;
begin
    with open_rows as (
        -- safe_bigint, not ::bigint: details is jsonb and a malformed value
        -- would throw and take the whole reaper down. See docs/DATA_TRUST.md.
        select sl.id, safe_bigint(sl.details->>'request_id') as req_id, sl.started_at
        from sync_log sl
        where sl.source = 'pg_cron_chain'
          and sl.status = 'running'
          and sl.details ? 'request_id'
    ),
    matched as (
        select o.id, o.started_at, r.status_code, r.error_msg, r.timed_out, r.content
        from open_rows o
        join net._http_response r on r.id = o.req_id
    ),
    upd as (
        update sync_log sl set
            status = case when m.status_code between 200 and 299 then 'success' else 'error' end,
            -- Never assign duration_ms: it is GENERATED ALWAYS from
            -- (finished_at - started_at). Setting finished_at derives it.
            finished_at = now(),
            error_message = case
                when m.status_code between 200 and 299 then null
                else coalesce(m.error_msg, 'HTTP ' || coalesce(m.status_code::text, '?'))
                     || case when m.content is not null then ' - ' || left(m.content, 300) else '' end
            end,
            details = sl.details || jsonb_build_object('status_code', m.status_code,
                                                       'timed_out', m.timed_out)
        from matched m
        where sl.id = m.id
        returning 1
    )
    select count(*) into v_closed from upd;

    -- pg_net purges _http_response on a retention window, so a row whose
    -- response has aged out would otherwise stay 'running' for ever.
    update sync_log set
        status = 'error', finished_at = now(),
        error_message = coalesce(error_message, 'No pg_net response recorded before retention expiry')
    where source = 'pg_cron_chain'
      and status = 'running'
      and started_at < now() - interval '2 hours';

    return v_closed;
end;
$$;

grant execute on function public.atlas_cron_secret()   to service_role;
grant execute on function public.atlas_prices_current() to service_role, authenticated;
grant execute on function public.atlas_chain_dispatch(text, text, boolean, integer) to service_role;
grant execute on function public.atlas_chain_reap()    to service_role;

-- ── sync_log status vocabulary ───────────────────────────────
-- 'skipped' is added because a stage that declined to run is neither a success
-- nor an error, and a skipped stage that reads as success is exactly how a dark
-- feed hides.
--
-- This also unblocks sync_funddata_prices. Its 41 rows open since 2026-06-05
-- were never a hung job: it patched its terminal status as 'succeeded' /
-- 'failed' / 'skipped_cache' / 'debug', none of which this constraint allowed,
-- so every close was rejected with 23514 and then swallowed by the console.warn
-- in sbPatch. The scrape always worked; only the bookkeeping was refused. The
-- function now writes the permitted vocabulary and logs patch failures loudly.
alter table public.sync_log drop constraint if exists sync_log_status_check;
alter table public.sync_log add constraint sync_log_status_check
    check (status = any (array[
        'running'::text, 'success'::text, 'partial'::text,
        'error'::text, 'skipped'::text
    ]));

-- ── The schedule ─────────────────────────────────────────────
-- cron.schedule upserts by jobname, so this block is idempotent.
--
-- Nightly chain, weekdays UTC:
--   21:00  trade_sync_assets     universe/asset refresh          (no gate, first)
--   22:00  alpaca prices         [pre-existing, Mon-Sat]
--   22:10  alpaca transactions   [pre-existing]
--   22:25  holding vol trailing  [pre-existing]
--   22:30  ledger snapshot       gated on prices
--   22:45  trade_sync_all        signals/coherence, gated on prices
--   23:00  options snapshot      (Alpha Vantage sourced, no in-DB gate)
--   23:15  theme leadership      Fridays, gated on prices
--   23:40  validation            MOVED from 22:40 - see below
--
-- Validation previously ran at 22:40, ahead of the signals job at 22:45 and
-- options at 23:00, so it could never see the night it was grading. It now
-- runs last.
select cron.schedule('chain_trade_sync_assets', '0 21 * * 1-5',
  $c$select public.atlas_chain_dispatch('trade_sync_assets', '/api/trade-sync?job=assets', false);$c$);
select cron.schedule('chain_ledger_snapshot', '30 22 * * 1-5',
  $c$select public.atlas_chain_dispatch('ledger_snapshot', '/api/ledger-snapshot', true);$c$);
select cron.schedule('chain_trade_sync_all', '45 22 * * 1-5',
  $c$select public.atlas_chain_dispatch('trade_sync_all', '/api/trade-sync?job=all', true);$c$);
select cron.schedule('chain_options_snapshot', '0 23 * * 1-5',
  $c$select public.atlas_chain_dispatch('options_snapshot', '/api/options-snapshot', false);$c$);
select cron.schedule('chain_theme_leadership', '15 23 * * 5',
  $c$select public.atlas_chain_dispatch('theme_leadership', '/api/theme-leadership-snapshot', true);$c$);
select cron.schedule('chain_vol_dispersion', '30 2 * * 2-6',
  $c$select public.atlas_chain_dispatch('vol_dispersion_sync', '/api/vol-dispersion-sync', false);$c$);
select cron.schedule('chain_sync_valuations', '0 6 * * 1',
  $c$select public.atlas_chain_dispatch('sync_valuations', '/api/sync-valuations', true);$c$);
select cron.schedule('atlas_chain_reap', '*/15 * * * *',
  $c$select public.atlas_chain_reap();$c$);

select cron.schedule('atlas_run_validation', '40 23 * * 1-5',
  $c$select public.atlas_run_validation();$c$);

-- sync_funddata_prices_daily fired at 05:00 UTC = 07:00 SAST, nine hours BEFORE
-- the JSE close it exists to capture. The GitHub Actions copy of this job had
-- the timing right (14:00 UTC) and the pg_cron copy did not; the correct time
-- wins and the workflow's schedule is retired.
select cron.schedule('sync_funddata_prices_daily', '30 14 * * 1-5', $c$
  select net.http_post(
    url := 'https://vdmojjszvvcithuxwexx.supabase.co/functions/v1/sync_funddata_prices',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"source":"pg_cron"}'::jsonb,
    timeout_milliseconds := 120000);
$c$);

-- The universe-wide fundamentals sweep, formerly GitHub Actions at 12:30. It
-- complements the 12:00 holdings-only job rather than duplicating it: that one
-- keeps the book fresh, this rotates through the ~7.6k universe by day-of-year.
select cron.schedule('sync_universe_fundamentals', '30 12 * * 1-5', $c$
  select net.http_post(
    url := 'https://vdmojjszvvcithuxwexx.supabase.co/functions/v1/sync_fundamentals',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'offset', ((extract(doy from current_date)::int * 720) % 7680),
      'limit', 720, 'only_missing', true),
    timeout_milliseconds := 280000);
$c$);
