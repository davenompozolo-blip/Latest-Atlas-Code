-- Geographic surface, phase A: the reference and disclosure layer.
-- Spec: "ATLAS Geographic Surface — build spec" (2026-09-22). Full report in
-- docs/GEO_SURFACE_REPORT.md.
--
-- Three tables:
--   country_ref           ISO 3166-1 reference, seeded from Natural Earth 1:50m
--   security_geo_revenue  one row per security x fiscal period x country
--   security_domicile     where an issuer (or a fund) is domiciled, with source
--
-- The spec names two tables and assumes the securities table already carries
-- a country. It does not: `assets` has exchange and sector and no country,
-- and the only country anywhere in the schema is vw_screener.country, which
-- COALESCEs a missing value to 'US' -- so HMY (Harmony Gold, Johannesburg)
-- reads as a US company. Domicile is the fallback for every undisclosed
-- revenue split, so it has to be a sourced fact of its own rather than a
-- default someone typed into a view.
--
-- Every numeric bound is TWO-SIDED, so NaN and +/-Infinity cannot satisfy it
-- (see CLAUDE.md, "NaN walks through every ordering CHECK").

create type public.geo_revenue_basis as enum ('disclosed', 'estimated', 'mapped_from_segment');

-- ── country_ref ────────────────────────────────────────────────────────────
create table public.country_ref (
    iso2          char(2) primary key check (iso2 ~ '^[A-Z]{2}$'),
    iso3          char(3) check (iso3 ~ '^[A-Z]{3}$'),
    name          text not null check (btrim(name) <> ''),
    region        text,
    subregion     text,
    is_developed  boolean,
    centroid_lon  numeric check (centroid_lon is null or (centroid_lon >= -180 and centroid_lon <= 180)),
    centroid_lat  numeric check (centroid_lat is null or (centroid_lat >= -90 and centroid_lat <= 90)),
    ne_economy    text,
    source        text not null default 'natural_earth_1_50m_admin0',
    constraint country_ref_centroid_pair_ck check ((centroid_lon is null) = (centroid_lat is null)),
    -- XX is the unallocated bucket: a real key for the FK, never a place.
    constraint country_ref_xx_ck check (iso2 <> 'XX' or (centroid_lon is null and is_developed is null))
);

comment on table public.country_ref is
  'ISO 3166-1 alpha-2 reference, generated from Natural Earth 1:50m admin-0 by scripts/build-geo-assets.mjs '
  '(keyed on ISO_A2_EH, never ISO_A2 -- NE publishes Taiwan as CN-TW and France/Norway as -99). '
  'region/subregion are NE REGION_UN/SUBREGION (UN M49 rollups); centroid is NE LABEL_X/LABEL_Y, '
  'a label point inside the polygon rather than a geometric centroid; is_developed is NE ECONOMY classes 1-2. '
  'XX = unallocated revenue, never a place.';

-- ── security_geo_revenue ──────────────────────────────────────────────────
create table public.security_geo_revenue (
    security_id    uuid not null references public.assets(id),
    period_end     date not null,
    iso2           char(2) not null references public.country_ref(iso2),
    revenue_share  numeric(6,4) not null check (revenue_share > 0 and revenue_share <= 1),
    basis          public.geo_revenue_basis not null,
    source_url     text not null check (source_url ~ '^https?://[^\s]+$'),
    source_note    text,
    coverage       numeric(6,4) not null check (coverage >= 0 and coverage <= 1),
    entered_at     timestamptz not null default now(),
    primary key (security_id, period_end, iso2),
    -- A disclosure carries its URL. Anything that is not a straight
    -- disclosure must also say, in words, how the number was reached.
    constraint sgr_note_for_non_disclosed_ck check (
        basis = 'disclosed' or (source_note is not null and btrim(source_note) <> '')
    )
);

comment on table public.security_geo_revenue is
  'Look-through revenue split per security per fiscal period. Shares for one (security_id, period_end) '
  'sum to exactly 1.0000 INCLUDING the XX unallocated row, and every row of the set carries '
  'coverage = 1 - (XX share) -- both enforced by a deferred constraint trigger, never by application code. '
  'Provenance is mandatory: source_url always, source_note whenever basis <> disclosed.';
