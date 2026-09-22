-- percentile_cont() has no numeric overload: it coerces to double precision and
-- returns double precision. So peer_median, peer_p25, peer_p75 and the derived
-- vs_peer_median were published as float8 while `value` beside them was exact
-- numeric.
--
-- Not cosmetic. float8 carries NaN and Infinity, and float NaN does NOT equal
-- itself while numeric NaN does -- the exact asymmetry that let a sentinel walk
-- through fifteen CHECKs in the VaR-backtest work. Introducing float8 here would
-- reopen that class in a layer whose inputs are all exact.
--
-- The interpolation still happens in float8 (Postgres's own behaviour, harmless
-- at these magnitudes); the result is cast back, so every published figure is
-- numeric and vs_peer_median is an exact difference of two exact numbers.
-- percentile_disc was considered and rejected: it returns an observed value
-- rather than a median, which is a different statistic.
--
-- DROP first: a view column's type cannot be changed by CREATE OR REPLACE.
drop view if exists public.vw_company_fundamental_peers;

create view public.vw_company_fundamental_peers as
with f as (
    select
        symbol, period, fiscal_date_ending, fiscal_year, sector, statement_profile,
        public.atlas_fiscal_aligned_year(fiscal_date_ending) as aligned_year,
        gross_margin, operating_margin, ebitda_margin, net_margin, fcf_margin,
        roa, roe, roic, asset_turnover,
        current_ratio, quick_ratio, cash_ratio,
        debt_to_equity, debt_to_assets, equity_multiplier,
        net_debt_to_ebitda, interest_coverage, cfo_to_debt,
        effective_tax_rate, cash_conversion, sloan_accrual_ratio,
        dividend_payout_ratio, capex_intensity, rnd_intensity,
        days_inventory_outstanding, days_sales_outstanding,
        days_payables_outstanding, cash_conversion_cycle,
        revenue_growth, net_income_growth, sustainable_growth_rate
    from public.vw_company_fundamentals
),
long as (
    select f.symbol, f.period, f.fiscal_date_ending, f.fiscal_year, f.aligned_year,
           f.sector, f.statement_profile, m.metric, m.value
    from f
    cross join lateral (values
        ('gross_margin',                f.gross_margin),
        ('operating_margin',            f.operating_margin),
        ('ebitda_margin',               f.ebitda_margin),
        ('net_margin',                  f.net_margin),
        ('fcf_margin',                  f.fcf_margin),
        ('roa',                         f.roa),
        ('roe',                         f.roe),
        ('roic',                        f.roic),
        ('asset_turnover',              f.asset_turnover),
        ('current_ratio',               f.current_ratio),
        ('quick_ratio',                 f.quick_ratio),
        ('cash_ratio',                  f.cash_ratio),
        ('debt_to_equity',              f.debt_to_equity),
        ('debt_to_assets',              f.debt_to_assets),
        ('equity_multiplier',           f.equity_multiplier),
        ('net_debt_to_ebitda',          f.net_debt_to_ebitda),
        ('interest_coverage',           f.interest_coverage),
        ('cfo_to_debt',                 f.cfo_to_debt),
        ('effective_tax_rate',          f.effective_tax_rate),
        ('cash_conversion',             f.cash_conversion),
        ('sloan_accrual_ratio',         f.sloan_accrual_ratio),
        ('dividend_payout_ratio',       f.dividend_payout_ratio),
        ('capex_intensity',             f.capex_intensity),
        ('rnd_intensity',               f.rnd_intensity),
        ('days_inventory_outstanding',  f.days_inventory_outstanding),
        ('days_sales_outstanding',      f.days_sales_outstanding),
        ('days_payables_outstanding',   f.days_payables_outstanding),
        ('cash_conversion_cycle',       f.cash_conversion_cycle),
        ('revenue_growth',              f.revenue_growth),
        ('net_income_growth',           f.net_income_growth),
        ('sustainable_growth_rate',     f.sustainable_growth_rate)
    ) as m(metric, value)
)
select
    l.symbol, l.period, l.fiscal_date_ending, l.fiscal_year, l.aligned_year,
    l.sector, l.statement_profile, l.metric, l.value,
    'sector:' || coalesce(l.sector, 'unknown') as peer_group,
    p.peer_median, p.peer_p25, p.peer_p75, p.peer_min, p.peer_max,
    p.peer_count, p.peer_symbols,
    -- Rank against peers only, and only when the company's own figure exists.
    -- A percentile for a company with no measurement is not a low percentile.
    case when l.value is not null and p.peer_count > 0
         then p.n_below::numeric / p.peer_count::numeric
    end as peer_percentile,
    case when l.value is not null and p.peer_median is not null
         then l.value - p.peer_median
    end as vs_peer_median
from long l
left join lateral (
    select
        (percentile_cont(0.5)  within group (order by o.value))::numeric as peer_median,
        (percentile_cont(0.25) within group (order by o.value))::numeric as peer_p25,
        (percentile_cont(0.75) within group (order by o.value))::numeric as peer_p75,
        min(o.value) as peer_min,
        max(o.value) as peer_max,
        -- MEASURED peers, never group size: a peer whose own figure is NULL
        -- is not evidence about where this company sits.
        count(*) as peer_count,
        array_agg(o.symbol order by o.symbol) as peer_symbols,
        count(*) filter (where o.value < l.value) as n_below
    from long o
    where o.metric            = l.metric
      and o.period            = l.period
      and o.aligned_year      = l.aligned_year
      and o.statement_profile = l.statement_profile
      and o.sector is not distinct from l.sector
      and o.symbol           <> l.symbol
      and o.value is not null
) p on true;

comment on view public.vw_company_fundamental_peers is
'EQ-2. Peer medians computed ONLY from statements actually loaded -- there is no
default, no vendor composite and no fallback, so a thin peer set reports itself as
thin rather than inventing a benchmark.

peer_count counts peers with a MEASURED value for that metric, never the size of the
sector cohort: a peer whose own figure is NULL is not evidence about where this
company sits. A surface must state that count beside any comparison, and render no
comparison at peer_count = 0.

The company is EXCLUDED from its own peer group. A median that contains the subject
is not a benchmark, and with a small cohort the subject can BE the median.

Grouped on aligned_year rather than fiscal_year, because a January year-end and the
previous December year-end describe the same economic year; and on statement_profile,
so a bank is never medianed against an operating company whose ratios are not even
defined the same way.

peer_percentile is NULL when the company has no measurement of its own. A company that
cannot be measured does not sit at the bottom of its peer group.

Every published figure is numeric. percentile_cont returns double precision, so its
results are cast back: float8 carries NaN and Infinity and float NaN does not equal
itself, which is the sentinel class this schema guards against elsewhere.';

revoke all on public.vw_company_fundamental_peers from public;
grant select on public.vw_company_fundamental_peers to anon, authenticated, service_role;
