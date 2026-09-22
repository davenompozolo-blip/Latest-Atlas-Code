-- I-1: the nightly chain topology, seeded from the cron inventory as it stood
-- on 2026-09-21. Every row reproduces an existing job's target and body exactly;
-- what changes is that the stage now names its DEPENDENCY instead of a clock
-- time. Read alongside the table comment for why hard/not_before are separate.

-- kind='sql' targets are executed by atlas_chain_advance(). Constrain them to a
-- bare function call so a writable topology table can never become an arbitrary
-- SQL execution path inside a SECURITY DEFINER body. Only service_role can write
-- the table, but a definer function is exactly where that assumption should not
-- be the only thing standing in the way.
alter table public.atlas_chain_stages
    drop constraint if exists acs_sql_target_is_bare_call;
alter table public.atlas_chain_stages
    add constraint acs_sql_target_is_bare_call check (
        kind <> 'sql' or target ~ '^[a-z][a-z0-9_]*\(\s*[0-9]*\s*\)$'
    );

-- Bodies use a CLOSED placeholder set, substituted at dispatch:
--   {{today}}          -> current_date
--   {{today_minus_5}}  -> current_date - 5
-- Not an expression language. Anything needing more than a date belongs in the
-- edge function, not in a jsonb column.

insert into public.atlas_chain_stages
    (seq, stage, kind, target, body, gate_prices, depends_on, hard, not_before, dow, timeout_ms, note)
