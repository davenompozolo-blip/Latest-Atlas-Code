-- ============================================================
-- EQ-4 · company_reported_lines — the AS-REPORTED XBRL line items.
--
-- EQ-1 and EQ-2 rest on Alpha Vantage's NORMALISED schema, which is what
-- makes a retailer and a bank comparable in one set of columns. It is also
-- what discards every line the CFA L2 V3 LM4 financial-institution
-- frameworks need: no deposits, no net interest income, no premiums earned,
-- no loss reserves. EQ-3 measured Finnhub's as-reported feed and found those
-- lines present on 15 of 15 JPM periods and 16-19 periods on eight insurers.
--
-- WHY LONG FORM RATHER THAN COLUMNS. A wide table has to decide, at write
-- time, which tag means which field — and that decision is exactly what is
-- not yet known. Probing eight insurers left `policyholder_benefits` at 0/8,
-- `premiums_written_net` at 1/8 and `underwriting_expense` matched to a tag
-- that carries deferred-acquisition-cost amortisation rather than
-- underwriting expense. Storing the tag the filer used makes a corrected
-- mapping a CREATE OR REPLACE VIEW; storing a mapped column makes it a
-- backfill. Same argument as `ratio_pairs`, where no ratio is stored and the
-- legs are evaluated at query time so a pair can be re-specified.
--
-- It also removes a round trip that is otherwise structural: with the lines
-- stored, "which tag does this filer use for claims incurred" is a SQL query
-- against this table rather than a code change, a deploy and a vendor call.
-- ============================================================

create table if not exists public.company_reported_lines (
    source        text        not null,
    symbol        text        not null,
    fiscal_year   int         not null,
    concept       text        not null,

    -- The filing's own identity, kept so a figure can be traced to the
    -- document it came from rather than to a year label.
    form          text,
    period_end    date,
    filed_date    date,
    accession     text,

    -- 'ic' | 'bs' | 'cf' — the section the vendor placed it in. A concept can
    -- legitimately appear in more than one, so the PK does not include it;
    -- the first occurrence wins, which is what indexReport already does.
    section       text,

    -- The LABEL is what a human wrote in the filing. It is not decoration:
    -- it is the only handle on a tag nobody has mapped, and searching it is
    -- how the mapping for a new filer class gets built at all.
    label         text,

    -- The taxonomy prefix, lowercased, or NULL for a bare/us-gaap tag.
    -- EQ-3e: a namespace is part of a concept's identity. `ifrs-full:Assets`
    -- is not `us-gaap:Assets`, and collapsing them reports mapping coverage
    -- that does not exist.
    taxonomy      text,

    value         numeric,
    unit          text,
    loaded_at     timestamptz not null default now(),

    constraint crl_pk primary key (source, symbol, fiscal_year, concept),

    -- A TWO-SIDED range, never a one-sided bound. PostgreSQL sorts NaN ABOVE
    -- every finite value and treats it as equal to itself, so `value > -1e30`
    -- alone admits NaN and +Infinity; the upper bound is what refuses them.
    -- NULL yields NULL and the CHECK passes, so an unreported line is
    -- untouched. Same guard as var_backtest_runs and book_regime_cvar.
    constraint crl_value_finite_ck check (
        value is null
        or (value > '-Infinity'::numeric and value < 'Infinity'::numeric)
    ),
    constraint crl_section_ck check (section is null or section in ('ic', 'bs', 'cf')),
    constraint crl_symbol_ck  check (btrim(symbol) <> ''),
    constraint crl_concept_ck check (btrim(concept) <> '')
);

comment on table public.company_reported_lines is
'EQ-4. As-reported XBRL line items from Finnhub /stock/financials-reported,
long form. The financial-institution frameworks (CAMELS, P&C, life/health) need
lines that Alpha Vantage''s normalised schema discards, and the mapping from tag
to field is not fully known — so the TAG is stored and the mapping lives in a
view, where correcting it costs a CREATE OR REPLACE rather than a backfill.';

comment on column public.company_reported_lines.label is
'The filer''s own wording. The only handle on an unmapped tag: searching the tag
can find nothing that was not already guessed.';

comment on column public.company_reported_lines.taxonomy is
'Lowercased namespace prefix, NULL for us-gaap or a bare tag. A foreign-taxonomy
line is a different concept, not the same one spelled differently.';

