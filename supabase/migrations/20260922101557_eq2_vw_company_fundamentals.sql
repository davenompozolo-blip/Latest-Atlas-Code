create or replace view public.vw_company_fundamentals as
with base as (
    select
        i.symbol, i.fiscal_date_ending, i.period, i.source,
        coalesce(i.reported_currency, b.reported_currency, c.reported_currency) as reported_currency,
        extract(year from i.fiscal_date_ending)::int as fiscal_year,

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
        c.dividend_payout, c.dividend_payout_common_stock,
        c.cashflow_from_investment, c.cashflow_from_financing,
        c.depreciation_depletion_and_amortization,
        coalesce(c.proceeds_from_repurchase_of_equity,
                 c.payments_for_repurchase_of_common_stock,
                 c.payments_for_repurchase_of_equity) as buybacks_raw
    from public.company_income_statement i
    join public.company_balance_sheet b
      on b.symbol = i.symbol and b.fiscal_date_ending = i.fiscal_date_ending
     and b.period = i.period  and b.source = i.source
    join public.company_cash_flow c
      on c.symbol = i.symbol and c.fiscal_date_ending = i.fiscal_date_ending
     and c.period = i.period  and c.source = i.source
),
lagged as (
    select base.*,
        lag(total_revenue)              over w as pr_revenue,
        lag(net_income)                 over w as pr_net_income,
        lag(gross_profit)               over w as pr_gross_profit,
        lag(operating_income)           over w as pr_operating_income,
        lag(total_assets)               over w as pr_total_assets,
        lag(total_current_assets)       over w as pr_total_current_assets,
        lag(total_current_liabilities)  over w as pr_total_current_liabilities,
        lag(total_shareholder_equity)   over w as pr_total_equity,
        lag(total_debt)                 over w as pr_total_debt,
        lag(inventory)                  over w as pr_inventory,
        lag(current_net_receivables)    over w as pr_receivables,
        lag(current_accounts_payable)   over w as pr_payables,
        lag(cogs)                       over w as pr_cogs,
        lag(operating_cashflow)         over w as pr_cfo,
        lag(d_and_a)                    over w as pr_d_and_a,
        lag(property_plant_equipment)   over w as pr_ppe,
        lag(selling_general_and_administrative) over w as pr_sga,
        lag(common_stock_shares_outstanding)    over w as pr_shares,
        lag(cash_and_cash_equivalents)  over w as pr_cash,
        lag(fiscal_date_ending)         over w as pr_fiscal_date_ending
    from base
    window w as (partition by symbol, period, source order by fiscal_date_ending)
)
select
    symbol, fiscal_date_ending, fiscal_year, period, source, reported_currency,
    pr_fiscal_date_ending,

    total_revenue, gross_profit, operating_income, ebit, ebitda, net_income,
    total_assets, total_liabilities, total_shareholder_equity, total_debt,
    cash_and_cash_equivalents, operating_cashflow, capital_expenditures,
    common_stock_shares_outstanding,
    (total_current_assets - total_current_liabilities)              as working_capital,
    (total_debt - coalesce(cash_and_short_term_investments,
                           cash_and_cash_equivalents))              as net_debt,
    (operating_cashflow - abs(capital_expenditures))                as free_cash_flow,

    total_current_assets / nullif(total_current_liabilities, 0)     as current_ratio,
    (total_current_assets - inventory) / nullif(total_current_liabilities, 0) as quick_ratio,
    coalesce(cash_and_short_term_investments, cash_and_cash_equivalents)
        / nullif(total_current_liabilities, 0)                      as cash_ratio,
    operating_cashflow / nullif(total_current_liabilities, 0)       as operating_cash_ratio,

    gross_profit     / nullif(total_revenue, 0)                     as gross_margin,
    operating_income / nullif(total_revenue, 0)                     as operating_margin,
    ebitda           / nullif(total_revenue, 0)                     as ebitda_margin,
    net_income       / nullif(total_revenue, 0)                     as net_margin,
    (operating_cashflow - abs(capital_expenditures))
        / nullif(total_revenue, 0)                                  as fcf_margin,
    net_income / nullif((total_assets + pr_total_assets) / 2.0, 0)  as roa,
    net_income / nullif((total_shareholder_equity + pr_total_equity) / 2.0, 0) as roe,
    (coalesce(ebit, operating_income)
        * (1 - least(greatest(income_tax_expense / nullif(income_before_tax, 0), 0), 1)))
        / nullif(((total_debt + total_shareholder_equity)
                + (pr_total_debt + pr_total_equity)) / 2.0, 0)      as roic,

    total_revenue / nullif((total_assets + pr_total_assets) / 2.0, 0) as asset_turnover,
    cogs          / nullif((inventory + pr_inventory) / 2.0, 0)       as inventory_turnover,
    total_revenue / nullif((current_net_receivables + pr_receivables) / 2.0, 0) as receivables_turnover,
    cogs          / nullif((current_accounts_payable + pr_payables) / 2.0, 0)   as payables_turnover,
    365.0 * ((inventory + pr_inventory) / 2.0) / nullif(cogs, 0)      as days_inventory_outstanding,
    365.0 * ((current_net_receivables + pr_receivables) / 2.0)
        / nullif(total_revenue, 0)                                    as days_sales_outstanding,
    365.0 * ((current_accounts_payable + pr_payables) / 2.0)
        / nullif(cogs, 0)                                             as days_payables_outstanding,
    ( 365.0 * ((inventory + pr_inventory) / 2.0) / nullif(cogs, 0)
    + 365.0 * ((current_net_receivables + pr_receivables) / 2.0) / nullif(total_revenue, 0)
    - 365.0 * ((current_accounts_payable + pr_payables) / 2.0) / nullif(cogs, 0)
    )                                                                 as cash_conversion_cycle,

    total_debt        / nullif(total_shareholder_equity, 0)         as debt_to_equity,
    total_debt        / nullif(total_assets, 0)                     as debt_to_assets,
    total_liabilities / nullif(total_assets, 0)                     as liabilities_to_assets,
    total_assets      / nullif(total_shareholder_equity, 0)         as equity_multiplier,
    total_debt        / nullif(ebitda, 0)                           as debt_to_ebitda,
    (total_debt - coalesce(cash_and_short_term_investments, cash_and_cash_equivalents))
                      / nullif(ebitda, 0)                           as net_debt_to_ebitda,
    coalesce(ebit, operating_income) / nullif(abs(interest_expense), 0) as interest_coverage,
    operating_cashflow / nullif(total_debt, 0)                      as cfo_to_debt,

    income_tax_expense / nullif(income_before_tax, 0)               as effective_tax_rate,

    operating_cashflow / nullif(net_income, 0)                      as cash_conversion,
    (net_income - operating_cashflow)
        / nullif((total_assets + pr_total_assets) / 2.0, 0)         as sloan_accrual_ratio,

    abs(coalesce(dividend_payout_common_stock, dividend_payout))    as dividends_paid,
    abs(buybacks_raw)                                               as buybacks,
    stock_based_compensation,
    abs(coalesce(dividend_payout_common_stock, dividend_payout))
        / nullif(net_income, 0)                                     as dividend_payout_ratio,
    abs(coalesce(dividend_payout_common_stock, dividend_payout))
        / nullif(operating_cashflow - abs(capital_expenditures), 0) as dividend_coverage_of_fcf,
    (abs(coalesce(dividend_payout_common_stock, dividend_payout)) + abs(buybacks_raw))
        / nullif(operating_cashflow - abs(capital_expenditures), 0) as total_payout_of_fcf,
    abs(capital_expenditures) / nullif(d_and_a, 0)                  as capex_to_depreciation,
    abs(capital_expenditures) / nullif(total_revenue, 0)            as capex_intensity,
    research_and_development / nullif(total_revenue, 0)             as rnd_intensity,

    (1 - (abs(coalesce(dividend_payout_common_stock, dividend_payout))
          / nullif(net_income, 0)))                                 as retention_ratio,
    (net_income / nullif((total_shareholder_equity + pr_total_equity) / 2.0, 0))
      * (1 - (abs(coalesce(dividend_payout_common_stock, dividend_payout))
              / nullif(net_income, 0)))                             as sustainable_growth_rate,

    (operating_cashflow
        + abs(interest_expense)
          * (1 - least(greatest(income_tax_expense / nullif(income_before_tax, 0), 0), 1))
        - abs(capital_expenditures))                                as fcff,
    (operating_cashflow
        - abs(capital_expenditures)
        + (total_debt - pr_total_debt))                             as fcfe,
    (total_debt - pr_total_debt)                                    as net_borrowing,

    total_revenue    / nullif(pr_revenue, 0)          - 1           as revenue_growth,
    net_income       / nullif(pr_net_income, 0)       - 1           as net_income_growth,
    gross_profit     / nullif(pr_gross_profit, 0)     - 1           as gross_profit_growth,
    operating_income / nullif(pr_operating_income, 0) - 1           as operating_income_growth,
    operating_cashflow / nullif(pr_cfo, 0)            - 1           as operating_cashflow_growth,
    total_assets     / nullif(pr_total_assets, 0)     - 1           as total_assets_growth,
    common_stock_shares_outstanding / nullif(pr_shares, 0) - 1      as share_count_growth,

    pr_revenue, pr_net_income, pr_total_assets, pr_total_equity,
    pr_cfo, pr_shares, pr_total_debt
from lagged;

comment on view public.vw_company_fundamentals is
'EQ-2. CFA-framework ratios, FCFF/FCFE and period-over-period growth derived from the
three persisted statements. One source of this arithmetic: no surface recomputes a
ratio. Every quotient uses nullif() on its denominator, so an absent or zero input
yields NULL and never a fabricated zero -- NULL means not reported. Growth columns
compare the prior period OF THE SAME PERIODICITY (prior year for annual, prior quarter
for quarterly), which is why they are named _growth and not _yoy. Effective tax rate is
clamped to [0,1] inside FCFF and ROIC only: a loss year produces a rate outside that
range and a tax shield outside it is not a measurement.';

revoke all on public.vw_company_fundamentals from public;
grant select on public.vw_company_fundamentals to anon, authenticated, service_role;
