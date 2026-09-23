-- ============================================================
-- EQ-7a · `RANGE ... 1 PRECEDING` is a VALUE offset, not a row offset.
--
-- `peer_percentile` was built as
--
--     count(*) over (partition by cohort_key, metric order by value
--                    range between unbounded preceding and 1 preceding)
--
-- intending "peers ranked strictly below this one". In RANGE mode the offset
-- is arithmetic ON THE ORDERING VALUE, so that counts peers whose value is at
-- most `value - 1` -- it subtracts one unit of whatever the metric happens to
-- be measured in. On `beta`, where the whole universe spans roughly 0 to 3,
-- subtracting 1 discards a third of the range; on `roe_ttm`, which spans 0 to
-- 110, it discards almost nothing. So the error was not even consistent
-- between metrics.
--
-- Postgres ACCEPTS the frame without complaint because `value` is numeric and
-- a numeric RANGE offset is legal. It is a correct query computing a
-- different quantity, which is why nothing in the plan or the structural
-- invariants flagged it: percentiles stayed inside [0, 1], peer_count stayed
-- consistent with peer_median, and every row looked reasonable.
--
-- Measured against an independent `count(*) where b.value < a.value` over
-- three cohorts: **max disagreement 0.905** on a quantity bounded by 1.
--
-- `rank()` is the right primitive. It is 1 + the number of rows with a
-- strictly smaller value, so `rank() - 1` is exactly "peers strictly below"
-- with ties counted on neither side, and the subject is excluded because its
-- own value ties with itself.
--
-- The leave-one-out median was checked in the same pass and was correct:
-- 1,442 rows, 0 null disagreements, max difference 5e-7 against
-- `percentile_cont` excluding the subject -- which is the 6-decimal rounding.
-- Only the percentile moves here.
-- ============================================================