values
 ( 10,'refresh_asset_sectors','sql','atlas_refresh_asset_sectors()','{}'::jsonb,
   false, null, false, '20:45', '{1,2,3,4,5}', 120000, 'chain head'),

 ( 20,'trade_sync_assets','http','/api/trade-sync?job=assets','{}'::jsonb,
   false, 'refresh_asset_sectors', false, '21:00', '{1,2,3,4,5}', 120000,
   'ordering only: assets sync does not read the sector refresh'),

 ( 30,'sync_alpaca_prices_book','edge','sync_alpaca_prices',
   '{"source":"cron","start_date":"{{today_minus_5}}","end_date":"{{today}}"}'::jsonb,
   false, null, false, '22:00', '{1,2,3,4,5,6}', 120000,
   'not_before is REAL: Alpaca has no settled bar before the session closes'),

 ( 40,'sync_alpaca_transactions_pm','edge','sync_alpaca_transactions','{}'::jsonb,
   false, null, false, '22:10', '{1,2,3,4,5}', 120000,
   'the 13:10 run keeps its own cron entry; this is the evening leg'),

 ( 50,'refresh_holding_vol_trailing','sql','refresh_holding_vol_trailing(400)','{}'::jsonb,
   false, 'sync_alpaca_prices_book', true, null, '{1,2,3,4,5}', 120000, null),

 ( 60,'ledger_snapshot','http','/api/ledger-snapshot','{}'::jsonb,
   true, 'sync_alpaca_transactions_pm', true, null, '{1,2,3,4,5}', 120000, null),

 ( 70,'ts_correlations','http','/api/trade-sync?job=correlations','{}'::jsonb,
   true, 'sync_alpaca_prices_book', true, null, '{1,2,3,4,5}', 180000, null),

 ( 80,'ts_signals','http','/api/trade-sync?job=signals','{}'::jsonb,
   true, 'ts_correlations', true, null, '{1,2,3,4,5}', 300000, null),

 ( 90,'sync_market_series','edge','backfill_market_prices','{"lookback_days":10}'::jsonb,
   false, null, false, '22:50', '{1,2,3,4,5,6}', 120000,
   'not_before is REAL: todaysBarIsPartial() refuses an in-progress Yahoo bar'),

 (100,'ts_coherence','http','/api/trade-sync?job=coherence','{}'::jsonb,
   true, 'ts_signals', true, null, '{1,2,3,4,5}', 300000, null),

 (110,'options_snapshot','http','/api/options-snapshot','{}'::jsonb,
   false, null, false, '23:00', '{1,2,3,4,5}', 120000, 'Alpha Vantage sourced, ungated'),

 (120,'ts_universe','http','/api/trade-sync?job=universe','{}'::jsonb,
   true, 'ts_coherence', true, null, '{1,2,3,4,5}', 300000, null),

 (130,'load_macro_series','edge','load_macro_series','{"lookback_days":30}'::jsonb,
   false, null, false, '23:05', '{1,2,3,4,5,6}', 120000,
   'ungated on purpose: reads nothing this platform writes'),

 (140,'refresh_factor_scores','sql','atlas_run_factor_scores()','{}'::jsonb,
   false, 'sync_market_series', true, null, '{1,2,3,4,5,6}', 120000,
   'the documented gate: needs backfill_market_prices to have landed'),

 (150,'ts_triggers','http','/api/trade-sync?job=triggers','{}'::jsonb,
   true, 'ts_universe', true, null, '{1,2,3,4,5}', 300000, null),

 (160,'sync_alpaca_prices_universe','edge','sync_alpaca_prices',
   '{"scope":"universe","source":"cron_universe","start_date":"{{today_minus_5}}","end_date":"{{today}}"}'::jsonb,
   false, 'sync_alpaca_prices_book', true, null, '{1,2,3,4,5,6}', 300000,
   'end_date is {{today}}, NOT current_date-1 -- see the 2026-09-10 cron-body entry'),

 (170,'theme_leadership','http','/api/theme-leadership-snapshot','{}'::jsonb,
   true, 'ts_triggers', true, null, '{5}', 120000, 'Friday only'),

 (180,'feed_reconciliation','sql','atlas_run_feed_reconciliation()','{}'::jsonb,
   false, 'sync_market_series', true, null, '{1,2,3,4,5,6}', 120000, null),

 (190,'ts_clusters','http','/api/trade-sync?job=clusters','{}'::jsonb,
   true, 'ts_triggers', true, null, '{1,2,3,4,5}', 180000, null),

 (200,'write_theme_states','sql','atlas_write_theme_states()','{}'::jsonb,
   false, 'refresh_factor_scores', true, null, '{1,2,3,4,5,6}', 120000, null),

 (210,'refresh_position_returns','sql','atlas_refresh_position_returns()','{}'::jsonb,
   false, 'ledger_snapshot', true, null, '{1,2,3,4,5}', 120000, null),

 (220,'write_verdicts','sql','atlas_write_verdicts()','{}'::jsonb,
   false, 'ts_clusters', true, null, '{1,2,3,4,5}', 180000,
   'carries its own preflight; refreshes the tier matviews'),

 (230,'write_segment_verdicts','sql','atlas_write_segment_verdicts()','{}'::jsonb,
   false, 'write_verdicts', true, null, '{1,2,3,4,5}', 120000,
   'must follow write_verdicts: it reads the matviews that job refreshes'),

 (240,'refresh_cluster_identity','sql','atlas_refresh_cluster_identity()','{}'::jsonb,
   false, 'write_verdicts', false, null, '{1,2,3,4,5}', 120000,
   'ordering only -- its real input is universe_clusters, not the verdict write'),

 (250,'run_validation','sql','atlas_run_validation()','{}'::jsonb,
   false, 'write_segment_verdicts', false, null, '{1,2,3,4,5}', 120000,
   'hard=false on purpose: validation must grade a night that FAILED'),

 (260,'log_universe_price_coverage','sql','atlas_log_universe_price_coverage()','{}'::jsonb,
   false, 'run_validation', false, null, '{1,2,3,4,5}', 120000, null),

 (270,'write_regime_cvar','sql','atlas_write_regime_cvar()','{}'::jsonb,
   false, 'refresh_factor_scores', true, null, '{1,2,3,4,5,6}', 120000, null),

 (280,'write_var_backtest','sql','atlas_write_var_backtest()','{}'::jsonb,
   false, 'write_regime_cvar', true, null, '{1,2,3,4,5,6}', 120000,
   'gates on book_regime_cvar holding a snapshot, not on the upstream status')
on conflict (stage) do nothing;
