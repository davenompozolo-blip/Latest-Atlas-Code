-- The book must mean "what is held now", not "what was held at some point today".
--
-- THE DEFECT. `sync_alpaca_positions` writes positions with
-- `insert ... on conflict (portfolio_id, asset_id, as_of_date) do update set`
-- and NOTHING ELSE. It is upsert-only: there is no reconciling delete, so a name
-- that drops out of the Alpaca response is simply never touched again. The row
-- written earlier in the day survives, carrying the last quantity the broker
-- reported before the exit.
--
-- So `positions` for today is the UNION OF EVERYTHING HELD AT ANY POINT TODAY,
-- not the current book. It self-heals at midnight only because `as_of_date`
-- rolls over and the new day's snapshot contains whatever Alpaca returns then --
-- which is why this reads as an intermittent "phantom position" rather than as
-- a permanent one, and why it is invisible to anything checking yesterday.
--
-- Observed 2026-09-14: KMTUY was liquidated at ~13:35. Alpaca reported the fill.
-- At 20:00 its row was still present at 2.52 shares / $118.25, and it was the
-- ONLY row of 66 that the 20:00:07 sync had not touched.
--
-- THE SIGNAL. One `account_snapshots` row is written per sync invocation per
-- portfolio, inside the same transaction as the position upserts, so its `as_of`
-- is an exact watermark for the last run. A position row touched by that run
-- carries the identical transaction timestamp. Measured on the live book: 65
-- rows at lag 0.000s, KMTUY at 23,103s. There is no grey zone, so this needs no
-- tolerance -- do NOT add one, because a tolerance is what would let a genuinely
-- exited name slip back in.
--
-- NOTE THE LEDGER CANNOT DO THIS JOB. `transactions` syncs at 13:10 and 22:10,
-- so today's 13:35 sell was not in the ledger at 20:00 and would not be for
-- another two hours. The watermark sees the exit within one sync cycle.
--
-- NOTHING IS DELETED HERE. This is a read layer over the same rows: the writer
-- is still upsert-only and the fix for that is `supabase/functions/
-- sync_alpaca_positions/index.ts` (see the report). Deleting live position rows
-- from a five-minute writer is not a change to make sight-unseen.

create or replace view public.vw_positions_current as
with wm as (
  select portfolio_id, max(as_of) as last_sync_at
    from public.account_snapshots
   group by portfolio_id
)
select
  p.id,
  p.portfolio_id,
  p.asset_id,
  a.symbol,
  p.quantity,
  p.average_cost,
  p.market_value,
  p.side,
  p.as_of_date,
  p.updated_at        as last_seen_at,
  wm.last_sync_at
from public.positions p
join public.assets a on a.id = p.asset_id
join wm on wm.portfolio_id = p.portfolio_id
where p.as_of_date = (select max(as_of_date) from public.positions)
  and p.updated_at >= wm.last_sync_at;

comment on view public.vw_positions_current is
  'The book as the broker reports it NOW. Excludes rows the most recent sync did not touch -- sync_alpaca_positions is upsert-only, so a name exited intraday keeps its last row until as_of_date rolls over. Read this, not positions, for anything that asks what is held.';

-- The dropped rows are PUBLISHED, not silently discarded. An exit that vanishes
-- with no trace is how this went unnoticed in the first place.
create or replace view public.vw_positions_exited_intraday as
with wm as (
  select portfolio_id, max(as_of) as last_sync_at
    from public.account_snapshots
   group by portfolio_id
)
select
  a.symbol,
  p.quantity          as last_reported_quantity,
  p.market_value      as last_reported_market_value,
  p.as_of_date,
  p.updated_at        as last_seen_at,
  wm.last_sync_at,
  round(extract(epoch from (wm.last_sync_at - p.updated_at))::numeric / 60.0, 1)
                      as minutes_since_last_seen
from public.positions p
join public.assets a on a.id = p.asset_id
join wm on wm.portfolio_id = p.portfolio_id
where p.as_of_date = (select max(as_of_date) from public.positions)
  and p.updated_at < wm.last_sync_at;

comment on view public.vw_positions_exited_intraday is
  'Names still carried in today''s positions snapshot that the most recent sync did not report -- i.e. exited since the day started. Normally empty. A row here is a position the book would otherwise still be showing.';
