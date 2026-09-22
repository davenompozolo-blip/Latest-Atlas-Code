-- is_complete must require an ALIGNED annual period.
--
-- The count was over distinct statement types anywhere in the symbol's annual
-- history, so three types spread across three DIFFERENT fiscal_date_endings
-- counted as complete. vw_company_fundamentals inner-joins on
-- (symbol, fiscal_date_ending, period, source), so such a symbol yields no
-- rows at all -- and resolveSymbols would have skipped it for the whole
-- refresh window on the strength of a completeness it does not have.
--
-- Latent rather than live: all nine complete symbols carry 20 aligned periods
-- today and SNDK carries 0 under both definitions, so the two agree on current
-- data. Fixed anyway -- a dormant defect costs nothing while the context is
-- loaded, and this one re-creates the sticky half-load the view exists to stop.
--
-- statements_present is kept as-is and now means what it says: how many of the
-- three types exist ANYWHERE in the annual history. aligned_annual_periods is
-- published beside it so "3 types, 0 aligned periods" is legible as the
-- specific failure it is.
-- DROP: aligned_annual_periods is inserted mid-list and CREATE OR REPLACE can
-- only append columns. No database object depends on this view; the loader reads
-- it over PostgREST.
drop view if exists public.vw_company_statement_coverage;

create view public.vw_company_statement_coverage as
with s as (
    select symbol, source, 'income'   as rel, period, fiscal_date_ending, loaded_at
      from public.company_income_statement
    union all
    select symbol, source, 'balance',        period, fiscal_date_ending, loaded_at
      from public.company_balance_sheet
    union all
    select symbol, source, 'cashflow',       period, fiscal_date_ending, loaded_at
      from public.company_cash_flow
),
aligned as (
    select symbol, source, count(*) as aligned_annual_periods
    from (
        select symbol, source, fiscal_date_ending
        from s
        where period = 'annual'
        group by symbol, source, fiscal_date_ending
        having count(distinct rel) = 3
    ) q
    group by symbol, source
)
select
    s.symbol,
    s.source,
    count(distinct s.rel) filter (where s.period = 'annual')            as statements_present,
    coalesce(a.aligned_annual_periods, 0)                               as aligned_annual_periods,
    (coalesce(a.aligned_annual_periods, 0) > 0)                         as is_complete,
    count(*) filter (where s.rel = 'income'   and s.period = 'annual')  as income_annual,
    count(*) filter (where s.rel = 'balance'  and s.period = 'annual')  as balance_annual,
    count(*) filter (where s.rel = 'cashflow' and s.period = 'annual')  as cashflow_annual,
    count(*) filter (where s.rel = 'income'   and s.period = 'quarterly') as income_quarterly,
    min(s.fiscal_date_ending) filter (where s.period = 'annual')        as oldest_annual,
    max(s.fiscal_date_ending) filter (where s.period = 'annual')        as newest_annual,
    max(s.loaded_at)                                                    as loaded_at
from s
left join aligned a on a.symbol = s.symbol and a.source = s.source
group by s.symbol, s.source, a.aligned_annual_periods;

comment on view public.vw_company_statement_coverage is
'EQ-2. Per-symbol coverage across the three statements. is_complete is the ONE
definition of "loaded" -- the loader reads it to decide what to skip, so a symbol
that was cut off mid-write is retried rather than being treated as done.

is_complete requires at least one ALIGNED annual period: one fiscal_date_ending
carrying all three statements. Counting the types anywhere in the history let
three statements from three different years read as complete, while
vw_company_fundamentals -- which joins on the period -- returned nothing for that
symbol. statements_present keeps the looser meaning and aligned_annual_periods is
published beside it, so "3 present, 0 aligned" is legible as the specific failure
it is.

An absent symbol and an incomplete one are different facts.';

revoke all on public.vw_company_statement_coverage from public;
grant select on public.vw_company_statement_coverage to anon, authenticated, service_role;


