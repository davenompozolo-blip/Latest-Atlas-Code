-- A0b.2 seed. Seven series, every inception_date verified by fetching the full
-- series from FRED on 2026-09-13 (observation counts alongside).
--
-- UNITS ARE PERCENTAGE POINTS on the six rate series, not basis points. Every
-- threshold in the A3 trigger tables is authored in bp, so the engine divides a
-- bp threshold by 100 before comparing it against these values. Getting that
-- backwards makes a 40bp test a 4,000bp test and nothing ever fires.
--
-- PUBLICATION LAG IS NOT UNIFORM and is not a failure. Observed 2026-09-13,
-- against a last session of Friday 2026-09-11: the breakevens and T10Y2Y were
-- current to 09-11, DGS2/DGS10 to 09-10, Brent to 09-09. The nightly loader
-- must therefore measure staleness per series against that series' own recent
-- cadence, never against the last equity session -- the same reason
-- atlas_last_traded_day() exists rather than now().

insert into public.macro_series
  (series_key, provider, provider_code, label, units, measures, inception_date, caveats)
values
  ('T5YIFR', 'fred', 'T5YIFR',
   '5-Year, 5-Year Forward Inflation Expectation Rate', 'percent',
   '5y5y forward inflation expectation -- the structural read. The market''s view of '
   'average inflation over the five years beginning five years from now, so it strips '
   'the near-term energy and base-effect noise that dominates spot breakevens.',
   date '2003-01-02',
   'Percentage points, NOT basis points -- 2.32 means 2.32%, so a 25bp threshold is 0.25 here. '
   'Derived from TIPS and nominal curves, so it carries a TIPS liquidity premium and is a '
   'market-implied expectation, never a forecast. Published only on trading days and REVISED '
   'after first publication: the loader must upsert, never insert-only. 5,928 observations '
   'from 2003-01-02 as at 2026-09-13; no breakeven history exists before 2003, which bounds '
   'every theme that depends on this series.'),
  ('T5YIE', 'fred', 'T5YIE',
   '5-Year Breakeven Inflation Rate', 'percent',
   '5y breakeven -- the front-end read. Moves on energy and on near-term price shocks, '
   'which is exactly what makes it the absorption leg: a shock the front end prices and '
   'the 5y5y forward does not is a shock that was absorbed rather than rebased.',
   date '2003-01-02',
   'Percentage points, NOT basis points. TIPS-derived, so it carries a liquidity premium '
   'and is sensitive to oil in a way the forward rate is not -- that sensitivity is the '
   'point of the absorption test, not a defect. Trading days only; revised after first '
   'publication, so upsert. 5,928 observations from 2003-01-02 as at 2026-09-13.'),
  ('T10YIE', 'fred', 'T10YIE',
   '10-Year Breakeven Inflation Rate', 'percent',
   '10y breakeven. Spans both the front end and the forward window, so it is the '
   'cross-check on the other two rather than an independent read.',
   date '2003-01-02',
   'Percentage points, NOT basis points. Not independent of T5YIE and T5YIFR -- 10y is '
   'approximately the average of the 5y spot and the 5y5y forward, so do not treat a '
   'move in all three as three pieces of evidence. Trading days only; revised, so upsert. '
   '5,928 observations from 2003-01-02 as at 2026-09-13.'),
  ('DGS2', 'fred', 'DGS2',
   '2-Year Treasury Constant Maturity Rate', 'percent',
   '2y nominal yield. The policy-expectations end of the curve.',
   date '1976-06-01',
   'Percentage points, NOT basis points. CONSTANT MATURITY, which is an interpolation off '
   'the Treasury par curve and not the yield of any single traded bond. Trading days only; '
   'revised, so upsert. 12,566 observations from 1976-06-01 as at 2026-09-13, and its '
   'publication typically lags the breakevens by a session.'),
  ('DGS10', 'fred', 'DGS10',
   '10-Year Treasury Constant Maturity Rate', 'percent',
   '10y nominal yield. The long end of the theme framework -- fiscal_dominance is a '
   'claim that this rises while inflation expectations do not.',
   date '1962-01-02',
   'Percentage points, NOT basis points. CONSTANT MATURITY -- an interpolation off the par '
   'curve, not a traded bond. Deepest series here (16,158 observations from 1962-01-02 as at '
   '2026-09-13) but useless before 2003 for theme work, because every theme pairs it with a '
   'breakeven that does not exist before then. Trading days only; revised, so upsert.'),
  ('T10Y2Y', 'fred', 'T10Y2Y',
   '10-Year Minus 2-Year Treasury Constant Maturity Spread', 'percent',
   '2s10s slope, published directly by FRED rather than computed here. Bear steepening '
   'is the fiscal_dominance signature: the long end leads.',
   date '1976-06-01',
   'Percentage points, NOT basis points -- 0.33 means 33bp. This is DGS10 minus DGS2 and is '
   'therefore NOT independent of either; never count a slope move and a level move as two '
   'separate confirmations. Taken from FRED rather than subtracted here so that the '
   'published series and its revisions stay authoritative. Trading days only; revised, so '
   'upsert. 12,567 observations from 1976-06-01 as at 2026-09-13.'),
  ('BRENT', 'fred', 'DCOILBRENTEU',
   'Crude Oil Prices: Brent - Europe (spot FOB)', 'usd_per_bbl',
   'Brent spot, daily. The commodity leg that separates an energy shock from a tariff '
   'shock: both push inflation expectations up, only one moves oil.',
   date '1987-05-20',
   'SPOT, not a forward curve -- it cannot say whether a level move is expected to persist, '
   'and the commodity forward curve that could is a paid subscription and deliberately not '
   'bought. Sourced from FRED (DCOILBRENTEU, EIA data) rather than from Alpha Vantage''s '
   'BRENT endpoint: the two were compared over full history on 2026-09-13 and are identical '
   'on all 9,973 observations, so FRED is the same series without an API key. USD per barrel, '
   'so a percentage threshold applies to the level, not a bp one. Publishes with the longest '
   'lag of the seven -- typically two sessions. 9,973 observations from 1987-05-20.')
on conflict (series_key) do nothing;
