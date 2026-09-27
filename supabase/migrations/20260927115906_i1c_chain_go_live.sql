-- I-1 GO-LIVE. Applied 2026-09-27, after the shadow nights of 2026-09-22..25
-- were read out of vw_chain_status and I-1b made every hard edge a real input.
--
-- Flipping the chain live is two things: run atlas_chain_advance(false) instead
-- of (true), and stop the 27 stage cron entries firing the same work on a clock.
-- Both must happen together -- leaving the clock armed beside a live chain means
-- every stage runs twice.
--
-- READ THIS BEFORE APPLYING
--
-- 1. Job 15 `sync_alpaca_transactions` is scheduled `10 13,22 * * 1-5` -- TWO
--    times in one entry. The chain covers only the 22:10 leg, so unscheduling
--    it outright would silently kill the 13:10 intraday run. It is replaced by
--    a 13:10-only entry below rather than removed.
--
-- 2. `atlas_chain_reap` (job 25) STAYS. atlas_chain_advance() calls it on every
--    tick, but the tick only runs 20:00-01:59 and dispatch rows opened outside
--    that window still need closing.
--
-- 5. Two clock jobs postdate the I-1 seed and are stages now:
--    `atlas_write_book_factor_betas` (MP-6) and `atlas_write_account_book_risk`
--    (MP-4e, registered by I-1b). The second MUST go: on the clock at 23:41 it
--    would write the non-default accounts' book_risk_daily row before a chain
--    that reaches verdicts later, and verdicts' DO NOTHING would keep it.
--
-- 6. Clock jobs that are NOT stages and stay: `chain_vol_dispersion` (02:30),
--    `chain_sync_valuations` (06:05), the 12:00/12:30 fundamentals syncs,
--    `sync_funddata_prices_daily`, `sync_portfolio_history_nightly` (01:00).
--
-- 3. Nothing here touches the intraday writers -- `sync-alpaca-positions`
--    (*/5) and `refresh-nexus-holdings` (*/10). They are not part of the
--    nightly chain and are what a daytime reader actually sees.
--
-- 4. Rollback is symmetric: unschedule the live tick, re-schedule the 27
--    entries from their definitions in git history, re-arm the shadow tick.

select cron.unschedule('atlas_chain_advance_shadow');

select cron.schedule('atlas_chain_advance', '* 20-23,0-1 * * *',
    $$select public.atlas_chain_advance(false);$$);

-- The clock entries for the stages the chain now owns (job 15 below).
select cron.unschedule(j) from unnest(array[
    'refresh_asset_sectors',
    'chain_trade_sync_assets',
    'sync_alpaca_prices_daily',
    'refresh_holding_vol_trailing',
    'chain_ledger_snapshot',
    'chain_ts_correlations',
    'chain_ts_signals',
    'sync_market_series_daily',
    'chain_ts_coherence',
    'chain_options_snapshot',
    'chain_ts_universe',
    'load_macro_series_daily',
    'refresh_factor_scores_nightly',
    'chain_ts_triggers',
    'sync_alpaca_prices_universe',
    'chain_theme_leadership',
    'atlas_feed_reconciliation_nightly',
    'chain_ts_clusters',
    'atlas_write_theme_states',
    'refresh_position_returns',
    'atlas_write_verdicts',
    'atlas_write_segment_verdicts',
    'atlas_refresh_cluster_identity',
    'atlas_run_validation',
    'atlas_write_regime_cvar',
    'atlas_write_var_backtest',
    'atlas_write_book_factor_betas',
    'atlas_write_account_book_risk'
]) as j;

-- Job 15 carried BOTH the 13:10 and 22:10 legs. Keep the intraday one.
select cron.unschedule('sync_alpaca_transactions');
select cron.schedule('sync_alpaca_transactions_intraday', '10 13 * * 1-5', $cmd$
 select net.http_post(
   url := 'https://vdmojjszvvcithuxwexx.supabase.co/functions/v1/sync_alpaca_transactions',
   headers := '{}'::jsonb,
   body := jsonb_build_object('time', now())::jsonb,
   timeout_milliseconds := 120000
 ) as request_id;
$cmd$);

-- Every stage now has exactly one scheduler. Refuse to finish otherwise.
do $$
declare v_left text;
begin
    select string_agg(jobname, ', ') into v_left from cron.job
     where jobname in ('refresh_asset_sectors','chain_trade_sync_assets',
        'sync_alpaca_prices_daily','refresh_holding_vol_trailing',
        'chain_ledger_snapshot','chain_ts_correlations','chain_ts_signals',
        'sync_market_series_daily','chain_ts_coherence','chain_options_snapshot',
        'chain_ts_universe','load_macro_series_daily',
        'refresh_factor_scores_nightly','chain_ts_triggers',
        'sync_alpaca_prices_universe','chain_theme_leadership',
        'atlas_feed_reconciliation_nightly','chain_ts_clusters',
        'atlas_write_theme_states','refresh_position_returns',
        'atlas_write_verdicts','atlas_write_segment_verdicts',
        'atlas_refresh_cluster_identity','atlas_run_validation',
        'atlas_write_regime_cvar','atlas_write_var_backtest',
        'atlas_write_book_factor_betas','atlas_write_account_book_risk',
        'sync_alpaca_transactions','atlas_chain_advance_shadow');
    if v_left is not null then
        raise exception 'I-1 go-live: still on the clock: %', v_left;
    end if;
    if not exists (select 1 from cron.job where jobname = 'atlas_chain_advance')
       or not exists (select 1 from cron.job where jobname = 'sync_alpaca_transactions_intraday') then
        raise exception 'I-1 go-live: live tick or intraday transactions job missing';
    end if;
end $$;
