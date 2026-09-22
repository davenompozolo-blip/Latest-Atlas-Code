-- EQ-1: the persisted multi-year financial statement layer.
--
-- WHY THIS EXISTS. Before this migration the platform held NO multi-year
-- financial statements at all. Measured on 2026-09-22: `equity_cache` carried
-- 913 symbols, 19 of which had any `financials` key, and the `yearly` array was
-- EMPTY on every single one of those 19 (max_years = 0). What the key actually
-- held was `quarterly` EPS-surprise rows ({actual, estimate, quarter}) -- an
-- earnings-beat series, not a statement.
--
-- That single absence is the whole of the Equity Research module's failure.
-- Piotroski scored 0/9 with eight rows blank because eight of its nine tests
-- are year-over-year comparisons and there was no prior year. Altman read
-- "partial estimate X3+X4 only" because X1/X2/X5 need balance-sheet history.
-- Beneish read N/A. Cash-conversion-cycle history, reinvestment rate and
-- dividend coverage rendered em dashes. None of those are display bugs.
--
-- `equity_fundamentals_derived` -- the table those panels read -- holds 38 rows
-- last written 2026-08-11, and NOTHING IN THE REPOSITORY WRITES IT. Grepped
-- across api/, src/, scripts/ and supabase/: readers and the original migration
-- only. It was populated once and has decayed since. Within it: beneish 0/38,
-- ccc_days 0/38, reinvest_rate 0/38, div_coverage 0/38, altman_model='full'
-- 0/38.
--
-- SOURCE. Alpha Vantage's INCOME_STATEMENT / BALANCE_SHEET / CASH_FLOW, whose
-- fields are normalised against the SEC's GAAP and IFRS taxonomies -- which is
-- what makes a CFA-style ratio framework computable without per-filer concept
-- matching. Measured on TGT: **20 annual periods (FY2007..FY2026) and 81
-- quarters** on all three statements.
--
-- The existing Finnhub path is NOT the source. `api/equity.js:584` already
-- calls /stock/financials-reported and then does `annuals.sort(); var latest =
-- annuals[0]` -- it fetches the history and keeps one year. Its XBRL concepts
-- also arrive either bare or namespace-prefixed, which is why that file carries
-- a fuzzy `concept(items, tags)` matcher. Finnhub remains the breadth feed for
-- profile/metric/peers; statements come from the normalised source.
--
-- FIELD RELIABILITY WAS MEASURED, NOT ASSUMED, across all 20 annual periods,
-- because it decides which metrics can be published:
--
--   income statement  16 of 26 fields at 20/20 -- revenue, gross profit, COGS,
--                     operating income, SG&A, opex, EBIT, EBITDA, D&A, interest
--                     expense, pre-tax income, tax, net income all complete.
--   cash flow         13 of 30 at 20/20 -- operating cash flow, capex, D&A,
--                     dividendPayout, stock-based comp, cashflow from
--                     investment/financing, proceedsFromRepurchaseOfEquity.
--
-- Two traps in that measurement, both of which shape the schema:
--
--   1. `researchAndDevelopment` is 0/20 for TGT. That is a RETAILER WITH NO
--      R&D, not a data gap. NULL here means "not reported", never "zero" --
--      the surface must say "not reported" rather than render 0.0%, which is
--      this codebase's oldest recurring defect in a new place.
--   2. `paymentsForRepurchaseOfCommonStock` is 0/20 while
--      `proceedsFromRepurchaseOfEquity` is 20/20. The buybacks ARE there,
--      under the field whose name reads like the opposite. Do not conclude a
--      company has no buyback programme from the obvious column being empty.
--
-- The dead cash-flow working-capital fields (changeInOperatingAssets,
-- changeInOperatingLiabilities at 0/20, changeInReceivables at 4/20) are why
-- the FCFF derivation takes its delta-working-capital from BALANCE SHEET
-- deltas rather than from the cash-flow statement. That is the better
-- derivation anyway; here it is also the only one available.
--
-- KEY. (symbol, fiscal_date_ending, period, source). Every component comes
-- from the filing itself, so it survives recomputation -- the test this
-- codebase applies before reusing an upsert key. `source` is IN the key on
-- purpose: it lets a second vendor coexist and be reconciled the way
-- atlas_check_feed_reconciliation already reconciles two price providers,
-- rather than one silently overwriting the other. A consumer picks its source
-- explicitly and is never handed a mixture.