-- Symbol-scoped reads are the access pattern for the ratio views; the concept
-- index serves the mapping exercise (find every filer using this tag).
create index if not exists crl_symbol_year_idx on public.company_reported_lines (symbol, fiscal_year desc);
create index if not exists crl_concept_idx     on public.company_reported_lines (concept);

-- RLS, not just the PK. Supabase grants anon and authenticated INSERT on every
-- table in `public` by default and RLS is the only thing that takes it back —
-- book_regime_cvar shipped without it and sat open to anonymous writes.
alter table public.company_reported_lines enable row level security;

drop policy if exists crl_read on public.company_reported_lines;
create policy crl_read on public.company_reported_lines
    for select to anon, authenticated using (true);

drop policy if exists crl_service on public.company_reported_lines;
create policy crl_service on public.company_reported_lines
    for all to service_role using (true) with check (true);


-- ── the writer ──────────────────────────────────────────────────────────
-- One symbol, one transaction. EQ-2 found SNDK with an income statement and
-- no balance sheet because the loader wrote each statement as it fetched and
-- the throttle broke the run between calls; a symbol loaded half way is
-- invisible downstream and STICKY, because the freshness check counts it as
-- loaded. DELETE-then-INSERT scoped to the symbol, so a re-run that returns
-- fewer concepts does not leave the dropped ones behind as though the filer
-- still reported them.
--
-- SECURITY INVOKER: the caller is the service key, which already holds these
-- rights. A DEFINER here would hand anon a write path through PostgREST.
create or replace function public.atlas_upsert_reported_lines(
    p_lines jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
set search_path = ''
as $fn$
declare
    n_rows int := 0;
    n_syms int := 0;
    v_now  timestamptz := now();
begin
    if jsonb_typeof(p_lines) <> 'array' then
        raise exception 'p_lines must be a json array';
    end if;
    if jsonb_array_length(p_lines) = 0 then
        -- A no-op must not answer as a write. Returning zero with a reason
        -- is what distinguishes "nothing to load" from "the load produced
        -- nothing", which this codebase has had to separate four times.
        return jsonb_build_object('rows', 0, 'symbols', 0, 'reason', 'empty payload');
    end if;

    -- `loaded_at` is stamped here, not taken from the payload. Under
    -- `insert ... select *` an omitted key is an explicit NULL rather than an
    -- absent column, so a NOT NULL DEFAULT column is mandatory-and-unstated
    -- and the call dies on 23502 -- which is exactly what
    -- atlas_upsert_company_statements did on every call it ever received.
    p_lines := coalesce((select jsonb_agg(e || jsonb_build_object('loaded_at', v_now))
                           from jsonb_array_elements(p_lines) e), '[]'::jsonb);

    -- Scoped to the (symbol, source) PAIRS actually present. Two arrays
    -- compared with `= any` is a CROSS PRODUCT: a batch carrying (A, finnhub)
    -- and (B, alpha_vantage) would delete A's alpha_vantage lines and B's
    -- finnhub lines, neither of which it is about to rewrite.
    delete from public.company_reported_lines t
     using (select distinct s.symbol, s.source
              from jsonb_populate_recordset(null::public.company_reported_lines, p_lines) s) k
     where t.symbol = k.symbol and t.source = k.source;

    select count(distinct s.symbol) into n_syms
      from jsonb_populate_recordset(null::public.company_reported_lines, p_lines) s;

    insert into public.company_reported_lines
    select * from jsonb_populate_recordset(null::public.company_reported_lines, p_lines);
    get diagnostics n_rows = row_count;

    return jsonb_build_object('rows', n_rows, 'symbols', n_syms);
end;
$fn$;

comment on function public.atlas_upsert_reported_lines(jsonb) is
'EQ-4. Writes one or more symbols'' as-reported lines in ONE transaction.
DELETE-then-INSERT scoped to (symbol, source) rather than ON CONFLICT: a re-run
that returns fewer concepts must not leave the dropped ones standing as though
the filer still reported them.';

revoke execute on function public.atlas_upsert_reported_lines(jsonb)
    from public, anon, authenticated;
grant execute on function public.atlas_upsert_reported_lines(jsonb) to service_role;
