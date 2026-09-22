-- EQ-2. Two corrections from CodeRabbit's review of PR #804. Both are right and
-- both were verified against the loaded data before being applied.
--
-- 1. THE DIVIDEND ZERO-INFERENCE IS REVERTED.
--
-- The previous migration read "a cash-flow row that parsed but carries no
-- dividend line means the company paid none". The review's objection was that
-- `operating_cashflow is not null` proves one field parsed, not that the
-- dividend fields were complete. The data proves the objection twice over:
--
--   GOOGL paid no dividend from 2013 to 2023. Alpha Vantage reports an explicit
--   0 for 2014-2017 and 2022-2023, and NULL for 2018-2021 -- the same company
--   in the same non-paying state, encoded two different ways.
--
--   AMD has never paid a common dividend, yet the field carries 6,000,000 /
--   85,000,000 / 104,000,000 for 2019-2021 and NULL for 2022-2025.
--
-- So the field is unreliable in BOTH directions: NULL where zero is true, and
-- non-zero where no common dividend was paid. The justification originally
-- given for the inference ("AMD pays no dividend") is contradicted by AMD's own
-- rows. dividends_paid and buybacks are NULL when not reported.
--
-- The cost is real and is accepted: a genuine non-payer now has no retention
-- ratio and therefore no sustainable growth rate, which is the case SGR is most
-- wanted for. An absent number beats a fabricated one, and SGR feeds valuation.
-- A reliable dividend source (Alpha Vantage's DIVIDENDS endpoint, or Finnhub)
-- is its own unit. dividend_line_reported stays: it now reports what the vendor
-- did, and asserts nothing about what the company did.
--
-- 2. THE REMAINING CFO-DERIVED AND VENDOR-CONSTRUCTED AGGREGATES ARE GATED.
--
-- cash_conversion and sloan_accrual_ratio both treat operating_cashflow as a
-- comparable operating-cash measure, which is the exact rationale used to null
-- free_cash_flow, fcff, fcfe and cfo_to_debt. Leaving them was an
-- inconsistency. JPM FY2025 was publishing a cash_conversion of -2.59, from a
-- CFO of -147,782m against net income of 57,048m, as an earnings-quality
-- reading.
--
-- gross_margin and ebitda_margin go with them on the same reasoning one step
-- out: "gross profit" is not a line a bank reports and EBITDA is not a
-- meaningful aggregate where interest is operating rather than financing. The
-- view ALREADY nulls debt_to_ebitda and net_debt_to_ebitda for that reason, so
-- publishing the margin built on the same aggregate was the same inconsistency
-- wearing different clothes.
--
-- asset_turnover, operating_margin and net_margin are KEPT. A bank's asset
-- turnover is genuinely low (JPM 0.066 against TGT 1.787) rather than
-- undefined, and the peer view groups by statement_profile, so banks are
-- compared with banks.
--
-- Nulling is the honest interim, not the end state: a financial needs its own
-- framework (net interest margin, efficiency ratio, cost of risk, coverage,
-- capital adequacy), which is a unit of its own.
create or replace view public.vw_company_fundamentals as
with sect as (
    select distinct on (symbol) symbol, sector
    from public.assets
    where symbol is not null
    order by symbol, updated_at desc nulls last
),
base as (
    select
        i.symbol, i.fiscal_date_ending, i.period, i.source,
        coalesce(i.reported_currency, b.reported_currency, c.reported_currency) as reported_currency,
        extract(year from i.fiscal_date_ending)::int as fiscal_year,
        s.sector,
        (s.sector ilike '%financ%')                                    as is_financial,

        i.total_revenue, i.gross_profit, i.operating_income, i.ebit, i.ebitda,
        i.net_income, i.income_before_tax, i.income_tax_expense, i.interest_expense,
        i.selling_general_and_administrative, i.research_and_development,
        coalesce(i.cost_of_revenue, i.cost_of_goods_and_services_sold) as cogs,
        coalesce(i.depreciation_and_amortization, i.depreciation)      as d_and_a,

        b.total_assets, b.total_current_assets, b.total_current_liabilities,
        b.total_liabilities, b.total_shareholder_equity, b.inventory,
        b.current_net_receivables, b.current_accounts_payable, b.retained_earnings,
        b.cash_and_cash_equivalents, b.cash_and_short_term_investments,
        b.property_plant_equipment, b.goodwill, b.intangible_assets,
        b.common_stock_shares_outstanding,
        coalesce(b.short_long_term_debt_total,
                 coalesce(b.current_debt, b.short_term_debt, 0)
               + coalesce(b.long_term_debt, b.long_term_debt_noncurrent, 0)) as total_debt,

        c.operating_cashflow, c.capital_expenditures, c.stock_based_compensation,
        c.cashflow_from_investment, c.cashflow_from_financing,
        -- NULL when the vendor reported no dividend line, never 0. Alpha
        -- Vantage encodes a non-paying year as an explicit 0 in some periods
        -- and as NULL in others (GOOGL 2013-2023), and reports non-zero
        -- amounts for a company that paid no common dividend (AMD 2019-2021),
        -- so absence cannot carry a claim about what the company paid.
        -- dividend_line_reported says what the VENDOR did, not the company.
        (coalesce(c.dividend_payout_common_stock, c.dividend_payout) is not null) as dividend_line_reported,
        abs(coalesce(c.dividend_payout_common_stock, c.dividend_payout)) as dividends_paid,
        abs(coalesce(c.proceeds_from_repurchase_of_equity,
                     c.payments_for_repurchase_of_common_stock,
                     c.payments_for_repurchase_of_equity)) as buybacks
    from public.company_income_statement i
    join public.company_balance_sheet b
      on b.symbol = i.symbol and b.fiscal_date_ending = i.fiscal_date_ending
     and b.period = i.period  and b.source = i.source
    join public.company_cash_flow c
      on c.symbol = i.symbol and c.fiscal_date_ending = i.fiscal_date_ending
     and c.period = i.period  and c.source = i.source
    left join sect s on s.symbol = i.symbol
),
lagged as (
    select base.*,
        lag(total_revenue)             over w as pr_revenue,
        lag(net_income)                over w as pr_net_income,
        lag(gross_profit)              over w as pr_gross_profit,
        lag(operating_income)          over w as pr_operating_income,
        lag(total_assets)              over w as pr_total_assets,
        lag(total_current_assets)      over w as pr_total_current_assets,
        lag(total_current_liabilities) over w as pr_total_current_liabilities,
        lag(total_shareholder_equity)  over w as pr_total_equity,
        lag(total_debt)                over w as pr_total_debt,
        lag(inventory)                 over w as pr_inventory,
        lag(current_net_receivables)   over w as pr_receivables,
        lag(current_accounts_payable)  over w as pr_payables,
        lag(cogs)                      over w as pr_cogs,
        lag(operating_cashflow)        over w as pr_cfo,
        lag(d_and_a)                   over w as pr_d_and_a,
        lag(property_plant_equipment)  over w as pr_ppe,
        lag(selling_general_and_administrative) over w as pr_sga,
        lag(common_stock_shares_outstanding)    over w as pr_shares,
        lag(cash_and_cash_equivalents) over w as pr_cash,
        lag(fiscal_date_ending)        over w as pr_fiscal_date_ending
    from base
    window w as (partition by symbol, period, source order by fiscal_date_ending)
),
calc as (
    select lagged.*,
        least(greatest(income_tax_expense / nullif(income_before_tax, 0), 0), 1) as tax_clamped,
        (total_assets + pr_total_assets) / 2.0            as avg_assets,
        (total_shareholder_equity + pr_total_equity) / 2.0 as avg_equity,
        (inventory + pr_inventory) / 2.0                  as avg_inventory,
        (current_net_receivables + pr_receivables) / 2.0  as avg_receivables,
        (current_accounts_payable + pr_payables) / 2.0    as avg_payables,
        ((total_debt + total_shareholder_equity) + (pr_total_debt + pr_total_equity)) / 2.0 as avg_invested_capital,
        (operating_cashflow - abs(capital_expenditures))  as fcf_raw
    from lagged
)
select
    symbol, fiscal_date_ending, fiscal_year, period, source, reported_currency,
    pr_fiscal_date_ending, sector,
    case when sector is null then 'unknown'
         when is_financial  then 'financial'
         else 'operating' end                                       as statement_profile,
    dividend_line_reported,

    -- ── scale (always published) ─────────────────────────────────────────
    total_revenue, gross_profit, operating_income, ebit, ebitda, net_income,
    income_before_tax, income_tax_expense, interest_expense,
    cogs, d_and_a, research_and_development,
    total_assets, total_liabilities, total_shareholder_equity, total_debt,
    total_current_assets, total_current_liabilities, inventory,
    cash_and_cash_equivalents, retained_earnings,
    operating_cashflow, capital_expenditures, stock_based_compensation,
    common_stock_shares_outstanding,
    dividends_paid, buybacks,
    (total_debt - coalesce(cash_and_short_term_investments, cash_and_cash_equivalents)) as net_debt,

    -- ── operating-cycle & liquidity: NOT DEFINED FOR A FINANCIAL ─────────
    -- A bank has no operating cycle and no working-capital cycle; a current
    -- ratio over a deposit base is arithmetic, not a solvency reading.
    case when is_financial then null else total_current_assets - total_current_liabilities end as working_capital,
    case when is_financial then null else fcf_raw end                                          as free_cash_flow,
    case when is_financial then null else total_current_assets / nullif(total_current_liabilities, 0) end as current_ratio,
    case when is_financial then null else (total_current_assets - inventory) / nullif(total_current_liabilities, 0) end as quick_ratio,
    case when is_financial then null else coalesce(cash_and_short_term_investments, cash_and_cash_equivalents) / nullif(total_current_liabilities, 0) end as cash_ratio,
    case when is_financial then null else operating_cashflow / nullif(total_current_liabilities, 0) end as operating_cash_ratio,
    case when is_financial then null else cogs / nullif(avg_inventory, 0) end                  as inventory_turnover,
    case when is_financial then null else total_revenue / nullif(avg_receivables, 0) end       as receivables_turnover,
    case when is_financial then null else cogs / nullif(avg_payables, 0) end                   as payables_turnover,
    case when is_financial then null else 365.0 * avg_inventory / nullif(cogs, 0) end          as days_inventory_outstanding,
    case when is_financial then null else 365.0 * avg_receivables / nullif(total_revenue, 0) end as days_sales_outstanding,
    case when is_financial then null else 365.0 * avg_payables / nullif(cogs, 0) end           as days_payables_outstanding,
    case when is_financial then null else
          365.0 * avg_inventory   / nullif(cogs, 0)
        + 365.0 * avg_receivables / nullif(total_revenue, 0)
        - 365.0 * avg_payables    / nullif(cogs, 0) end                                        as cash_conversion_cycle,

    -- ── profitability (defined for both profiles) ────────────────────────
    case when is_financial then null else gross_profit / nullif(total_revenue, 0) end as gross_margin,
    operating_income / nullif(total_revenue, 0)                     as operating_margin,
    case when is_financial then null else ebitda / nullif(total_revenue, 0) end as ebitda_margin,
    net_income       / nullif(total_revenue, 0)                     as net_margin,
    case when is_financial then null else fcf_raw / nullif(total_revenue, 0) end as fcf_margin,
    net_income / nullif(avg_assets, 0)                              as roa,
    net_income / nullif(avg_equity, 0)                              as roe,
    case when is_financial then null else
        (coalesce(ebit, operating_income) * (1 - tax_clamped)) / nullif(avg_invested_capital, 0)
    end                                                             as roic,
    total_revenue / nullif(avg_assets, 0)                           as asset_turnover,

    -- ── leverage (defined for both) ──────────────────────────────────────
    total_debt        / nullif(total_shareholder_equity, 0)         as debt_to_equity,
    total_debt        / nullif(total_assets, 0)                     as debt_to_assets,
    total_liabilities / nullif(total_assets, 0)                     as liabilities_to_assets,
    total_assets      / nullif(total_shareholder_equity, 0)         as equity_multiplier,

    -- ── coverage: interest is a COST OF REVENUE for a financial ──────────
    case when is_financial then null else total_debt / nullif(ebitda, 0) end as debt_to_ebitda,
    case when is_financial then null else
        (total_debt - coalesce(cash_and_short_term_investments, cash_and_cash_equivalents)) / nullif(ebitda, 0)
    end                                                             as net_debt_to_ebitda,
    case when is_financial then null else
        coalesce(ebit, operating_income) / nullif(abs(interest_expense), 0)
    end                                                             as interest_coverage,
    case when is_financial then null else operating_cashflow / nullif(total_debt, 0) end as cfo_to_debt,

    income_tax_expense / nullif(income_before_tax, 0)               as effective_tax_rate,

    -- ── cash-flow quality ────────────────────────────────────────────────
    case when is_financial then null else operating_cashflow / nullif(net_income, 0) end as cash_conversion,
    case when is_financial then null else (net_income - operating_cashflow) / nullif(avg_assets, 0) end as sloan_accrual_ratio,

    -- ── capital allocation ───────────────────────────────────────────────
    dividends_paid / nullif(net_income, 0)                          as dividend_payout_ratio,
    case when is_financial then null else dividends_paid / nullif(fcf_raw, 0) end as dividend_coverage_of_fcf,
    case when is_financial then null else (dividends_paid + buybacks) / nullif(fcf_raw, 0) end as total_payout_of_fcf,
    abs(capital_expenditures) / nullif(d_and_a, 0)                  as capex_to_depreciation,
    abs(capital_expenditures) / nullif(total_revenue, 0)            as capex_intensity,
    research_and_development  / nullif(total_revenue, 0)            as rnd_intensity,

    -- ── sustainable growth ───────────────────────────────────────────────
    (1 - dividends_paid / nullif(net_income, 0))                    as retention_ratio,
    (net_income / nullif(avg_equity, 0)) * (1 - dividends_paid / nullif(net_income, 0)) as sustainable_growth_rate,

    -- ── FCFF / FCFE ──────────────────────────────────────────────────────
    case when is_financial then null else
        operating_cashflow + abs(interest_expense) * (1 - tax_clamped) - abs(capital_expenditures)
    end                                                             as fcff,
    case when is_financial then null else
        fcf_raw + (total_debt - pr_total_debt)
    end                                                             as fcfe,
    case when is_financial then null else (total_debt - pr_total_debt) end as net_borrowing,

    -- ── period-over-period (prior period of the SAME periodicity) ────────
    total_revenue      / nullif(pr_revenue, 0)          - 1         as revenue_growth,
    net_income         / nullif(pr_net_income, 0)       - 1         as net_income_growth,
    gross_profit       / nullif(pr_gross_profit, 0)     - 1         as gross_profit_growth,
    operating_income   / nullif(pr_operating_income, 0) - 1         as operating_income_growth,
    operating_cashflow / nullif(pr_cfo, 0)              - 1         as operating_cashflow_growth,
    total_assets       / nullif(pr_total_assets, 0)     - 1         as total_assets_growth,
    common_stock_shares_outstanding / nullif(pr_shares, 0) - 1      as share_count_growth,

    pr_revenue, pr_net_income, pr_total_assets, pr_total_equity,
    pr_cfo, pr_shares, pr_total_debt, pr_gross_profit, pr_cogs
from calc;
comment on view public.vw_company_fundamentals is
'EQ-2. CFA-framework ratios, FCFF/FCFE and period-over-period growth derived from the three
persisted statements. One source of this arithmetic -- no surface recomputes a ratio.

Every quotient uses nullif() on its denominator, so an absent or zero input yields NULL and
never a fabricated zero. NULL means not reported, and that is taken literally: dividends_paid
is NULL when the vendor reported no dividend line, NOT zero. Alpha Vantage encodes a
non-paying year as an explicit 0 in some periods and as NULL in others (GOOGL 2013-2023), and
reports non-zero amounts for a company that paid no common dividend (AMD 2019-2021), so
absence cannot carry a claim about what the company paid. The cost is that a genuine
non-payer has no retention ratio and no sustainable growth rate; a reliable dividend source
is its own unit. dividend_line_reported says what the VENDOR did, never what the company did.

statement_profile gates the ratios that are UNDEFINED for a financial rather than merely
unusual there: no operating cycle, interest expense as a cost of revenue rather than a
leverage signal, CFO not a free-cash-flow base, and no meaningful EBITDA or gross profit.
165 of the 913-symbol universe are Financials. asset_turnover, operating_margin, net_margin,
ROA, ROE, leverage, effective tax and payout ARE published for them -- low asset turnover is
a fact about a bank, not an undefined quantity -- and the peer view groups by profile so
banks are compared with banks. This gate is the honest interim; a financial needs its own
framework, which is a unit of its own.

The discriminator is assets.sector, a classification the database already owns, never a
threshold calibrated on a handful of symbols.

Turnover and days ratios use AVERAGE balances, the CFA convention for matching a flow to a
stock, which is why the oldest period of every symbol carries NULL for them.

Growth columns compare the prior period OF THE SAME PERIODICITY, which is why they are named
_growth and not _yoy. The effective tax rate is clamped to [0,1] inside FCFF and ROIC only:
a loss year produces a rate outside that range and a tax shield outside it is not a
measurement.';

revoke all on public.vw_company_fundamentals from public;
grant select on public.vw_company_fundamentals to anon, authenticated, service_role;
