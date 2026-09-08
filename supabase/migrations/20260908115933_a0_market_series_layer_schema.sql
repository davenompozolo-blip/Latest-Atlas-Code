-- Phase A0: price series layer and instrument registry.
--
-- Three tables and nothing else: a hand-authored registry of tradeable legs,
-- a two-column price series for each, and a set of pair *definitions*.
--
-- No computed ratio is stored anywhere. Ratios are evaluated on the fly from
-- the legs, so a pair can be added, dropped or re-specified without a
-- backfill and there is no second copy of the data to drift out of sync.

-- Registry
create table if not exists public.market_instruments (
  symbol          text primary key,
  name            text not null,
  asset_class     text not null,
  proxies_for     text not null,
  inception_date  date not null,
  data_source     text not null,
  caveats         text not null,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),

  constraint market_instruments_asset_class_ck check (
    asset_class in ('equity_etf','fixed_income_etf','commodity_etf','futures')),
  constraint market_instruments_data_source_ck check (
    data_source in ('alpaca','alphavantage','yahoo')),
  -- Acceptance 5.1 requires caveats populated on every row. A registry whose
  -- whole purpose is to keep the reason a series misleads next to the series
  -- should refuse a blank one rather than trust the author to remember.
  constraint market_instruments_caveats_present_ck check (length(btrim(caveats)) > 0),
  -- CURRENT_DATE is STABLE, not IMMUTABLE, so a "not in the future" bound
  -- cannot be a CHECK. Static sanity bounds only; freshness is the loader's job.
  constraint market_instruments_inception_sane_ck check (
    inception_date >= date '1970-01-01' and inception_date < date '2100-01-01')
);

comment on table public.market_instruments is
  'Hand-authored registry of tradeable legs for the regime/risk series layer. One row per leg. inception_date is verified against the data provider, not copied from a spec.';
comment on column public.market_instruments.proxies_for is
  'What this leg is standing in for. Descriptive, not a claim about signal value.';
comment on column public.market_instruments.caveats is
  'Known distortions of this series. Required - see the CHECK.';

-- Prices
create table if not exists public.market_prices (
  symbol     text not null references public.market_instruments(symbol)
               on update cascade on delete restrict,
  date       date not null,
  close      numeric not null,
  adj_close  numeric not null,
  volume     bigint,

  constraint market_prices_pkey primary key (symbol, date),
  constraint market_prices_close_positive_ck     check (close > 0),
  constraint market_prices_adj_close_positive_ck check (adj_close > 0),
  constraint market_prices_volume_nonneg_ck      check (volume is null or volume >= 0),
  constraint market_prices_date_sane_ck          check (
    date >= date '1970-01-01' and date < date '2100-01-01')
);

create index if not exists market_prices_date_idx on public.market_prices (date);

comment on table public.market_prices is
  'Daily close and adjusted close per registered leg, backfilled to each instrument''s own inception. Coverage differences between legs are real information and are deliberately not truncated to a common start date.';
comment on column public.market_prices.adj_close is
  'Split- and dividend-adjusted. ALL ratio computation downstream uses this column. Legs have materially different dividend yields (XLU ~3%, XLI ~1.5%), so a price-only XLI/XLU drifts ~1.5%/yr for reasons that have nothing to do with industrial expansion.';
comment on column public.market_prices.close is
  'Raw close. Stored for reconciliation against the provider only - never for ratio computation.';

-- Pair definitions
create table if not exists public.ratio_pairs (
  pair_key           text primary key,
  numerator_symbol   text not null references public.market_instruments(symbol)
                       on update cascade on delete restrict,
  denominator_symbol text not null references public.market_instruments(symbol)
                       on update cascade on delete restrict,
  dimension          text not null,
  thesis             text not null,
  caveats            text not null,
  created_at         timestamptz not null default now(),

  constraint ratio_pairs_dimension_ck check (
    dimension in ('breadth','cyclicality','growth_inflation','safe_haven')),
  constraint ratio_pairs_legs_distinct_ck check (numerator_symbol <> denominator_symbol),
  constraint ratio_pairs_thesis_present_ck  check (length(btrim(thesis)) > 0),
  constraint ratio_pairs_caveats_present_ck check (length(btrim(caveats)) > 0)
);

comment on table public.ratio_pairs is
  'Pair DEFINITIONS only. No computed value is stored here or anywhere else; ratios are evaluated from the legs at query time.';
comment on column public.ratio_pairs.dimension is
  'Provisional grouping label carried over from the source documents, for organisation only. Phase A1 tests whether these groupings survive a correlation study; several are expected not to. Do not read a dimension value as an established fact about the pair.';
comment on column public.ratio_pairs.thesis is
  'One line: what a RISING ratio is claimed to indicate. A claim under test, not a finding.';

-- RLS (matches the house convention on assets / price_history)
alter table public.market_instruments enable row level security;
alter table public.market_prices      enable row level security;
alter table public.ratio_pairs        enable row level security;

drop policy if exists market_instruments_select        on public.market_instruments;
drop policy if exists market_instruments_service_write on public.market_instruments;
create policy market_instruments_select        on public.market_instruments for select to authenticated using (true);
create policy market_instruments_service_write on public.market_instruments for all    to service_role using (true) with check (true);

drop policy if exists market_prices_select        on public.market_prices;
drop policy if exists market_prices_service_write on public.market_prices;
create policy market_prices_select        on public.market_prices for select to authenticated using (true);
create policy market_prices_service_write on public.market_prices for all    to service_role using (true) with check (true);

drop policy if exists ratio_pairs_select        on public.ratio_pairs;
drop policy if exists ratio_pairs_service_write on public.ratio_pairs;
create policy ratio_pairs_select        on public.ratio_pairs for select to authenticated using (true);
create policy ratio_pairs_service_write on public.ratio_pairs for all    to service_role using (true) with check (true);