create or replace view public.vw_company_peer_cohort as
with base as (
    select u.symbol,
           u.company_name,
           -- `sector` is the populated one (913/913); `industry` is its copy
           -- and is NULL on 17 rows. Reading `sector` is not a preference,
           -- it is the only column that always carries the bucket.
           u.sector                as cohort_key,
           u.market_cap_usd,
           u.market_cap_bucket,
           u.current_price,
           u.cached_at
      from public.equity_screener_universe u
     where u.sector is not null and btrim(u.sector) <> ''
),
-- Long form: one row per (symbol, metric). `higher_is_better` is carried from
-- here so a surface can never invert a reading -- a percentile with no
-- orientation asserts the opposite half the time, the same defect as an axis
-- key printed without its loading's sign. It is NULL, never guessed, where
-- the direction is genuinely a matter of mandate rather than quality: beta
-- and volatility are the position a reader takes, not a score.
m as (
    select b.symbol, b.cohort_key, x.metric, x.value, x.higher_is_better
      from base b
      join public.equity_screener_universe u on u.symbol = b.symbol
     cross join lateral (values
        ('forward_pe',             u.forward_pe,             false),
        ('pe_ratio',               u.pe_ratio,               false),
        ('peg_ratio',              u.peg_ratio,              false),
        ('ev_ebitda',              u.ev_ebitda,              false),
        ('price_to_book',          u.price_to_book,          false),
        ('price_to_sales',         u.price_to_sales,         false),
        ('roe_ttm',                u.roe_ttm,                true),
        ('roa_ttm',                u.roa_ttm,                true),
        ('gross_margin',           u.gross_margin,           true),
        ('net_margin',             u.net_margin,             true),
        ('rev_growth_yoy',         u.rev_growth_yoy,         true),
        ('rev_growth_3y',          u.rev_growth_3y,          true),
        ('eps_growth_yoy',         u.eps_growth_yoy,         true),
        ('div_yield_pct',          u.div_yield_pct,          true),
        ('return_52w',             u.return_52w,             true),
        ('return_13w',             u.return_13w,             true),
        ('roic_pct',               u.roic_pct,               true),
        ('roic_wacc_spread_pct',   u.roic_wacc_spread_pct,   true),
        ('beta',                   u.beta,                   null),
        ('vol_3m',                 u.vol_3m,                 null)
     ) as x(metric, value, higher_is_better)
     -- TWO-SIDED, never `is not null` alone. NaN and +Infinity both pass a
     -- one-sided bound and NaN sorts ABOVE every finite value in this
     -- database, so one sentinel would take the top of every percentile it
     -- appeared in. PR #783.
     where x.value is not null
       and x.value > '-Infinity'::numeric
       and x.value <  'Infinity'::numeric
),
ranked as (
    select m.*,
           row_number() over (partition by m.cohort_key, m.metric
                              order by m.value, m.symbol)              as rk,
           count(*)     over (partition by m.cohort_key, m.metric) as n_measured,
           -- PEERS STRICTLY BELOW. `rank()` is 1 + the count of strictly
           -- smaller values, so `rank() - 1` is exactly that count: ties are
           -- on neither side, and the subject is excluded because its own
           -- value ties with itself. NOT a RANGE frame -- a numeric RANGE
           -- offset subtracts one unit of the METRIC, which is what this
           -- migration is fixing.
           rank()       over (partition by m.cohort_key, m.metric
                              order by m.value) - 1                as peers_below
      from m
),
arr as (
    select cohort_key, metric, array_agg(value order by value, symbol) as sorted
      from ranked group by 1, 2
)
select
    b.symbol,
    b.company_name,
    b.cohort_key,
    -- The taxonomy this bucket comes from, so no surface can label it as a
    -- GICS sector or a GICS industry. It is neither.
    'finnhub_taxonomy'::text                     as cohort_basis,
    r.metric,
    r.value,
    r.higher_is_better,

    -- The cohort median EXCLUDING this company.
    round(public.atlas_loo_median(a.sorted, r.rk::int), 6)  as peer_median,
    round(r.value - public.atlas_loo_median(a.sorted, r.rk::int), 6) as vs_peer_median,

    -- PEERS, not cohort size, and peers with a MEASURED value for THIS
    -- metric. `ev_ebitda` is 0 of 63 on Banking and `forward_pe` 18 of 44 on
    -- Biotechnology; a denominator of "how many companies are in the bucket"
    -- would publish a median over a handful and call it the sector.
    (r.n_measured - 1)                           as peer_count,
    case when r.n_measured > 1
         then round((r.peers_below::numeric / (r.n_measured - 1)), 6) end as peer_percentile,

    -- A cohort of one has no peer and says so rather than rendering an
    -- absent median as a neutral reading.
    case when r.n_measured <= 1 then 'no_peer_with_this_metric' end as peer_withheld,

    b.market_cap_usd,
    b.market_cap_bucket,
    b.current_price,
    b.cached_at
  from ranked r
  join base b on b.symbol = r.symbol
  join arr  a on a.cohort_key = r.cohort_key and a.metric = r.metric;

comment on view public.vw_company_peer_cohort is
'EQ-7. Where a company sits against the companies it is actually compared
with, one row per (symbol, metric).

Built on equity_screener_universe (913 symbols, refreshed daily), NOT on the
statement layer: vw_company_fundamental_peers derives from the Alpha Vantage
load and is ten symbols deep behind a 25-request/day ceiling.

THE COHORT IS THE VENDOR TAXONOMY AND cohort_basis SAYS SO. This platform has
no independent industry classification -- equity_screener_universe.industry is
a copy of sector, identical on all 896 rows that carry both -- and the 46
buckets mix GICS sector names with GICS industry names, so they are neither
level cleanly.

The subject is excluded from its own median (a median containing the subject
is not a benchmark). peer_count counts peers with a MEASURED value for that
metric, never cohort size. peer_percentile is rank()-1 over peer_count -- the
share of peers strictly below, ties on neither side. It was first written as a RANGE frame, which is a
VALUE offset and silently measured something else (EQ-7a). higher_is_better
travels on the row and is NULL for beta and volatility, where the direction is
a mandate rather than a quality.

Per-symbol coverage is uneven and the surface must state it: 820 of 913
symbols carry 12 or more of the 20 metrics, 42 carry four or fewer, and
roic_pct / roic_wacc_spread_pct sit at 3.6% because their writer
(compute_ticker_derived) is on-demand and stopped at 38 tickers.';

grant select on public.vw_company_peer_cohort to anon, authenticated, service_role;
