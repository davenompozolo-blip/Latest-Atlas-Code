-- ============================================================
-- EQ-9c: `income_quarterly` is ONE statement's row count, and the Financials
-- tab was reading it as "the quarterly basis carries periods".
--
-- `vw_company_fundamentals` INNER JOINs the three statements, so a basis
-- renders only where all three share a fiscal date. The view published
-- `aligned_annual_periods` for exactly that reason on the annual side and
-- published NOTHING equivalent for quarterly -- so the only quarterly signal
-- available to a consumer was an income-statement count.
--
-- Measured 2026-09-24: SNDK carries `income_quarterly = 12` and **0** aligned
-- quarterly periods (income only; no balance sheet, no cash flow -- the
-- half-loaded symbol EQ-2 records). The other eight quarterly symbols align
-- 81 of 81, which is why the wrong field looked right.
--
-- The `fwd_pe` rule, in a coverage column: WHEN A COLUMN'S NAME ASSERTS A
-- MEASURE, CHECK THE FIELD IT READS. `income_quarterly` is kept -- it is an
-- honest per-statement count and `api/sync-financials.js` reads `is_complete`
-- beside it -- and `aligned_quarterly_periods` is added as the figure that
-- actually predicts whether the quarterly basis will return rows.
--
-- CREATE OR REPLACE appends; it cannot reorder or retype, so every existing
-- column keeps its name, position and type and no consumer moves.
-- ============================================================

create or replace view public.vw_company_statement_coverage as
with s as (
    select symbol, source, 'income'::text   as rel, period, fiscal_date_ending, loaded_at from public.company_income_statement
    union all
    select symbol, source, 'balance'::text,         period, fiscal_date_ending, loaded_at from public.company_balance_sheet
    union all
    select symbol, source, 'cashflow'::text,        period, fiscal_date_ending, loaded_at from public.company_cash_flow
),
aligned as (
    select q.symbol, q.source, count(*) as aligned_annual_periods
    from (
        select s_1.symbol, s_1.source, s_1.fiscal_date_ending
        from s s_1
        where s_1.period = 'annual'
        group by s_1.symbol, s_1.source, s_1.fiscal_date_ending
        having count(distinct s_1.rel) = 3
    ) q
    group by q.symbol, q.source
),
-- The same three-way alignment on the quarterly basis. Without it a consumer
-- can only see one statement's count and cannot tell a renderable basis from
-- a half-loaded one.
aligned_q as (
    select q.symbol, q.source, count(*) as aligned_quarterly_periods
    from (
        select s_1.symbol, s_1.source, s_1.fiscal_date_ending
        from s s_1
        where s_1.period = 'quarterly'
        group by s_1.symbol, s_1.source, s_1.fiscal_date_ending
        having count(distinct s_1.rel) = 3
    ) q
    group by q.symbol, q.source
)
select
    s.symbol,
    s.source,
    count(distinct s.rel) filter (where s.period = 'annual')                       as statements_present,
    coalesce(a.aligned_annual_periods, 0::bigint)                                  as aligned_annual_periods,
    coalesce(a.aligned_annual_periods, 0::bigint) > 0                              as is_complete,
    count(*) filter (where s.rel = 'income'   and s.period = 'annual')             as income_annual,
    count(*) filter (where s.rel = 'balance'  and s.period = 'annual')             as balance_annual,
    count(*) filter (where s.rel = 'cashflow' and s.period = 'annual')             as cashflow_annual,
    count(*) filter (where s.rel = 'income'   and s.period = 'quarterly')          as income_quarterly,
    min(s.fiscal_date_ending) filter (where s.period = 'annual')                   as oldest_annual,
    max(s.fiscal_date_ending) filter (where s.period = 'annual')                   as newest_annual,
    max(s.loaded_at)                                                               as loaded_at,
    -- APPENDED LAST so the existing column order is untouched.
    coalesce(aq.aligned_quarterly_periods, 0::bigint)                              as aligned_quarterly_periods
from s
    left join aligned  a  on a.symbol  = s.symbol and a.source  = s.source
    left join aligned_q aq on aq.symbol = s.symbol and aq.source = s.source
group by s.symbol, s.source, a.aligned_annual_periods, aq.aligned_quarterly_periods;

comment on column public.vw_company_statement_coverage.aligned_quarterly_periods is
'Quarterly fiscal dates carrying ALL THREE statements -- the count that predicts whether the quarterly basis returns rows from vw_company_fundamentals, which inner-joins them. Distinct from income_quarterly, which counts income-statement rows alone: SNDK had 12 of those and 0 aligned (2026-09-24).';

revoke all on public.vw_company_statement_coverage from public;
grant select on public.vw_company_statement_coverage to anon, authenticated, service_role;
