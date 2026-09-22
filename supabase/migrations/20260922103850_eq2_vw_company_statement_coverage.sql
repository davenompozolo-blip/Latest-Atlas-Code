-- EQ-2. What is actually loaded, per symbol, across the three statements.
--
-- Found by EQ-2's derived view silently losing SNDK. Its income statement had
-- landed and its balance sheet and cash flow had not, because the loader wrote
-- each statement as it fetched and the Alpha Vantage throttle broke the run
-- between calls. vw_company_fundamentals inner-joins the three, so the symbol
-- did not appear as incomplete -- it did not appear at all.
--
-- Worse, the loader's own freshness check read company_income_statement ALONE,
-- so a half-loaded symbol counted as loaded and was skipped for the whole
-- refresh window. A partial symbol was not merely tolerated; it was sticky.
--
-- is_complete is the single definition of "this symbol is loaded", read by the
-- loader when it decides what to skip and available to any surface that needs
-- to state its own coverage. An absent symbol and an incomplete one are
-- different facts and are kept apart here.
create or replace view public.vw_company_statement_coverage as
with s as (
    select symbol, source, 'income'   as rel, period, fiscal_date_ending, loaded_at
      from public.company_income_statement
    union all
    select symbol, source, 'balance',        period, fiscal_date_ending, loaded_at
      from public.company_balance_sheet
    union all
    select symbol, source, 'cashflow',       period, fiscal_date_ending, loaded_at
      from public.company_cash_flow
)
select
    symbol,
    source,
    count(distinct rel) filter (where period = 'annual')            as statements_present,
    (count(distinct rel) filter (where period = 'annual') = 3)      as is_complete,
    count(*) filter (where rel = 'income'   and period = 'annual')  as income_annual,
    count(*) filter (where rel = 'balance'  and period = 'annual')  as balance_annual,
    count(*) filter (where rel = 'cashflow' and period = 'annual')  as cashflow_annual,
    count(*) filter (where rel = 'income'   and period = 'quarterly') as income_quarterly,
    min(fiscal_date_ending) filter (where period = 'annual')        as oldest_annual,
    max(fiscal_date_ending) filter (where period = 'annual')        as newest_annual,
    max(loaded_at)                                                  as loaded_at
from s
group by symbol, source;

comment on view public.vw_company_statement_coverage is
'EQ-2. Per-symbol coverage across the three statements. is_complete is the ONE
definition of "loaded" -- the loader reads it to decide what to skip, so a symbol
that was cut off mid-write is retried rather than being treated as done.

The loader previously judged freshness from company_income_statement alone, which
made a half-loaded symbol sticky: it looked loaded, was skipped for the whole
refresh window, and was invisible in the derived view because that view inner-joins
the three statements. An absent symbol and an incomplete one are different facts.';

revoke all on public.vw_company_statement_coverage from public;
grant select on public.vw_company_statement_coverage to anon, authenticated, service_role;
