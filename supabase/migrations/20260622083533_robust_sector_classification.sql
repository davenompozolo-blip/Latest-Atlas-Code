-- Eliminate "Unclassified"/"Other" as a holdings bucket. Every position must map
-- to a real sector/exposure — ETFs included (by theme/exposure). It showed up in
-- the Nexus Theme transmission ("Unclassified +0.8% leads") and rotation map
-- ("Other"), polluting capital-allocation signals. Root cause: assets.sector was
-- null for recently-added names and a couple of bond ETFs, and the vendor feed
-- (equity_cache) only covers some symbols.
--
-- Three layers, so nothing is ever silently bucketed:
--   1. sector_overrides            — curated, guaranteed map (ETFs by exposure +
--                                    names the vendor feed can't resolve)
--   2. classify_canonical_sector() — vendor label -> canonical bucket
--   3. backfill_unclassified_sectors() — fills assets.sector (override → classifier),
--                                    never overwriting a good value; re-runnable.
-- vw_unclassified_holdings surfaces any residual gap so it's flagged, not hidden.

create table if not exists public.sector_overrides (
  symbol     text primary key,
  sector     text not null,
  note       text,
  updated_at timestamptz not null default now()
);

insert into public.sector_overrides (symbol, sector, note) values
  ('TIP','Fixed Income','iShares TIPS Bond ETF'),
  ('PTRB','Fixed Income','PGIM Total Return Bond ETF'),
  ('BOND','Fixed Income','PIMCO Active Bond ETF'),
  ('BSV','Fixed Income','Vanguard Short-Term Bond ETF'),
  ('SHY','Fixed Income','iShares 1-3Y Treasury ETF'),
  ('IBIE','Fixed Income','bond ETF'),
  ('ACWI','International','MSCI ACWI ETF'),
  ('AVEE','International','Avantis EM ETF'),
  ('DFEV','International','Dimensional EM Value ETF'),
  ('EWA','International','iShares MSCI Australia'),
  ('EWY','International','iShares MSCI South Korea'),
  ('EZA','International','iShares MSCI South Africa'),
  ('UAE','International','iShares MSCI UAE'),
  ('GDX','Materials','VanEck Gold Miners ETF'),
  ('XLRE','Real Estate','Real Estate Select Sector SPDR'),
  ('GEV','Industrials','GE Vernova — power generation/electrification'),
  ('MU','Technology','Micron — semiconductors'),
  ('NKE','Consumer Discretionary','Nike'),
  ('PFE','Healthcare','Pfizer')
on conflict (symbol) do update set sector=excluded.sector, note=excluded.note, updated_at=now();

create or replace function public.classify_canonical_sector(raw text, industry text)
returns text language sql immutable as $$
  with s as (select lower(coalesce(raw,'') || ' ' || coalesce(industry,'')) as t)
  select case
    when t ~ 'semiconduct|software|information technology|infotech|electronic technology|technology services|hardware|internet software' then 'Technology'
    when t ~ 'bank|insurance|financ|capital market|asset manage|brokerage|exchange' then 'Financials'
    when t ~ 'pharmaceutic|biotech|health|medical|life science|\ydrug\y|hospital|therapeut' then 'Healthcare'
    when t ~ 'beverage|tobacco|household|consumer product|staple|personal product|grocery|packaged food|\yfood\y' then 'Consumer Staples'
    when t ~ 'media|telecom|communicat|entertain|publish|broadcast|wireless|cable' then 'Communications'
    when t ~ 'retail|hotel|restaurant|leisure|apparel|automobile|auto manufactur|consumer discretion|textile|luxury|e-commerce|travel|gaming|footwear' then 'Consumer Discretionary'
    when t ~ 'machinery|electrical equip|aerospace|defen|industrial|construction|transport|airline|railroad|building|engineering|logistics|capital goods' then 'Industrials'
    when t ~ 'oil|\ygas\y|energy|pipeline|petroleum|coal|drilling|refin' then 'Energy'
    when t ~ 'metal|mining|chemical|material|gold|steel|copper|forest|paper|cement|miner' then 'Materials'
    when t ~ 'utilit|electric util|power generation|water util' then 'Utilities'
    when t ~ 'real estate|reit' then 'Real Estate'
    when t ~ 'bond|treasury|fixed income|municipal|\ycredit\y|debt' then 'Fixed Income'
    else null end
  from s;
$$;

create or replace function public.backfill_unclassified_sectors()
returns integer language plpgsql as $$
declare n integer;
begin
  with resolved as (
    select a.symbol,
      coalesce(o.sector, public.classify_canonical_sector(c.cs, c.ci)) as new_sector
    from public.assets a
    left join public.sector_overrides o on o.symbol = a.symbol
    left join lateral (
      select coalesce(ec.payload->>'Sector', ec.payload->'overview'->>'Sector') as cs,
             coalesce(ec.payload->>'Industry', ec.payload->'overview'->>'Industry') as ci
      from public.equity_cache ec
      where ec.symbol = a.symbol and ec.endpoint = any (array['overview','mkt_overview'])
      order by ec.expires_at desc limit 1
    ) c on true
    where a.sector is null or btrim(a.sector) = '' or lower(a.sector) in ('other','unclassified','n/a')
  )
  update public.assets a
  set sector = r.new_sector
  from resolved r
  where a.symbol = r.symbol and r.new_sector is not null;
  get diagnostics n = row_count;
  return n;
end $$;

select public.backfill_unclassified_sectors();
refresh materialized view public.mv_nexus_holdings;

-- Ongoing guard: any held symbol still without a real sector shows up here (and
-- can feed an alert), instead of silently landing in Unclassified/Other.
create or replace view public.vw_unclassified_holdings as
select h.symbol, h.asset_name, h.weight_pct
from public.vw_nexus_holdings h
where h.sector is null or btrim(h.sector) = '' or lower(h.sector) in ('other','unclassified','n/a')
order by h.weight_pct desc nulls last;
