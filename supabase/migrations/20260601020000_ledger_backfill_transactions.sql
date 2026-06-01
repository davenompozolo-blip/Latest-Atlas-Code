-- ============================================================
-- ATLAS Ledger — backfill from real trade history
--
-- Reconstructs an `executed` decision for every historical
-- transaction in vw_transactions, so the Ledger opens with the
-- real book instead of an empty chain.
--
-- Conviction is a SIZE-DERIVED PROXY, not a stated conviction:
--   conviction = percentile rank of |notional| across all trades
--   (biggest ticket ≈ 100, smallest ≈ 0)
-- This is tagged explicitly in signal_snapshot.source so the
-- Ledger never passes it off as a real ex-ante conviction.
--
-- Intent:  buy → add;  sell → exit if it zeroes the running
--          position, else trim.
--
-- Rows are inserted in chronological order so the hash-chain
-- (seq + prev_hash) builds forward in time. Idempotent: skips
-- entirely if a backfill has already run.
-- ============================================================

do $$
declare
  already int;
begin
  select count(*) into already
  from decisions
  where signal_snapshot->>'source' = 'backfill:transactions';

  if already > 0 then
    raise notice 'Backfill already present (% rows) — skipping', already;
    return;
  end if;

  insert into decisions
    (decided_at, symbol, entity_type, decision_type, intent,
     conviction, signal_snapshot, rationale, benchmark)
  select
    t.transaction_date,
    t.symbol,
    'holding',
    'executed',
    case
      when t.side = 'buy' then 'add'
      when t.running_qty <= 0.0001 then 'exit'
      else 'trim'
    end,
    t.conv,
    jsonb_build_object(
      'source',          'backfill:transactions',
      'transaction_id',  t.id,
      'side',            t.side,
      'quantity',        t.quantity,
      'price',           t.price,
      'notional',        round(t.notional)::numeric,
      'notional_pctile', t.conv,
      'conviction_basis','order_size_percentile'
    ),
    initcap(t.side) || ' ' || t.symbol || ' · $' || to_char(round(t.notional), 'FM999,999,990')
      || ' (' || t.conv || 'th pct of order size)',
    'SPY'
  from (
    select
      tx.id, tx.symbol, tx.transaction_date, tx.quantity, tx.price, tx.notional,
      case when tx.transaction_type = 'orderside.buy' then 'buy' else 'sell' end as side,
      round((percent_rank() over (order by abs(tx.notional))) * 100)::int as conv,
      sum(case when tx.transaction_type = 'orderside.buy' then tx.quantity else -tx.quantity end)
        over (partition by tx.symbol order by tx.transaction_date
              rows between unbounded preceding and current row) as running_qty
    from vw_transactions tx
    where tx.transaction_type in ('orderside.buy','orderside.sell')
      and tx.notional is not null
  ) t
  order by t.transaction_date asc;

  raise notice 'Backfilled % decisions from transactions', (select count(*) from decisions where signal_snapshot->>'source' = 'backfill:transactions');
end $$;
