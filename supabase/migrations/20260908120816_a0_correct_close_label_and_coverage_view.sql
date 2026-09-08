-- The A0 spec calls market_prices.close a "raw close". It is not raw in the
-- as-traded sense and the comment said so, which is the fwd_pe failure in a new
-- table: a column whose name and gloss assert something the data does not hold.
--
-- Checked against the provider's own split events rather than inferred:
--   QQQ  2:1 on 2000-03-20   XLU  2:1 on 2025-12-05   SPY  never split
-- The close series has no discontinuity across any of them, so splits are
-- applied to `close` exactly as they are to `adj_close`. The two columns differ
-- by DIVIDENDS ONLY.
--
-- This does not affect the spec's purpose: adj_close is what every downstream
-- ratio uses, and close still reconciles against any split-adjusted provider
-- quote. It does mean close must not be read as the price a trade actually
-- printed at before a split -- XLU's stored close for any date before
-- 2025-12-05 is half the price that traded that day.
comment on column public.market_prices.close is
  'Split-adjusted close, NOT dividend-adjusted. Not the as-traded print: splits are applied here exactly as in adj_close, so before a split this column is the post-split-equivalent price (e.g. XLU before 2025-12-05 is half what traded). The two columns differ by dividends only, which is what makes close useful for isolating the dividend effect and for reconciliation. Never use it for ratio computation.';


-- Coverage report (acceptance 5.4), as a view so it is re-runnable rather than
-- a number that was true once.
create or replace view public.vw_market_price_coverage as
with sessions as (
  select date from public.market_prices where symbol = 'SPY'
), bounds as (
  select mp.symbol, mi.inception_date,
         min(mp.date) as first_date, max(mp.date) as last_date, count(*) as row_count
  from public.market_prices mp
  join public.market_instruments mi using (symbol)
  group by 1, 2
), expected as (
  select b.symbol, count(*) as expected_sessions
  from bounds b join sessions s on s.date between b.first_date and b.last_date
  group by 1
), offcal as (
  select mp.symbol, count(*) as off_calendar_bars
  from public.market_prices mp
  where not exists (select 1 from sessions s where s.date = mp.date)
  group by 1
)
select b.symbol,
       b.inception_date,
       b.first_date,
       (b.first_date = b.inception_date) as starts_at_inception,
       b.last_date,
       b.row_count,
       e.expected_sessions,
       e.expected_sessions - b.row_count      as missing_sessions,
       coalesce(o.off_calendar_bars, 0)       as off_calendar_bars
from bounds b
join expected e using (symbol)
left join offcal o using (symbol);

comment on view public.vw_market_price_coverage is
  'Per-instrument coverage against the NYSE session calendar. THE CALENDAR IS A PROXY: it is the set of dates SPY printed a bar, the same idiom as atlas_last_traded_day(). Every leg was loaded from one provider on one calendar, so missing_sessions is structurally near-zero and this view CANNOT independently prove the feed is complete -- it detects a leg that lags the others, not a day the provider dropped from all of them. The calendar itself was validated separately against raw weekday counts: 8-11 closed weekdays a year except 1993 and 2026 (partial years) and 2001 (13 = 9 holidays + the four-day post-9/11 closure).';
