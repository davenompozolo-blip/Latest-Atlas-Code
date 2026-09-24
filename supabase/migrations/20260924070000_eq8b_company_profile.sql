-- EQ-8b: company identity and classification from EDGAR submissions.
--
-- The Background tab rendered `SECTOR Technology` / `INDUSTRY Technology` for
-- Apple because `mapFinnhubOverview` sets both from `p.finnhubIndustry`. That
-- asserts a two-level taxonomy the platform does not have -- the same defect
-- EQ-7 measured in `equity_screener_universe`, where `industry` is a straight
-- copy of `sector` (896 rows identical, 0 rows where both differ).
--
-- EDGAR publishes the SEC's own SIC classification per filer, free, no key. It
-- is a genuine level BELOW sector: AAPL 3571 `Electronic Computers`, TGT 5331
-- `Retail-Variety Stores`, JPM 6021 `National Commercial Banks`.
--
-- EVERY TEXT COLUMN IS NULL WHEN BLANK, NEVER ''. EDGAR carries `description`,
-- `website` and `investorWebsite` as keys and leaves them EMPTY on every filer
-- measured, so '' would render as a loaded-but-empty field. The CHECKs below
-- make the empty string impossible to store rather than merely discouraged.

create table if not exists public.company_profile (
    symbol                 text primary key,
    cik                    text not null,
    entity_name            text,
    -- INDUSTRY. Never a sector: the two are different objects and this
    -- platform has conflated them twice.
    sic                    text,
    sic_description        text,
    -- The SEC review office ('06 Technology'). Coarser than SIC and NOT the
    -- vendor's sector; named so nothing can read it as one.
    sec_owner_org          text,
    filer_category         text,
    entity_type            text,
    -- MMDD, verbatim. A recurring calendar position, not a date -- and this
    -- codebase records that no arithmetic rule names a filer's own fiscal
    -- year correctly for every filer.
    fiscal_year_end        text,
    exchanges              text[],
    tickers                text[],
    state_of_incorporation text,
    ein                    text,
    description            text,
    website                text,
    investor_website       text,
    former_names           jsonb,
    source                 text not null default 'edgar',
    loaded_at              timestamptz not null default now(),

    constraint cp_source_ck          check (btrim(source) <> ''),
    constraint cp_cik_ck             check (cik ~ '^[0-9]{10}$'),
    constraint cp_fye_ck             check (fiscal_year_end is null or fiscal_year_end ~ '^[0-9]{4}$'),
    -- An empty string is not a value. One CHECK per nullable text column, so a
    -- blank cannot be written by any path.
    constraint cp_no_blank_text_ck   check (
            (entity_name            is null or btrim(entity_name)            <> '')
        and (sic                    is null or btrim(sic)                    <> '')
        and (sic_description        is null or btrim(sic_description)        <> '')
        and (sec_owner_org          is null or btrim(sec_owner_org)          <> '')
        and (filer_category         is null or btrim(filer_category)         <> '')
        and (entity_type            is null or btrim(entity_type)            <> '')
        and (state_of_incorporation is null or btrim(state_of_incorporation) <> '')
        and (ein                    is null or btrim(ein)                    <> '')
        and (description            is null or btrim(description)            <> '')
        and (website                is null or btrim(website)                <> '')
        and (investor_website       is null or btrim(investor_website)       <> '')
    )
);

comment on table public.company_profile is
  'Filer identity and SEC SIC classification from EDGAR submissions. '
  '`sic_description` is an INDUSTRY and is never a sector. Text columns are '
  'NULL when blank -- EDGAR leaves `description`/`website` empty on every '
  'filer measured, so there is no business prose here; Item 1 of the 10-K is '
  'the only route to that.';

create index if not exists company_profile_sic_idx on public.company_profile (sic);

-- RLS. Supabase's default grants give anon and authenticated INSERT on every
-- table in `public`, and RLS is the only thing that takes it back -- this file
-- records `book_regime_cvar` shipping without it and sitting open to
-- anonymous writes.
alter table public.company_profile enable row level security;

drop policy if exists company_profile_read on public.company_profile;
create policy company_profile_read on public.company_profile
    for select to anon, authenticated using (true);

drop policy if exists company_profile_service on public.company_profile;
create policy company_profile_service on public.company_profile
    for all to service_role using (true) with check (true);
