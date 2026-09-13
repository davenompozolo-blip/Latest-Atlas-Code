-- A0b.1 -- three Treasury ETF legs, so a nominal slope can be computed from
-- the A0 series layer for the first time. The existing 16 legs carry TLT at
-- the long end and nothing at all at the short end, so no curve of any kind
-- was derivable from them.
--
-- inception_date on every row is the provider's own firstTradeDate, read from
-- Yahoo's chart meta rather than asserted: SHY 2002-07-30, IEI 2007-01-11,
-- IEF 2002-07-30. SHY and IEF share TLT's date because iShares launched the
-- Treasury suite together; IEI came four and a half years later, so any
-- slope built from IEI is bounded by 2007 and not by the other two.
--
-- The caveat column carries the constraint that matters: these are TOTAL
-- RETURN price series. A SHY/IEF ratio reads duration-adjusted relative
-- performance, not a spread in basis points. It is adequate for confirming a
-- regime and must never be quoted as a 2s10s. The genuine curve series come
-- from FRED in A0b.2 (DGS2, DGS10, T10Y2Y) and those are the ones to quote.

insert into public.market_instruments
  (symbol, name, asset_class, proxies_for, inception_date, data_source, caveats, active)
values
  ('SHY', 'iShares 1-3 Year Treasury Bond ETF', 'fixed_income_etf',
   'US short-end Treasuries (1-3y)', date '2002-07-30', 'yahoo',
   'Total-return price series, not a yield. Effective duration is about 1.9y, '
   'so this is the SHORT END and not a policy-rate proxy -- it will lag a funds-rate '
   'move and it carries roll and coupon return a rate series does not. A SHY/IEF or '
   'SHY/TLT ratio is duration-adjusted relative performance; an ETF slope is NOT a '
   'yield curve and must never be quoted in basis points. Use FRED DGS2/DGS10/T10Y2Y '
   'for a quotable spread.', true),
  ('IEI', 'iShares 3-7 Year Treasury Bond ETF', 'fixed_income_etf',
   'US belly Treasuries (3-7y)', date '2007-01-11', 'yahoo',
   'Total-return price series, not a yield. The belly of the curve. Inception '
   '2007-01-11 is four and a half years later than SHY/IEF/TLT, so any ratio '
   'involving IEI is bounded by 2007 -- do not truncate the other legs to match it. '
   'An ETF slope is NOT a yield curve; use FRED DGS2/DGS10/T10Y2Y for a spread in bp.', true),
  ('IEF', 'iShares 7-10 Year Treasury Bond ETF', 'fixed_income_etf',
   'US intermediate Treasuries (7-10y)', date '2002-07-30', 'yahoo',
   'Total-return price series, not a yield. Intermediate duration, and the natural '
   'partner to TLT at the long end and SHY at the short end. An ETF slope is NOT a '
   'yield curve: SHY/IEF reads duration-adjusted relative performance, not a spread '
   'in basis points. Use FRED DGS2/DGS10/T10Y2Y for a quotable spread.', true)
on conflict (symbol) do nothing;
