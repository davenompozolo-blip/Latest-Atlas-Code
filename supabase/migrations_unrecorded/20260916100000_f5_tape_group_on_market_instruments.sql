-- F-5 (tape, F2 §3 / F3 §2.1) — which tape frame a market leg belongs to.
--
-- Sprint 2 groups market legs into frames. `asset_class` cannot do this job:
-- XLE, SPY and EEM are all 'equity_etf'. `proxies_for` is free text and
-- parsing it would misfile the next leg silently. So the classification is a
-- column, for the same reason nexusPairsCompute.js refuses to carry a
-- pair-to-axis map: a surface must not hold a hardcoded list of instruments
-- that the database is the authority on.
--
-- NULL means "not on the tape" — which is the correct state for the bond and
-- commodity legs (HYG IEF IEI SHY TLT GLD CPER). They are registered series
-- with their own consumers; F2 §3 does not put them in Sprint 2.
--
-- This column describes the leg's own nature, NOT how the tape chooses to
-- render it. Today 'regional' holds exactly one leg (EEM) and the tape folds
-- a single-leg group into the broad-market frame rather than printing a
-- category over one instrument — that rule lives in nexusTapeCompute.js where
-- it can be tested. Registering a second regional leg is therefore enough to
-- give regional its own frame, with no code change.

alter table public.market_instruments
  add column if not exists tape_group text;

alter table public.market_instruments
  drop constraint if exists market_instruments_tape_group_ck;

alter table public.market_instruments
  add constraint market_instruments_tape_group_ck
  check (tape_group is null or tape_group in ('sector', 'index', 'regional'));

comment on column public.market_instruments.tape_group is
  'Sprint 2 tape frame for this leg: sector | index | regional. NULL = not on the tape. '
  'Describes the instrument, not the rendering: the tape folds a group holding fewer than '
  'two legs into the broad-market frame rather than labelling a category over one data point.';

update public.market_instruments set tape_group = 'sector'
 where symbol in ('XLE', 'XLF', 'XLI', 'XLP', 'XLU', 'XLY');

update public.market_instruments set tape_group = 'index'
 where symbol in ('SPY', 'QQQ', 'DIA', 'IWM', 'RSP');

update public.market_instruments set tape_group = 'regional'
 where symbol in ('EEM');
