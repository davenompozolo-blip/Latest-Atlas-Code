-- ONB-0b: trade_universe_members.book_state / held_weight_pct describe the
-- DEFAULT account (trade-sync runs with no request context), so any signed-in
-- user could read the owner's holdings and weights from them. The terminal
-- recomputes both from the active book (src/lib/trade/bookOverlay.js) and,
-- since ONB-0, selects named columns that exclude them. Applied after that
-- client shipped: a select=* against a partially granted table is refused.

-- trade_universe_members: every column except the default account's book
--    columns. The terminal recomputes both from the active book
--    (src/lib/trade/bookOverlay.js) and never needed the stored values.
revoke select on public.trade_universe_members from authenticated;
grant select (universe_id, as_of_date, symbol, eligible, exclusion_code, exclusion_detail,
              gate_stage, rank, composite, net, alignment, dispersion, sector, geography,
              market_cap_usd, market_cap_bucket, adv_usd, spread_bps, momentum_pct, vol_pct,
              liquidity_pct, iv_rank, options_listed, days_to_earnings, borrow_status, metrics)
    on public.trade_universe_members to authenticated;

do $$
begin
    if has_column_privilege('authenticated', 'public.trade_universe_members', 'book_state', 'select')
       or has_column_privilege('authenticated', 'public.trade_universe_members', 'held_weight_pct', 'select') then
        raise exception 'ONB-0b: the stored book columns are still readable';
    end if;
    if not has_column_privilege('authenticated', 'public.trade_universe_members', 'symbol', 'select') then
        raise exception 'ONB-0b: trade_universe_members lost its readable columns';
    end if;
end $$;
