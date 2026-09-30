alter table public.market_instruments add column if not exists tape_group text
alter table public.market_instruments drop constraint if exists market_instruments_tape_group_ck
alter table public.market_instruments add constraint market_instruments_tape_group_ck check (tape_group is null or tape_group in ('sector', 'index', 'regional'))
comment on column public.market_instruments.tape_group is 'Sprint 2 tape frame for this leg: sector | index | regional. NULL = not on the tape. Describes the instrument, not the rendering: the tape folds a group holding fewer than two legs into the broad-market frame rather than labelling a category over one data point.'
update public.market_instruments set tape_group = 'sector' where symbol in ('XLE', 'XLF', 'XLI', 'XLP', 'XLU', 'XLY')
update public.market_instruments set tape_group = 'index' where symbol in ('SPY', 'QQQ', 'DIA', 'IWM', 'RSP')
update public.market_instruments set tape_group = 'regional' where symbol in ('EEM')