create table if not exists public.company_income_statement (
    symbol                                  text not null,
    fiscal_date_ending                      date not null,
    period                                  text not null,
    source                                  text not null,
    reported_currency                       text,

    total_revenue                           numeric,
    cost_of_revenue                         numeric,
    cost_of_goods_and_services_sold         numeric,
    gross_profit                            numeric,
    operating_income                        numeric,
    operating_expenses                      numeric,
    selling_general_and_administrative      numeric,
    research_and_development                numeric,
    depreciation                            numeric,
    depreciation_and_amortization           numeric,
    ebit                                    numeric,
    ebitda                                  numeric,
    interest_expense                        numeric,
    interest_income                         numeric,
    net_interest_income                     numeric,
    interest_and_debt_expense               numeric,
    investment_income_net                   numeric,
    non_interest_income                     numeric,
    other_non_operating_income              numeric,
    income_before_tax                       numeric,
    income_tax_expense                      numeric,
    net_income_from_continuing_operations   numeric,
    comprehensive_income_net_of_tax         numeric,
    net_income                              numeric,

    loaded_at                               timestamptz not null default now(),

    primary key (symbol, fiscal_date_ending, period, source),
    constraint cis_period_ck check (period in ('annual','quarterly')),
    constraint cis_source_ck check (btrim(source) <> ''),
    -- Two-sided ranges, never a one-sided bound: numeric 'NaN' sorts ABOVE
    -- every finite value and would satisfy `>= 0`, and 'Infinity' passes an
    -- `IS DISTINCT FROM 'NaN'` guard. Only the upper AND lower bound together
    -- refuse all three sentinels while leaving NULL untouched. Applied to the
    -- drivers every downstream ratio divides by, where one poisoned value
    -- would contaminate the whole statement rather than one cell.
    constraint cis_finite_ck check (
        (total_revenue is null or (total_revenue > '-Infinity'::numeric and total_revenue < 'Infinity'::numeric))
    and (net_income    is null or (net_income    > '-Infinity'::numeric and net_income    < 'Infinity'::numeric))
    and (ebit          is null or (ebit          > '-Infinity'::numeric and ebit          < 'Infinity'::numeric))
    and (ebitda        is null or (ebitda        > '-Infinity'::numeric and ebitda        < 'Infinity'::numeric))
    and (gross_profit  is null or (gross_profit  > '-Infinity'::numeric and gross_profit  < 'Infinity'::numeric))
    )
);

create table if not exists public.company_balance_sheet (
    symbol                                  text not null,
    fiscal_date_ending                      date not null,
    period                                  text not null,
    source                                  text not null,
    reported_currency                       text,

    total_assets                            numeric,
    total_current_assets                    numeric,
    cash_and_cash_equivalents               numeric,
    cash_and_short_term_investments         numeric,
    inventory                               numeric,
    current_net_receivables                 numeric,
    total_non_current_assets                numeric,
    property_plant_equipment                numeric,
    accumulated_depreciation_amortization_ppe numeric,
    intangible_assets                       numeric,
    intangible_assets_excluding_goodwill    numeric,
    goodwill                                numeric,
    investments                             numeric,
    long_term_investments                   numeric,
    short_term_investments                  numeric,
    other_current_assets                    numeric,
    other_non_current_assets                numeric,

    total_liabilities                       numeric,
    total_current_liabilities               numeric,
    current_accounts_payable                numeric,
    deferred_revenue                        numeric,
    current_debt                            numeric,
    short_term_debt                         numeric,
    total_non_current_liabilities           numeric,
    capital_lease_obligations               numeric,
    long_term_debt                          numeric,
    current_long_term_debt                  numeric,
    long_term_debt_noncurrent               numeric,
    short_long_term_debt_total              numeric,
    other_current_liabilities               numeric,
    other_non_current_liabilities           numeric,

    total_shareholder_equity                numeric,
    treasury_stock                          numeric,
    retained_earnings                       numeric,
    common_stock                            numeric,
    common_stock_shares_outstanding         numeric,

    loaded_at                               timestamptz not null default now(),

    primary key (symbol, fiscal_date_ending, period, source),
    constraint cbs_period_ck check (period in ('annual','quarterly')),
    constraint cbs_source_ck check (btrim(source) <> ''),
    constraint cbs_finite_ck check (
        (total_assets             is null or (total_assets             > '-Infinity'::numeric and total_assets             < 'Infinity'::numeric))
    and (total_liabilities        is null or (total_liabilities        > '-Infinity'::numeric and total_liabilities        < 'Infinity'::numeric))
    and (total_shareholder_equity is null or (total_shareholder_equity > '-Infinity'::numeric and total_shareholder_equity < 'Infinity'::numeric))
    and (total_current_assets     is null or (total_current_assets     > '-Infinity'::numeric and total_current_assets     < 'Infinity'::numeric))
    and (total_current_liabilities is null or (total_current_liabilities > '-Infinity'::numeric and total_current_liabilities < 'Infinity'::numeric))
    )
);

