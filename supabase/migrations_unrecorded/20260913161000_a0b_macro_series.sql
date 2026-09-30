-- A0b.2 -- macro_series / macro_series_values.
--
-- Breakevens are spreads between nominal and real yields. No ETF pair produces
-- one, so unlike the A0 series layer this cannot be proxied and needs its own
-- registry. Same discipline as market_instruments: a non-blank caveat on every
-- row, and an inception_date verified against the provider rather than asserted.
--
-- PROVIDER: FRED for all seven, including Brent.
--
-- The A0b spec names Alpha Vantage's BRENT endpoint for the commodity leg. It
-- was measured against FRED's DCOILBRENTEU before choosing, and the two are the
-- SAME SERIES: 9,973 of 9,973 observations identical to the cent, same first
-- date (1987-05-20), same last date, zero dates present on one side only. Alpha
-- Vantage is redistributing the EIA series FRED publishes. So this is not the
-- proxy substitution paragraph 9.2 forbids -- there is no second measurement
-- here to choose between. Reading it from FRED needs no API key, has no rate
-- limit, and keeps the whole layer on one provider, which is the only reason
-- the choice is worth making.

create table if not exists public.macro_series (
  series_key      text primary key,
  provider        text not null,
  provider_code   text not null,
  label           text not null,
  units           text not null,
  measures        text not null,
  inception_date  date not null,
  caveats         text not null,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint macro_series_provider_ck check (provider in ('fred','alpha_vantage')),
  constraint macro_series_units_ck    check (units in ('percent','index','usd_per_bbl','bp')),
  -- Same rule A0 applies to market_instruments: a caveats column that can hold
  -- an empty string is a caveats column nobody fills in.
  constraint macro_series_caveats_ck  check (btrim(caveats) <> ''),
  constraint macro_series_measures_ck check (btrim(measures) <> '')
);

create table if not exists public.macro_series_values (
  series_key text not null references public.macro_series(series_key) on delete cascade,
  date       date not null,
  value      numeric not null,
  primary key (series_key, date)
);

-- The loader reads "latest date held per series" on every run to decide its
-- window, and the coverage view reads first/last per series. Both are a
-- backward index scan on the PK, which already leads with series_key.

comment on table public.macro_series is
  'Registry of macro time series (A0b). One row per series; the caveat column is '
  'NOT NULL and non-blank by CHECK.';
comment on table public.macro_series_values is
  'Daily observations for macro_series. UPSERT, never insert-only: FRED revises '
  'published values, so a re-fetch of an existing date must overwrite it.';
comment on column public.macro_series.inception_date is
  'The provider''s own first observation date, verified by fetching the full '
  'series -- not asserted from documentation.';

alter table public.macro_series        enable row level security;
alter table public.macro_series_values enable row level security;

create policy macro_series_read on public.macro_series
  for select to anon, authenticated using (true);
create policy macro_series_service on public.macro_series
  for all to service_role using (true) with check (true);

create policy macro_series_values_read on public.macro_series_values
  for select to anon, authenticated using (true);
create policy macro_series_values_service on public.macro_series_values
  for all to service_role using (true) with check (true);
