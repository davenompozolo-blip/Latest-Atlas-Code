create table if not exists public.market_regime_windows (
    id          uuid primary key default gen_random_uuid(),
    name        text not null unique,
    start_date  date not null,
    end_date    date,                 -- null = ongoing / open-ended
    color       text not null,
    sort_order  integer not null default 0,
    created_at  timestamptz not null default now()
);

comment on table public.market_regime_windows is
    'Macro regime windows that drive the Performance Regime Slicer. end_date NULL = ongoing/open-ended (current regime).';

create index if not exists market_regime_windows_sort_idx
    on public.market_regime_windows (sort_order);

alter table public.market_regime_windows enable row level security;

create policy market_regime_windows_read_anon
    on public.market_regime_windows
    for select
    to anon, authenticated
    using (true);

-- Seed from the 3 windows that were previously hardcoded in the UI, plus the
-- two regimes (Stagflation, Deflation) that SECTOR_BEST_REGIME already referenced
-- but had no window for. Deflation is the current open-ended regime (end_date NULL).
insert into public.market_regime_windows (name, start_date, end_date, color, sort_order) values
    ('Goldilocks',   '2026-01-02', '2026-02-04', '#10b981', 1),
    ('Tariff Shock', '2026-02-05', '2026-03-08', '#ef4444', 2),
    ('Reflation',    '2026-03-09', '2026-05-21', '#f59e0b', 3),
    ('Stagflation',  '2026-05-22', '2026-06-12', '#a855f7', 4),
    ('Deflation',    '2026-06-13', null,         '#3b82f6', 5)
on conflict (name) do nothing;