create table if not exists public.company_cash_flow (
    symbol                                  text not null,
    fiscal_date_ending                      date not null,
    period                                  text not null,
    source                                  text not null,
    reported_currency                       text,

    operating_cashflow                      numeric,
    payments_for_operating_activities       numeric,
    proceeds_from_operating_activities      numeric,
    change_in_operating_liabilities         numeric,
    change_in_operating_assets              numeric,
    depreciation_depletion_and_amortization numeric,
    capital_expenditures                    numeric,
    change_in_receivables                   numeric,
    change_in_inventory                     numeric,
    profit_loss                             numeric,
    cashflow_from_investment                numeric,
    cashflow_from_financing                 numeric,
    proceeds_from_repayments_of_short_term_debt numeric,
    payments_for_repurchase_of_common_stock numeric,
    payments_for_repurchase_of_equity       numeric,
    payments_for_repurchase_of_preferred_stock numeric,
    dividend_payout                         numeric,
    dividend_payout_common_stock            numeric,
    dividend_payout_preferred_stock         numeric,
    proceeds_from_issuance_of_common_stock  numeric,
    proceeds_from_issuance_of_lt_debt_and_cap_securities_net numeric,
    proceeds_from_issuance_of_preferred_stock numeric,
    proceeds_from_repurchase_of_equity      numeric,
    proceeds_from_sale_of_treasury_stock    numeric,
    stock_based_compensation                numeric,
    change_in_cash_and_cash_equivalents     numeric,
    change_in_exchange_rate                 numeric,
    net_income                              numeric,

    loaded_at                               timestamptz not null default now(),

    primary key (symbol, fiscal_date_ending, period, source),
    constraint ccf_period_ck check (period in ('annual','quarterly')),
    constraint ccf_source_ck check (btrim(source) <> ''),
    constraint ccf_finite_ck check (
        (operating_cashflow   is null or (operating_cashflow   > '-Infinity'::numeric and operating_cashflow   < 'Infinity'::numeric))
    and (capital_expenditures is null or (capital_expenditures > '-Infinity'::numeric and capital_expenditures < 'Infinity'::numeric))
    and (net_income           is null or (net_income           > '-Infinity'::numeric and net_income           < 'Infinity'::numeric))
    and (dividend_payout      is null or (dividend_payout      > '-Infinity'::numeric and dividend_payout      < 'Infinity'::numeric))
    )
);

-- The common read is "this symbol, annual, newest first".
create index if not exists cis_symbol_period_date_idx on public.company_income_statement (symbol, period, fiscal_date_ending desc);
create index if not exists cbs_symbol_period_date_idx on public.company_balance_sheet    (symbol, period, fiscal_date_ending desc);
create index if not exists ccf_symbol_period_date_idx on public.company_cash_flow        (symbol, period, fiscal_date_ending desc);

-- RLS. Supabase's default grants give anon and authenticated INSERT on every
-- table in public, and RLS is the only thing that takes it back -- the defect
-- book_regime_cvar shipped with. Read is open (this is reference data a
-- browser surface queries directly); writes are service_role only.
alter table public.company_income_statement enable row level security;
alter table public.company_balance_sheet    enable row level security;
alter table public.company_cash_flow        enable row level security;

drop policy if exists cis_read on public.company_income_statement;
drop policy if exists cbs_read on public.company_balance_sheet;
drop policy if exists ccf_read on public.company_cash_flow;
create policy cis_read on public.company_income_statement for select to anon, authenticated using (true);
create policy cbs_read on public.company_balance_sheet    for select to anon, authenticated using (true);
create policy ccf_read on public.company_cash_flow        for select to anon, authenticated using (true);

drop policy if exists cis_service on public.company_income_statement;
drop policy if exists cbs_service on public.company_balance_sheet;
drop policy if exists ccf_service on public.company_cash_flow;
create policy cis_service on public.company_income_statement for all to service_role using (true) with check (true);
create policy cbs_service on public.company_balance_sheet    for all to service_role using (true) with check (true);
create policy ccf_service on public.company_cash_flow        for all to service_role using (true) with check (true);

comment on table public.company_income_statement is
  'Normalised multi-year income statements. Key includes source so two vendors can coexist and be reconciled rather than overwrite. NULL means NOT REPORTED, never zero -- research_and_development is empty for a retailer because it has none, and a surface must say so rather than render 0.';
comment on table public.company_balance_sheet is
  'Normalised multi-year balance sheets. Working-capital deltas for FCFF are derived HERE, not from the cash-flow statement, whose change_in_operating_assets/liabilities fields measured 0 of 20 annual periods.';
comment on table public.company_cash_flow is
  'Normalised multi-year cash-flow statements. Buybacks live in proceeds_from_repurchase_of_equity (20/20 measured); payments_for_repurchase_of_common_stock is 0/20 despite its name -- do not read the empty column as an absent buyback programme.';