comment on column public.security_geo_revenue.coverage is
  'Share of the period''s total revenue this row set attributes to a named country (1 - XX share). '
  'Identical on every row of the set.';

create function public.security_geo_revenue_check_set()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
    k record;
    v_n     int;
    v_sum   numeric;
    v_xx    numeric;
    v_cov_n int;
    v_cov   numeric;
begin
    -- A key-changing UPDATE touches two sets; check both.
    for k in
        select new.security_id as sid, new.period_end as pe where tg_op <> 'DELETE'
        union
        select old.security_id, old.period_end where tg_op <> 'INSERT'
    loop
        select count(*), sum(revenue_share),
               coalesce(sum(revenue_share) filter (where iso2 = 'XX'), 0),
               count(distinct coverage), min(coverage)
          into v_n, v_sum, v_xx, v_cov_n, v_cov
          from public.security_geo_revenue
         where security_id = k.sid and period_end = k.pe;

        -- A set deleted in full is legitimate; there is nothing left to sum.
        continue when v_n = 0;

        if v_sum <> 1.0000 then
            raise exception 'security_geo_revenue: shares for % / % sum to %, not 1.0000 (put the residual in XX)',
                k.sid, k.pe, v_sum using errcode = 'check_violation';
        end if;
        if v_cov_n <> 1 or v_cov <> 1.0000 - v_xx then
            raise exception 'security_geo_revenue: coverage for % / % must be 1 - XX share (%) on every row',
                k.sid, k.pe, 1.0000 - v_xx using errcode = 'check_violation';
        end if;
    end loop;
    return null;
end
$fn$;

create constraint trigger security_geo_revenue_set_ck
    after insert or update or delete on public.security_geo_revenue
    deferrable initially deferred
    for each row execute function public.security_geo_revenue_check_set();

revoke execute on function public.security_geo_revenue_check_set() from public, anon, authenticated;

-- ── security_domicile ─────────────────────────────────────────────────────
create table public.security_domicile (
    security_id      uuid primary key references public.assets(id),
    iso2             char(2) not null references public.country_ref(iso2) check (iso2 <> 'XX'),
    instrument_kind  text not null check (instrument_kind in ('issuer', 'fund')),
    source           text not null check (source in ('finnhub_profile', 'manual')),
    source_note      text,
    recorded_at      timestamptz not null default now(),
    constraint sd_manual_note_ck check (
        source <> 'manual' or (source_note is not null and btrim(source_note) <> '')
    )
);

comment on table public.security_domicile is
  'Issuer or fund domicile. An unknown domicile is the ABSENCE of a row, never a default country. '
  'instrument_kind = fund marks a pooled vehicle whose domicile is the wrapper''s, not its holdings'' -- '
  'the resolver never uses a fund''s domicile as a revenue fallback (it allocates to XX instead).';

-- ── RLS: read for the terminal's roles, write for the service role ────────
alter table public.country_ref          enable row level security;
alter table public.security_geo_revenue enable row level security;
alter table public.security_domicile    enable row level security;

create policy country_ref_read on public.country_ref for select to anon, authenticated using (true);
create policy country_ref_service on public.country_ref for all to service_role using (true) with check (true);
create policy security_geo_revenue_read on public.security_geo_revenue for select to anon, authenticated using (true);
create policy security_geo_revenue_service on public.security_geo_revenue for all to service_role using (true) with check (true);
create policy security_domicile_read on public.security_domicile for select to anon, authenticated using (true);
create policy security_domicile_service on public.security_domicile for all to service_role using (true) with check (true);

-- Supabase grants INSERT/UPDATE/DELETE to anon and authenticated on every new
-- table; RLS takes it back, and the grants are removed as well so a policy
-- mistake later is not the only thing standing in the way.
revoke insert, update, delete, truncate on public.country_ref, public.security_geo_revenue, public.security_domicile
    from anon, authenticated;
