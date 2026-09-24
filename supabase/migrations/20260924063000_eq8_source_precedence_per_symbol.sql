create or replace view public.vw_company_fundamentals as
 WITH sect AS (
         SELECT DISTINCT ON (assets.symbol) assets.symbol,
            assets.sector
           FROM assets
          WHERE assets.symbol IS NOT NULL
          ORDER BY assets.symbol, assets.updated_at DESC NULLS LAST
        ), base AS (
         SELECT i.symbol,
            i.fiscal_date_ending,
            i.period,
            i.source,
            COALESCE(i.reported_currency, b.reported_currency, c.reported_currency) AS reported_currency,
            EXTRACT(year FROM i.fiscal_date_ending)::integer AS fiscal_year,
            s.sector,
            s.sector ~~* '%financ%'::text AS is_financial,
            i.total_revenue,
            i.gross_profit,
            i.operating_income,
            i.ebit,
            i.ebitda,
            i.net_income,
            i.income_before_tax,
            i.income_tax_expense,
            i.interest_expense,
            i.selling_general_and_administrative,
            i.research_and_development,
            COALESCE(i.cost_of_revenue, i.cost_of_goods_and_services_sold) AS cogs,
            COALESCE(i.depreciation_and_amortization, i.depreciation) AS d_and_a,
            b.total_assets,
            b.total_current_assets,
            b.total_current_liabilities,
            b.total_liabilities,
            b.total_shareholder_equity,
            b.inventory,
            b.current_net_receivables,
            b.current_accounts_payable,
            b.retained_earnings,
            b.cash_and_cash_equivalents,
            b.cash_and_short_term_investments,
            b.property_plant_equipment,
            b.goodwill,
            b.intangible_assets,
            b.common_stock_shares_outstanding,
            COALESCE(b.short_long_term_debt_total, COALESCE(b.current_debt, b.short_term_debt, 0::numeric) + COALESCE(b.long_term_debt, b.long_term_debt_noncurrent, 0::numeric)) AS total_debt,
            c.operating_cashflow,
            c.capital_expenditures,
            c.stock_based_compensation,
            c.cashflow_from_investment,
            c.cashflow_from_financing,
            COALESCE(c.dividend_payout_common_stock, c.dividend_payout) IS NOT NULL AS dividend_line_reported,
            abs(COALESCE(c.dividend_payout_common_stock, c.dividend_payout)) AS dividends_paid,
            abs(COALESCE(c.proceeds_from_repurchase_of_equity, c.payments_for_repurchase_of_common_stock, c.payments_for_repurchase_of_equity)) AS buybacks
           FROM company_income_statement i
             JOIN company_balance_sheet b ON b.symbol = i.symbol AND b.fiscal_date_ending = i.fiscal_date_ending AND b.period = i.period AND b.source = i.source
             JOIN company_cash_flow c ON c.symbol = i.symbol AND c.fiscal_date_ending = i.fiscal_date_ending AND c.period = i.period AND c.source = i.source
             LEFT JOIN sect s ON s.symbol = i.symbol
          WHERE i.source = (
                  -- ONE SOURCE PER SYMBOL, NOT PER PERIOD.
                  --
                  -- The PK carries `source`, so a symbol loaded from two
                  -- providers yields two rows per fiscal year and a surface
                  -- reading "the latest row" gets whichever the planner returns.
                  -- Measured 2026-09-24: 129 duplicated (symbol, fiscal_year)
                  -- rows across 8 symbols the moment EDGAR landed beside Alpha
                  -- Vantage.
                  --
                  -- A FIRST ATTEMPT KEYED THIS ON fiscal_date_ending AND CLEARED
                  -- ONLY 79 OF THEM, because ALPHA VANTAGE ROUNDS A 52/53-WEEK
                  -- FILER'S PERIOD END TO THE CALENDAR MONTH END. ADBE is always
                  -- 11-30 in Alpha Vantage against EDGAR's actual 2025-11-28 /
                  -- 2024-11-29 / 2023-12-01; AMD always 12-31 against 12-27 /
                  -- 12-28 / 12-30; TGT always 01-31 against 2025-02-01 /
                  -- 2024-02-03. The two sources date the SAME fiscal year one to
                  -- four days apart, so no date-keyed rule can pair them.
                  --
                  -- Choosing per symbol also keeps a series on ONE BASIS. Half a
                  -- history from each provider is the substitution this codebase
                  -- forbids everywhere else, and it would be invisible on screen.
                  --
                  -- The DEEPEST complete history wins, EDGAR breaking a tie:
                  -- EDGAR is the filing rather than a vendor's normalisation of
                  -- it and resolves restatements explicitly, but it is not deeper
                  -- for every filer (GOOGL: 14 periods against Alpha Vantage's
                  -- 20), and dropping six years to honour a provenance preference
                  -- would be paying real coverage for a tie-break. Completeness
                  -- is counted over the THREE-WAY JOIN, never over the income
                  -- statement alone -- EQ-2 found SNDK with an income statement
                  -- and no balance sheet, and a source that cannot complete a
                  -- period must not win one.
                  --
                  -- Where the two overlap they agree: GOOGL, TGT and SNDK are
                  -- bit-identical on every common year, ADBE differs by rounding.
                  -- They disagree materially on JPM (38.7% of revenue) and PFE
                  -- (88.9% of net income) -- a bank's net-versus-gross revenue
                  -- convention and restatement handling. Picking one source is
                  -- what stops those two answers reaching one page; which of them
                  -- is right is its own question.
                  SELECT p.source
                    FROM company_income_statement p
                    JOIN company_balance_sheet pb
                      ON pb.symbol = p.symbol AND pb.fiscal_date_ending = p.fiscal_date_ending
                     AND pb.period = p.period AND pb.source = p.source
                    JOIN company_cash_flow pc
                      ON pc.symbol = p.symbol AND pc.fiscal_date_ending = p.fiscal_date_ending
                     AND pc.period = p.period AND pc.source = p.source
                   WHERE p.symbol = i.symbol
                     AND p.period = i.period
                   GROUP BY p.source
                   ORDER BY count(*) DESC,
                            CASE p.source
                              WHEN 'edgar'        THEN 0
                              WHEN 'alphavantage' THEN 1
                              WHEN 'finnhub'      THEN 2
                              ELSE 3
                            END,
                            p.source
                   LIMIT 1)
        ), lagged AS (
         SELECT base.symbol,
            base.fiscal_date_ending,
            base.period,
            base.source,
            base.reported_currency,
            base.fiscal_year,
            base.sector,
            base.is_financial,
            base.total_revenue,
            base.gross_profit,
            base.operating_income,
            base.ebit,
            base.ebitda,
            base.net_income,
            base.income_before_tax,
            base.income_tax_expense,
            base.interest_expense,
            base.selling_general_and_administrative,
            base.research_and_development,
            base.cogs,
            base.d_and_a,
            base.total_assets,
            base.total_current_assets,
            base.total_current_liabilities,
            base.total_liabilities,
            base.total_shareholder_equity,
            base.inventory,
            base.current_net_receivables,
            base.current_accounts_payable,
            base.retained_earnings,
            base.cash_and_cash_equivalents,
            base.cash_and_short_term_investments,
            base.property_plant_equipment,
            base.goodwill,
            base.intangible_assets,
            base.common_stock_shares_outstanding,
            base.total_debt,
            base.operating_cashflow,
            base.capital_expenditures,
            base.stock_based_compensation,
            base.cashflow_from_investment,
            base.cashflow_from_financing,
            base.dividend_line_reported,
            base.dividends_paid,
            base.buybacks,
            lag(base.total_revenue) OVER w AS pr_revenue,
            lag(base.net_income) OVER w AS pr_net_income,
            lag(base.gross_profit) OVER w AS pr_gross_profit,
            lag(base.operating_income) OVER w AS pr_operating_income,
            lag(base.total_assets) OVER w AS pr_total_assets,
            lag(base.total_current_assets) OVER w AS pr_total_current_assets,
            lag(base.total_current_liabilities) OVER w AS pr_total_current_liabilities,
            lag(base.total_shareholder_equity) OVER w AS pr_total_equity,
            lag(base.total_debt) OVER w AS pr_total_debt,
            lag(base.inventory) OVER w AS pr_inventory,
            lag(base.current_net_receivables) OVER w AS pr_receivables,
            lag(base.current_accounts_payable) OVER w AS pr_payables,
            lag(base.cogs) OVER w AS pr_cogs,
            lag(base.operating_cashflow) OVER w AS pr_cfo,
            lag(base.d_and_a) OVER w AS pr_d_and_a,
            lag(base.property_plant_equipment) OVER w AS pr_ppe,
            lag(base.selling_general_and_administrative) OVER w AS pr_sga,
            lag(base.common_stock_shares_outstanding) OVER w AS pr_shares,
            lag(base.cash_and_cash_equivalents) OVER w AS pr_cash,
            lag(base.fiscal_date_ending) OVER w AS pr_fiscal_date_ending
           FROM base
          WINDOW w AS (PARTITION BY base.symbol, base.period, base.source ORDER BY base.fiscal_date_ending)
        ), calc AS (
         SELECT lagged.symbol,
            lagged.fiscal_date_ending,
            lagged.period,
            lagged.source,
            lagged.reported_currency,
            lagged.fiscal_year,
            lagged.sector,
            lagged.is_financial,
            lagged.total_revenue,
            lagged.gross_profit,
            lagged.operating_income,
            lagged.ebit,
            lagged.ebitda,
            lagged.net_income,
            lagged.income_before_tax,
            lagged.income_tax_expense,
            lagged.interest_expense,
            lagged.selling_general_and_administrative,
            lagged.research_and_development,
            lagged.cogs,
            lagged.d_and_a,
            lagged.total_assets,
            lagged.total_current_assets,
            lagged.total_current_liabilities,
            lagged.total_liabilities,
            lagged.total_shareholder_equity,
            lagged.inventory,
            lagged.current_net_receivables,
            lagged.current_accounts_payable,
            lagged.retained_earnings,
            lagged.cash_and_cash_equivalents,
            lagged.cash_and_short_term_investments,
            lagged.property_plant_equipment,
            lagged.goodwill,
            lagged.intangible_assets,
            lagged.common_stock_shares_outstanding,
            lagged.total_debt,
            lagged.operating_cashflow,
            lagged.capital_expenditures,
            lagged.stock_based_compensation,
            lagged.cashflow_from_investment,
            lagged.cashflow_from_financing,
            lagged.dividend_line_reported,
            lagged.dividends_paid,
            lagged.buybacks,
            lagged.pr_revenue,
            lagged.pr_net_income,
            lagged.pr_gross_profit,
            lagged.pr_operating_income,
            lagged.pr_total_assets,
            lagged.pr_total_current_assets,
            lagged.pr_total_current_liabilities,
            lagged.pr_total_equity,
            lagged.pr_total_debt,
            lagged.pr_inventory,
            lagged.pr_receivables,
            lagged.pr_payables,
            lagged.pr_cogs,
            lagged.pr_cfo,
            lagged.pr_d_and_a,
            lagged.pr_ppe,
            lagged.pr_sga,
            lagged.pr_shares,
            lagged.pr_cash,
            lagged.pr_fiscal_date_ending,
            LEAST(GREATEST(lagged.income_tax_expense / NULLIF(lagged.income_before_tax, 0::numeric), 0::numeric), 1::numeric) AS tax_clamped,
            (lagged.total_assets + lagged.pr_total_assets) / 2.0 AS avg_assets,
            (lagged.total_shareholder_equity + lagged.pr_total_equity) / 2.0 AS avg_equity,
            (lagged.inventory + lagged.pr_inventory) / 2.0 AS avg_inventory,
            (lagged.current_net_receivables + lagged.pr_receivables) / 2.0 AS avg_receivables,
            (lagged.current_accounts_payable + lagged.pr_payables) / 2.0 AS avg_payables,
            (lagged.total_debt + lagged.total_shareholder_equity + (lagged.pr_total_debt + lagged.pr_total_equity)) / 2.0 AS avg_invested_capital,
            lagged.operating_cashflow - abs(lagged.capital_expenditures) AS fcf_raw
           FROM lagged
        )
 SELECT symbol,
    fiscal_date_ending,
    fiscal_year,
    period,
    source,
    reported_currency,
    pr_fiscal_date_ending,
    sector,
        CASE
            WHEN sector IS NULL THEN 'unknown'::text
            WHEN is_financial THEN 'financial'::text
            ELSE 'operating'::text
        END AS statement_profile,
    dividend_line_reported,
    total_revenue,
    gross_profit,
    operating_income,
    ebit,
    ebitda,
    net_income,
    income_before_tax,
    income_tax_expense,
    interest_expense,
    cogs,
    d_and_a,
    research_and_development,
    total_assets,
    total_liabilities,
    total_shareholder_equity,
    total_debt,
    total_current_assets,
    total_current_liabilities,
    inventory,
    cash_and_cash_equivalents,
    retained_earnings,
    operating_cashflow,
    capital_expenditures,
    stock_based_compensation,
    common_stock_shares_outstanding,
    dividends_paid,
    buybacks,
    total_debt - COALESCE(cash_and_short_term_investments, cash_and_cash_equivalents) AS net_debt,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE total_current_assets - total_current_liabilities
        END AS working_capital,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE fcf_raw
        END AS free_cash_flow,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE total_current_assets / NULLIF(total_current_liabilities, 0::numeric)
        END AS current_ratio,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE (total_current_assets - inventory) / NULLIF(total_current_liabilities, 0::numeric)
        END AS quick_ratio,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE COALESCE(cash_and_short_term_investments, cash_and_cash_equivalents) / NULLIF(total_current_liabilities, 0::numeric)
        END AS cash_ratio,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE operating_cashflow / NULLIF(total_current_liabilities, 0::numeric)
        END AS operating_cash_ratio,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE cogs / NULLIF(avg_inventory, 0::numeric)
        END AS inventory_turnover,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE total_revenue / NULLIF(avg_receivables, 0::numeric)
        END AS receivables_turnover,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE cogs / NULLIF(avg_payables, 0::numeric)
        END AS payables_turnover,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE 365.0 * avg_inventory / NULLIF(cogs, 0::numeric)
        END AS days_inventory_outstanding,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE 365.0 * avg_receivables / NULLIF(total_revenue, 0::numeric)
        END AS days_sales_outstanding,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE 365.0 * avg_payables / NULLIF(cogs, 0::numeric)
        END AS days_payables_outstanding,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE 365.0 * avg_inventory / NULLIF(cogs, 0::numeric) + 365.0 * avg_receivables / NULLIF(total_revenue, 0::numeric) - 365.0 * avg_payables / NULLIF(cogs, 0::numeric)
        END AS cash_conversion_cycle,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE gross_profit / NULLIF(total_revenue, 0::numeric)
        END AS gross_margin,
    operating_income / NULLIF(total_revenue, 0::numeric) AS operating_margin,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE ebitda / NULLIF(total_revenue, 0::numeric)
        END AS ebitda_margin,
    net_income / NULLIF(total_revenue, 0::numeric) AS net_margin,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE fcf_raw / NULLIF(total_revenue, 0::numeric)
        END AS fcf_margin,
    net_income / NULLIF(avg_assets, 0::numeric) AS roa,
    net_income / NULLIF(avg_equity, 0::numeric) AS roe,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE COALESCE(ebit, operating_income) * (1::numeric - tax_clamped) / NULLIF(avg_invested_capital, 0::numeric)
        END AS roic,
    total_revenue / NULLIF(avg_assets, 0::numeric) AS asset_turnover,
    total_debt / NULLIF(total_shareholder_equity, 0::numeric) AS debt_to_equity,
    total_debt / NULLIF(total_assets, 0::numeric) AS debt_to_assets,
    total_liabilities / NULLIF(total_assets, 0::numeric) AS liabilities_to_assets,
    total_assets / NULLIF(total_shareholder_equity, 0::numeric) AS equity_multiplier,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE total_debt / NULLIF(ebitda, 0::numeric)
        END AS debt_to_ebitda,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE (total_debt - COALESCE(cash_and_short_term_investments, cash_and_cash_equivalents)) / NULLIF(ebitda, 0::numeric)
        END AS net_debt_to_ebitda,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE COALESCE(ebit, operating_income) / NULLIF(abs(interest_expense), 0::numeric)
        END AS interest_coverage,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE operating_cashflow / NULLIF(total_debt, 0::numeric)
        END AS cfo_to_debt,
    income_tax_expense / NULLIF(income_before_tax, 0::numeric) AS effective_tax_rate,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE operating_cashflow / NULLIF(net_income, 0::numeric)
        END AS cash_conversion,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE (net_income - operating_cashflow) / NULLIF(avg_assets, 0::numeric)
        END AS sloan_accrual_ratio,
    dividends_paid / NULLIF(net_income, 0::numeric) AS dividend_payout_ratio,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE dividends_paid / NULLIF(fcf_raw, 0::numeric)
        END AS dividend_coverage_of_fcf,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE (dividends_paid + buybacks) / NULLIF(fcf_raw, 0::numeric)
        END AS total_payout_of_fcf,
    abs(capital_expenditures) / NULLIF(d_and_a, 0::numeric) AS capex_to_depreciation,
    abs(capital_expenditures) / NULLIF(total_revenue, 0::numeric) AS capex_intensity,
    research_and_development / NULLIF(total_revenue, 0::numeric) AS rnd_intensity,
    1::numeric - dividends_paid / NULLIF(net_income, 0::numeric) AS retention_ratio,
    net_income / NULLIF(avg_equity, 0::numeric) * (1::numeric - dividends_paid / NULLIF(net_income, 0::numeric)) AS sustainable_growth_rate,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE operating_cashflow + abs(interest_expense) * (1::numeric - tax_clamped) - abs(capital_expenditures)
        END AS fcff,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE fcf_raw + (total_debt - pr_total_debt)
        END AS fcfe,
        CASE
            WHEN is_financial THEN NULL::numeric
            ELSE total_debt - pr_total_debt
        END AS net_borrowing,
    total_revenue / NULLIF(pr_revenue, 0::numeric) - 1::numeric AS revenue_growth,
    net_income / NULLIF(pr_net_income, 0::numeric) - 1::numeric AS net_income_growth,
    gross_profit / NULLIF(pr_gross_profit, 0::numeric) - 1::numeric AS gross_profit_growth,
    operating_income / NULLIF(pr_operating_income, 0::numeric) - 1::numeric AS operating_income_growth,
    operating_cashflow / NULLIF(pr_cfo, 0::numeric) - 1::numeric AS operating_cashflow_growth,
    total_assets / NULLIF(pr_total_assets, 0::numeric) - 1::numeric AS total_assets_growth,
    common_stock_shares_outstanding / NULLIF(pr_shares, 0::numeric) - 1::numeric AS share_count_growth,
    pr_revenue,
    pr_net_income,
    pr_total_assets,
    pr_total_equity,
    pr_cfo,
    pr_shares,
    pr_total_debt,
    pr_gross_profit,
    pr_cogs
   FROM calc;
