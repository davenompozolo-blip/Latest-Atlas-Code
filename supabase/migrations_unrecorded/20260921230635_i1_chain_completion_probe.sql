-- I-1 correction: the dispatch row is NOT a completion signal for every stage.
--
-- Measured on the live chain, 2026-09-18 and 2026-09-21:
--
--   stage            dispatch row closed   handler actually ran   overshoot
--   ts_signals                    3.1 s              242.4 s        243 s
--   ts_universe                   0.13 s             241.5 s        243 s
--   ts_triggers                   0.25 s             231.0 s        233 s
--   ts_coherence                  3.8 s              222.0 s        222 s
--   ts_correlations               3.5 s               92.3 s         93 s
--   options_snapshot              0.09 s              68.8 s         74 s
--
-- atlas_chain_reap() grades on the pg_net response, and these handlers answer
-- immediately and keep working. Firing a successor off that row would start it
-- up to FOUR MINUTES before its input exists -- worse than the ten-minute clock
-- gaps this unit set out to remove, and the same stale-read failure in a new
-- place.
--
-- The overshoot is NOT universal, which is why it has to be per stage rather
-- than a blanket delay: ledger_snapshot (528 ms) and theme_leadership (38 s avg,
-- 53 s max) return on completion, and every edge function returns on completion
-- and self-logs. Only the /api/trade-sync legs and options-snapshot return early.
--
-- So a stage that cannot be graded from its own dispatch row names the row that
-- DOES grade it. Where no such row exists and none is needed, the columns are
-- NULL and the dispatch row stands.

alter table public.atlas_chain_stages
    add column if not exists completion_log_name text,
    add column if not exists completion_source   text,
    add column if not exists max_wait_s          integer not null default 600;

comment on column public.atlas_chain_stages.completion_log_name is
  'sync_log.function_name of the row that records this stage ACTUALLY finishing, '
  'when the dispatch response arrives first. NULL = the dispatch row is the '
  'completion signal (inline sql, and handlers that return on completion).';

comment on column public.atlas_chain_stages.max_wait_s is
  'How long to wait for completion_log_name to go terminal before declaring the '
  'outcome UNOBSERVED. Unobserved is not success: a stage whose completion '
  'cannot be seen must not be reported as having completed.';

alter table public.atlas_chain_stages
    drop constraint if exists acs_probe_pair;
alter table public.atlas_chain_stages
    add constraint acs_probe_pair check (
        (completion_log_name is null and completion_source is null)
     or (completion_log_name is not null and completion_source is not null)
    );

alter table public.atlas_chain_stages
    drop constraint if exists acs_max_wait_sane;
alter table public.atlas_chain_stages
    add constraint acs_max_wait_sane check (max_wait_s between 30 and 3600);

-- max_wait_s is observed max + margin, not a guess:
--   ts_* handlers peak at 255.9 s  -> 420 s
--   prices/universe peaks at 24.7 s, transactions 1.6 s, yahoo 6.8 s,
--   fred 31.8 s, options 69.9 s    -> 300 s
update public.atlas_chain_stages s set
    completion_log_name = v.log_name,
    completion_source   = v.log_source,
    max_wait_s          = v.wait_s
from (values
    ('trade_sync_assets',           'trade_sync_assets',        'vercel_cron',      300),
    ('ts_correlations',             'trade_sync_correlations',  'vercel_cron',      300),
    ('ts_signals',                  'trade_sync_signals',       'vercel_cron',      420),
    ('ts_coherence',                'trade_sync_coherence',     'vercel_cron',      420),
    ('ts_universe',                 'trade_sync_universe',      'vercel_cron',      420),
    ('ts_triggers',                 'trade_sync_triggers',      'vercel_cron',      420),
    ('ts_clusters',                 'trade_sync_clusters',      'vercel_cron',      300),
    ('options_snapshot',            'options_snapshot',         'options_snapshot', 300),
    ('sync_alpaca_prices_book',     'sync_alpaca_prices',       'cron',             300),
    ('sync_alpaca_prices_universe', 'sync_alpaca_prices',       'cron_universe',    420),
    ('sync_alpaca_transactions_pm', 'sync_alpaca_transactions', 'pg_cron',          300),
    ('sync_market_series',          'backfill_market_prices',   'yahoo',            300),
    ('load_macro_series',           'load_macro_series',        'fred',             300)
) as v(stage, log_name, log_source, wait_s)
where s.stage = v.stage;
