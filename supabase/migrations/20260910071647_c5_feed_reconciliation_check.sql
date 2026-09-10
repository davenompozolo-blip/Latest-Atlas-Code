-- C5: standing Yahoo-vs-Alpaca feed reconciliation over the A0 series legs.
--
-- Two independent providers price the same 16 ETFs: Yahoo writes market_prices
-- (the A0 series layer, via backfill_market_prices) and Alpaca writes
-- price_history (the platform's own book/universe feed). Nothing had ever
-- compared them, so a provider drifting or stalling would surface only as an
-- odd-looking chart.
--
-- TWO legs, deliberately kept apart:
--   price     -- both providers have a bar for the same leg/session and the
--                closes disagree by more than the threshold. A data fault.
--   coverage  -- one provider has a bar the other does not. A feed being late
--                or stopped: different failure, different fix. Folding it into
--                a "prices disagree" count would report a stall as a pricing
--                error.
--
-- 25 bp is calibrated, not guessed: over the five sessions to 2026-09-09 the
-- worst like-for-like gap is 7.30 bp (CPER) and the median under 2 bp.
-- Consolidated-tape vs Yahoo settlement differences live at that scale.
--
-- close, never adjusted_close: the providers run their own dividend adjustment
-- products, so adj-vs-adj diverges on every dividend by construction. The raw
-- close is the one number both providers actually observed.

create table if not exists public.feed_reconciliation_exclusions (
    id             bigint generated always as identity primary key,
    leg            text        not null check (leg in ('price', 'coverage', 'equity_curve')),
    exclusion_date date        not null,
    symbol         text,                    -- null = every symbol on that date
    reason         text        not null check (length(btrim(reason)) > 0),
    created_at     timestamptz not null default now(),
    unique (leg, exclusion_date, symbol)
);

comment on table public.feed_reconciliation_exclusions is
'Dates where a feed divergence is known and explained, so the standing reconciliation states it once instead of re-reporting it nightly forever. leg says which comparison it applies to -- an equity_curve exclusion does not silence a price divergence on the same date.';

alter table public.feed_reconciliation_exclusions enable row level security;

-- The three carried-forward provider snapshots C1 found and flagged. They are
-- rows of portfolio_equity_curve, not price bars, so they are scoped to the
-- equity_curve leg and CANNOT silence anything on the price or coverage legs.
-- Recorded so the fact is declared once and survives a widened window.
insert into public.feed_reconciliation_exclusions (leg, exclusion_date, symbol, reason)
values
  ('equity_curve', '2026-01-15', null, 'stale_snapshot: provider carried the prior session equity forward with profit_loss 0.00 (C1)'),
  ('equity_curve', '2026-05-04', null, 'stale_snapshot: provider carried the prior session equity forward with profit_loss 0.00 (C1)'),
  ('equity_curve', '2026-07-29', null, 'stale_snapshot: provider carried the prior session equity forward with profit_loss 0.00 against a -1.55% SPY session (C1)')
on conflict (leg, exclusion_date, symbol) do nothing;

create or replace function public.atlas_check_feed_reconciliation(p_sessions integer default 5,
                                                                  p_bps      numeric default 25)
returns table (check_name text, status text, severity text, message text, details jsonb)
language sql
stable
security definer
set search_path to 'public'
as $function$
    -- The session spine is SPY's own Yahoo bars: the question is "for the
    -- sessions the series layer believes happened, do the providers agree?",
    -- so the spine comes from that layer and never from a calendar -- a
    -- weekday feed is not late on a holiday.
    with sessions as (
        select distinct date from public.market_prices
         where symbol = 'SPY' order by date desc limit greatest(p_sessions, 1)
    ),
    legs as (select symbol from public.market_instruments where active),
    y as (
        select mp.symbol, mp.date, mp.close
          from public.market_prices mp
          join legs l on l.symbol = mp.symbol
          join sessions s on s.date = mp.date
         where mp.close is not null and mp.close > 0
    ),
    a as (
        select ast.symbol, ph.price_date as date, ph.close
          from public.price_history ph
          join public.assets ast on ast.id = ph.asset_id
          join legs l on l.symbol = ast.symbol
          join sessions s on s.date = ph.price_date
         where ph."interval" = '1d' and ph.close is not null and ph.close > 0
    ),
    pairs as (
        select y.symbol, y.date, y.close as yahoo_close, a.close as alpaca_close,
               case when a.close is null then null
                    else round((abs(y.close / a.close - 1) * 10000)::numeric, 2)
               end as bps
          from y left join a on a.symbol = y.symbol and a.date = y.date
         where not exists (
                 select 1 from public.feed_reconciliation_exclusions x
                  where x.leg = 'price' and x.exclusion_date = y.date
                    and (x.symbol is null or x.symbol = y.symbol))
    ),
    agg as (
        select count(*) filter (where alpaca_close is not null)                        as pairs_compared,
               count(*) filter (where alpaca_close is not null and bps > p_bps)        as pairs_diverged,
               count(*) filter (where alpaca_close is null)                            as bars_missing,
               max(bps) filter (where alpaca_close is not null)                        as max_bps,
               count(distinct symbol)                                                  as legs,
               min(date)                                                               as win_from,
               max(date)                                                               as win_to
          from pairs
    ),
    worst as (
        select jsonb_agg(jsonb_build_object('symbol', symbol, 'date', date,
                                            'yahoo', yahoo_close, 'alpaca', alpaca_close, 'bps', bps)
                         order by bps desc) as j
          from (select * from pairs where alpaca_close is not null order by bps desc limit 5) w
    ),
    gaps as (
        select jsonb_agg(jsonb_build_object('symbol', symbol, 'date', date)
                         order by date desc, symbol) as j
          from (select * from pairs where alpaca_close is null order by date desc, symbol limit 20) g
    )
    select
        'feed_reconciliation'::text,
        -- No comparable pair at all is a broken check, never a clean bill of
        -- health: this codebase has been bitten three times by a no-op
        -- reported as a success.
        case when agg.pairs_compared = 0 and agg.bars_missing = 0 then 'failed'
             when agg.pairs_diverged > 0                          then 'failed'
             when agg.bars_missing  > 0                           then 'warning'
             else 'passed' end,
        case when agg.pairs_compared = 0 and agg.bars_missing = 0 then 'critical'
             when agg.pairs_diverged > 0 or agg.bars_missing > 0  then 'warning'
             else 'info' end,
        case
          when agg.pairs_compared = 0 and agg.bars_missing = 0 then
            format('Feed reconciliation had nothing to compare over %s session(s).', p_sessions)
          when agg.pairs_diverged > 0 then
            format('%s of %s leg-sessions disagree by more than %s bp (worst %s bp) between Yahoo and Alpaca, %s to %s.',
                   agg.pairs_diverged, agg.pairs_compared, p_bps, agg.max_bps, agg.win_from, agg.win_to)
          when agg.bars_missing > 0 then
            format('Prices agree on all %s comparable leg-sessions (worst %s bp), but Alpaca is missing %s bar(s) Yahoo has, %s to %s.',
                   agg.pairs_compared, coalesce(agg.max_bps, 0), agg.bars_missing, agg.win_from, agg.win_to)
          else
            format('Yahoo and Alpaca agree on all %s leg-sessions across %s legs (worst %s bp), %s to %s.',
                   agg.pairs_compared, agg.legs, coalesce(agg.max_bps, 0), agg.win_from, agg.win_to)
        end,
        jsonb_build_object(
            'window_from', agg.win_from, 'window_to', agg.win_to,
            'sessions', p_sessions, 'threshold_bps', p_bps, 'legs', agg.legs,
            'pairs_compared', agg.pairs_compared, 'pairs_diverged', agg.pairs_diverged,
            'max_bps', agg.max_bps, 'alpaca_bars_missing', agg.bars_missing,
            'worst', coalesce(worst.j, '[]'::jsonb),
            'coverage_gaps', coalesce(gaps.j, '[]'::jsonb))
    from agg cross join worst cross join gaps;
$function$;

revoke execute on function public.atlas_check_feed_reconciliation(integer, numeric)
  from public, anon, authenticated;