-- One transaction for a symbol's three statements.
--
-- sbUpsert POSTs each statement to /rest/v1/<table> separately, so a failure on
-- the second or third left the first committed. Buffering the fetches (the
-- earlier fix) closed the throttle window but not this one: three requests are
-- three transactions however they are sequenced.
--
-- DELETE-then-INSERT rather than ON CONFLICT DO UPDATE: the three tables carry
-- 24, 36 and 28 mapped columns and an ON CONFLICT would have to enumerate every
-- one of them, which is a list that silently rots as columns are added. Inside
-- a single transaction the pair is indistinguishable from an upsert, and it
-- refreshes loaded_at, which is what a reload should do.
--
-- SECURITY INVOKER: the caller is the service key, which already holds these
-- rights. A DEFINER here would hand anon a write path through PostgREST.
create or replace function public.atlas_upsert_company_statements(
    p_income   jsonb default '[]'::jsonb,
    p_balance  jsonb default '[]'::jsonb,
    p_cashflow jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
set search_path = ''
as $fn$
declare
    n_income   int := 0;
    n_balance  int := 0;
    n_cashflow int := 0;
begin
    if jsonb_typeof(p_income) <> 'array'
       or jsonb_typeof(p_balance) <> 'array'
       or jsonb_typeof(p_cashflow) <> 'array' then
        raise exception 'each payload must be a json array';
    end if;

    delete from public.company_income_statement t
     using jsonb_populate_recordset(null::public.company_income_statement, p_income) s
     where t.symbol = s.symbol and t.fiscal_date_ending = s.fiscal_date_ending
       and t.period = s.period and t.source = s.source;
    insert into public.company_income_statement
    select * from jsonb_populate_recordset(null::public.company_income_statement, p_income);
    get diagnostics n_income = row_count;

    delete from public.company_balance_sheet t
     using jsonb_populate_recordset(null::public.company_balance_sheet, p_balance) s
     where t.symbol = s.symbol and t.fiscal_date_ending = s.fiscal_date_ending
       and t.period = s.period and t.source = s.source;
    insert into public.company_balance_sheet
    select * from jsonb_populate_recordset(null::public.company_balance_sheet, p_balance);
    get diagnostics n_balance = row_count;

    delete from public.company_cash_flow t
     using jsonb_populate_recordset(null::public.company_cash_flow, p_cashflow) s
     where t.symbol = s.symbol and t.fiscal_date_ending = s.fiscal_date_ending
       and t.period = s.period and t.source = s.source;
    insert into public.company_cash_flow
    select * from jsonb_populate_recordset(null::public.company_cash_flow, p_cashflow);
    get diagnostics n_cashflow = row_count;

    return jsonb_build_object(
        'income',   n_income,
        'balance',  n_balance,
        'cashflow', n_cashflow,
        'total',    n_income + n_balance + n_cashflow);
end;
$fn$;

comment on function public.atlas_upsert_company_statements(jsonb, jsonb, jsonb) is
'EQ-2. Writes a symbol''s three statements in ONE transaction, so a failure part
way through cannot leave a half-loaded symbol. Three separate PostgREST POSTs are
three transactions however they are sequenced, and a partial symbol is invisible
downstream because vw_company_fundamentals inner-joins the three.

DELETE-then-INSERT rather than ON CONFLICT DO UPDATE: the tables carry 24, 36 and
28 mapped columns and an enumerated update list rots silently as columns are
added. Inside one transaction the pair is indistinguishable from an upsert, and
it refreshes loaded_at, which is what a reload should do.';

revoke execute on function public.atlas_upsert_company_statements(jsonb, jsonb, jsonb)
    from public, anon, authenticated;
grant execute on function public.atlas_upsert_company_statements(jsonb, jsonb, jsonb)
    to service_role;


-- The peer view's comment asserted a PostgreSQL behaviour that does not exist.
--
-- It said float8 carries NaN "and float NaN does not equal itself", implying an
-- asymmetry with numeric. Measured on PG 17.6: 'NaN'::float8 = 'NaN'::float8 is
-- TRUE, and 'NaN'::float8 > 1e308 is TRUE -- exactly as for numeric. Postgres
-- departs from IEEE 754 for BOTH types so that NaN sorts and can sit in a btree.
-- The cast is still right, for the duller reason that float8 is inexact and
-- these are financial values.
comment on view public.vw_company_fundamental_peers is
'EQ-2. Peer medians computed ONLY from statements actually loaded -- there is no
default, no vendor composite and no fallback, so a thin peer set reports itself as
thin rather than inventing a benchmark.

peer_count counts peers with a MEASURED value for that metric, never the size of the
sector cohort: a peer whose own figure is NULL is not evidence about where this
company sits. A surface must state that count beside any comparison, and render no
comparison at peer_count = 0. A percentile over one peer can only be 0 or 1, so the
count is what makes it readable.

The company is EXCLUDED from its own peer group. A median that contains the subject
is not a benchmark, and with a small cohort the subject can BE the median.

Grouped on aligned_year rather than fiscal_year, because a January year-end and the
previous December year-end describe the same economic year; and on statement_profile,
so a bank is never medianed against an operating company whose ratios are not even
defined the same way.

peer_percentile is NULL when the company has no measurement of its own. A company that
cannot be measured does not sit at the bottom of its peer group.

Every published figure is numeric. percentile_cont returns double precision, so its
results are cast back -- NOT because float and numeric differ over NaN (they do not:
on PG 17.6 both treat NaN as equal to itself and greater than every finite value),
but because float8 is inexact and these are financial values, so vs_peer_median
should be an exact difference of two exact numbers.';
