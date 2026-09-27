-- I-1b: before the chain goes live, make every hard edge a real data dependency.
--
-- hard=true blocks a stage when its upstream errors; hard=false only orders it.
-- The I-1 seed made the whole trade-sync sequence hard, end to end, into the
-- verdict job. Measured over the week before go-live that would have cost the
-- verdict history two nights in five: `trade_sync_signals` failed on 2026-09-22
-- and 2026-09-24 (handler error, row closed ~2 h later), and on 2026-09-25 the
-- Vercel ledger snapshot timed out (504). On all three nights the clock ran
-- every downstream job anyway and each one succeeded -- because none of them
-- reads what the failed stage writes.
--
-- The rule applied here: an edge is hard only when the successor reads the
-- predecessor's output FOR TODAY (by date), or a documented gate says so.
-- Otherwise it is ordering, and a failure upstream runs the successor on the
-- inputs it already has -- which is exactly what the clock did.
--
--   edge                                   reads today's output?        hard
--   ts_correlations  -> ts_signals         latest risk stats, any date  false
--   ts_signals       -> ts_coherence       recomputes families itself   false
--   ts_coherence     -> ts_universe        opportunity_assessments@today TRUE (kept)
--   ts_universe      -> ts_triggers        armed triggers + closes      false
--   ts_triggers      -> ts_clusters        correlation matrix only      false
--   ts_clusters      -> write_verdicts     own preflight; a stale
--                                          partition is recorded, a
--                                          lost append-only night is not false
--   ts_triggers      -> theme_leadership   /api/nexus-theme prices      false
--   transactions_pm  -> ledger_snapshot    decisions + SPY bars         false
--   ledger_snapshot  -> refresh_position_returns
--                                          transactions + book prices   false
--   prices_book      -> prices_universe    the universe set includes
--                                          the book                     false
--
-- Every other hard edge is a real input and stays hard: prices -> correlations,
-- prices -> vol, market series -> factor scores (documented gate), factor
-- scores -> theme states / betas, betas -> regime CVaR -> VaR backtest, and
-- verdicts -> segments (segments read the stores verdicts recompute).
--
-- Also registers `write_account_book_risk` as a stage. It was a clock job at
-- 23:41 that the I-1 seed predates (MP-4e). Left on the clock under a live
-- chain it is a hazard, not a duplicate: it writes the non-default accounts'
-- book_risk_daily row with the return-engine columns NULL, and
-- atlas_write_verdicts' ON CONFLICT DO NOTHING would then keep that row
-- whenever the chain reaches verdicts after 23:41. Ordered after verdicts with
-- hard=false it only fills a night the verdict job refused.
--
-- Loosening an edge only releases work the clock already ran; it cannot make
-- a stage fire earlier than its predecessor finishes.

update public.atlas_chain_stages set hard = false
 where stage in ('ts_signals', 'ts_coherence', 'ts_triggers', 'ts_clusters',
                 'write_verdicts', 'theme_leadership', 'ledger_snapshot',
                 'refresh_position_returns', 'sync_alpaca_prices_universe');

insert into public.atlas_chain_stages
    (stage, seq, kind, target, body, gate_prices, depends_on, hard,
     not_before, dow, timeout_ms, enabled, note, max_wait_s)
values
    ('write_account_book_risk', 235, 'sql', 'atlas_write_account_book_risk()',
     '{}'::jsonb, false, 'write_verdicts', false, null, '{1,2,3,4,5}'::smallint[],
     120000, true,
     'must follow write_verdicts: writing first would leave the return-engine columns NULL under DO NOTHING',
     600)
on conflict (stage) do update set
    seq = excluded.seq, kind = excluded.kind, target = excluded.target,
    depends_on = excluded.depends_on, hard = excluded.hard, dow = excluded.dow,
    note = excluded.note;

do $$
declare v_bad text;
begin
    -- The hard set is exactly the edges documented above as real inputs.
    select string_agg(stage, ', ' order by stage) into v_bad
      from public.atlas_chain_stages
     where depends_on is not null and hard
       and stage not in ('ts_correlations', 'refresh_holding_vol_trailing',
                         'ts_universe', 'refresh_factor_scores',
                         'feed_reconciliation', 'write_theme_states',
                         'write_book_factor_betas', 'write_regime_cvar',
                         'write_var_backtest', 'write_segment_verdicts');
    if v_bad is not null then
        raise exception 'I-1b: unexpected hard edge(s): %', v_bad;
    end if;

    -- A stage's dow must be a subset of its dependency's, or it can never fire
    -- on the days outside it.
    select string_agg(s.stage, ', ') into v_bad
      from public.atlas_chain_stages s
      join public.atlas_chain_stages d on d.stage = s.depends_on
     where not (s.dow <@ d.dow);
    if v_bad is not null then
        raise exception 'I-1b: dow not a subset of the dependency''s: %', v_bad;
    end if;
end $$;
