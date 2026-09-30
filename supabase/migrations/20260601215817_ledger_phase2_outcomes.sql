-- ============================================================
-- ATLAS Ledger — Phase 2: outcome snapshotting
--
-- Scores every decision against its benchmark (SPY) at multiple
-- horizons and appends the result to decision_outcomes. The math
-- lives in SQL so it is deterministic, idempotent, and append-only:
-- once a horizon is snapshotted it is immutable (the table's
-- deny_mutation trigger guarantees it).
--
--   horizons: 30 / 60 / 90 calendar days, and 0 = to-date (rolling)
--   correct:  bullish call (add/hold) → beat benchmark
--             bearish call (trim/exit/avoid) → lagged benchmark
--   alpha:    entity_return - benchmark_return (raw, signed long)
--
-- A horizon is only snapshotted once it has MATURED (price data
-- exists on/after the target exit date). Immature horizons are
-- skipped and picked up on a later run — so this is safe to call
-- repeatedly (e.g. from a daily cron).
-- ============================================================

-- ── price lookup: last close at-or-before a date ────────────
-- Prefers adjusted_close (total-return) and falls back to close.
create or replace function ledger_px(p_symbol text, p_asof date)
returns numeric language sql stable as $$
  select coalesce(ph.adjusted_close, ph.close)
  from price_history ph
  join assets a on a.id = ph.asset_id
  where upper(a.symbol) = upper(p_symbol)
    and ph.price_date <= p_asof
  order by ph.price_date desc
  limit 1
$$;

-- ── the snapshotter ─────────────────────────────────────────
create or replace function snapshot_decision_outcomes()
returns integer language plpgsql as $$
declare
  inserted int := 0;
  latest_px date;
begin
  select max(price_date) into latest_px from price_history;
  if latest_px is null then return 0; end if;

  insert into decision_outcomes
    (decision_id, horizon_days, snapshot_at, entity_return, benchmark_return, alpha, correct)
  select base.decision_id, base.horizon_days, now(),
         r.entity_return, r.benchmark_return,
         r.entity_return - r.benchmark_return as alpha,
         case
           when base.intent in ('add','hold')         then r.entity_return > r.benchmark_return
           when base.intent in ('trim','exit','avoid') then r.entity_return < r.benchmark_return
           else null
         end as correct
  from (
    select
      d.id     as decision_id,
      d.symbol as symbol,
      d.intent as intent,
      h.horizon_days,
      d.decided_at::date as entry_date,
      -- target exit date: to-date (0) rolls to the latest price we have
      case when h.horizon_days = 0 then latest_px
           else (d.decided_at::date + h.horizon_days) end as exit_date,
      coalesce(d.benchmark, 'SPY') as bench
    from decisions d
    cross join (values (30),(60),(90),(0)) as h(horizon_days)
    -- only mature horizons: the target exit date must have arrived
    where (h.horizon_days = 0 or (d.decided_at::date + h.horizon_days) <= latest_px)
  ) base
  cross join lateral (
    select
      ledger_px(base.symbol, base.entry_date) as e_in,
      ledger_px(base.symbol, base.exit_date)  as e_out,
      ledger_px(base.bench,  base.entry_date) as b_in,
      ledger_px(base.bench,  base.exit_date)  as b_out
  ) px
  cross join lateral (
    select (px.e_out / nullif(px.e_in,0) - 1) as entity_return,
           (px.b_out / nullif(px.b_in,0) - 1) as benchmark_return
  ) r
  where px.e_in is not null and px.e_out is not null
    and px.b_in is not null and px.b_out is not null
  on conflict (decision_id, horizon_days) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end $$;

comment on function snapshot_decision_outcomes() is
  'Phase 2: append matured decision outcomes (entity vs SPY) at 30/60/90/to-date horizons. Idempotent; safe to run on a cron.';
