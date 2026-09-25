-- MP-5a: repair the two ledger defects sync_alpaca_transactions v5 wrote on
-- Atlas Secondary's first day. The writer is fixed in v6
-- (supabase/functions/_shared/alpaca_fill.js); this corrects the rows it had
-- already written, which a resume-from-watermark sync never re-reads.
--
-- 1. A notional order's correcting fill carries side='buy' and a NEGATIVE qty.
--    v5 took abs(qty) and booked it as a second buy, so META / CRWV / DG / INTC
--    each overstated the broker by twice the fractional part. The raw activity
--    is stored verbatim in metadata, so the sign is recoverable exactly.
-- 2. Crypto activities name the pair ("BCH/USD"); /v2/positions names the
--    asset ("BCHUSD"). The ledger's rows move to the asset the broker holds,
--    and the orphaned pair asset - referenced by nothing else - is removed.
--
-- Only Atlas Secondary carries either shape (checked across both accounts).

do $$
declare
  v_flipped int;
  v_moved   int;
  v_pair    uuid := (select id from public.assets where symbol = 'BCH/USD');
  v_asset   uuid := (select id from public.assets where symbol = 'BCHUSD');
begin
  update public.transactions
     set transaction_type = case when lower(transaction_type) like '%buy%'
                                 then 'orderside.sell' else 'orderside.buy' end
   where (metadata->>'qty')::numeric < 0
     -- quantity is stored at 8dp against the vendor's 9dp string.
     and abs(quantity - abs((metadata->>'qty')::numeric)) < 1e-6;
  get diagnostics v_flipped = row_count;
  if v_flipped <> 4 then
    raise exception 'expected 4 reversed fills, found %', v_flipped;
  end if;

  if v_pair is not null then
    if v_asset is null then
      raise exception 'BCHUSD asset missing; cannot repoint BCH/USD fills';
    end if;
    update public.transactions set asset_id = v_asset where asset_id = v_pair;
    get diagnostics v_moved = row_count;
    if v_moved <> 3 then
      raise exception 'expected 3 BCH/USD fills, found %', v_moved;
    end if;
    delete from public.assets where id = v_pair;
  end if;
end $$;
