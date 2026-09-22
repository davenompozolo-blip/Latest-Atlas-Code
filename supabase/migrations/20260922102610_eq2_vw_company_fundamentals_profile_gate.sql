-- EQ-2. Derived fundamentals: statement_profile gate + dividend zero-inference.
--
-- Both changes came from reading the view's output, not its source.
--
-- statement_profile: a financial published FCFF -70,850m, interest coverage
-- 0.74 and a current ratio of 14.85 (JPM FY2025). Each is arithmetically
-- correct and economically meaningless -- a bank has no operating cycle, its
-- interest expense is a cost of revenue rather than a leverage signal, and CFO
-- is not a free-cash-flow base. 165 of the 913-symbol universe are Financials,
-- so this was wrong for 18% of the intended coverage.
--
-- The discriminator is assets.sector (100% populated across those 913), a
-- classification the database already owns. An interest-to-revenue threshold
-- was rejected: JPM separates cleanly at 35.0% against <=4.3% for every other
-- loaded name, but calibrating a threshold on six symbols is exactly what this
-- codebase has been burned by before.
--
-- dividend zero-inference: AMD pays no dividend, Alpha Vantage omits the line,
-- so dividends_paid was NULL -> retention_ratio NULL -> sustainable_growth_rate
-- NULL. A non-payer is precisely the case where SGR is wanted. A parsed
-- cash-flow row carrying no dividend line is a measurement of zero, not an
-- absence, and dividend_line_reported publishes the inference so it stays
-- auditable. Gated on operating_cashflow so an UNPARSED statement stays NULL.
--
-- Verified after applying: AMD retention 1.000 and SGR 7.19% = its ROE;
-- JPM keeps ROE 16.13% and D/E 1.38 while the undefined ratios read NULL;
-- GOOGL's cash conversion cycle is NULL from genuinely absent inventory rather
-- than from the gate; TGT is unchanged (SGR 10.72%, FCFF 3,181m).
drop view if exists public.vw_company_fundamentals;

create view public.vw_company_fundamentals as
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
        -- A cash-flow row that parsed but carries no dividend line means the
        -- company paid none -- that is a measurement of zero, not an absence.
        -- Gated on operating_cashflow so an unparsed statement stays NULL.
        (coalesce(c.dividend_payout_common_stock, c.dividend_payout) is not null) as dividend_line_reported,
        case when c.operating_cashflow is not null
             then abs(coalesce(c.dividend_payout_common_stock, c.dividend_payout, 0))
        end as dividends_paid,
        case when c.operating_cashflow is not null
             then abs(coalesce(c.proceeds_from_repurchase_of_equity,
                               c.payments_for_repurchase_of_common_stock,
                               c.payments_for_repurchase_of_equity, 0))
        end as buybacks
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
    gross_profit     / nullif(total_revenue, 0)                     as gross_margin,
    operating_income / nullif(total_revenue, 0)                     as operating_margin,
    ebitda           / nullif(total_revenue, 0)                     as ebitda_margin,
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
    operating_cashflow / nullif(net_income, 0)                      as cash_conversion,
    (net_income - operating_cashflow) / nullif(avg_assets, 0)       as sloan_accrual_ratio,

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
never a fabricated zero. NULL means not reported.

statement_profile gates the ratios that are UNDEFINED for a financial rather than merely
unusual there: a bank has no operating cycle, its interest expense is a cost of revenue and
not a leverage signal, and CFO is not a free-cash-flow base. 165 of the 913-symbol universe
are Financials, so publishing those figures would have been wrong for 18 percent of it.
The discriminator is assets.sector, a classification the database already owns, never a
threshold calibrated on a handful of symbols.

Turnover and days ratios use AVERAGE balances, the CFA convention for matching a flow to a
stock, which is why the oldest period of every symbol carries NULL for them.

dividends_paid infers ZERO when the cash-flow row parsed and carried no dividend line, which
is a measurement (the company paid none) rather than an absence; dividend_line_reported
publishes that inference so it is auditable. Without it a non-payer had a NULL retention
ratio and therefore no sustainable growth rate at all -- the names where SGR matters most.

Growth columns compare the prior period OF THE SAME PERIODICITY, which is why they are named
_growth and not _yoy. The effective tax rate is clamped to [0,1] inside FCFF and ROIC only:
a loss year produces a rate outside that range and a tax shield outside it is not a
measurement.';

revoke all on public.vw_company_fundamentals from public;
grant select on public.vw_company_fundamentals to anon, authenticated, service_role;
