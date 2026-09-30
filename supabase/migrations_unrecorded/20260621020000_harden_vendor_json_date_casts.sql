-- Swap every remaining unguarded vendor-JSON cast onto the safe_* helpers, so a
-- malformed earnings/ex-div date or market cap degrades to NULL instead of
-- throwing and taking down the whole surface.
--
-- Self-contained / order-independent: handles both the raw `::bigint` form and
-- the NULLIF(...)::numeric::bigint form (whichever the prior migrations left),
-- and is idempotent — every replace is a no-op once hardened. Asserts that no
-- raw ::date or ::bigint cast on these JSON paths survives.

-- vw_screener: next_earnings (::date) + market_cap_raw (::bigint)
DO $$
DECLARE d text;
BEGIN
  d := pg_get_viewdef('vw_screener'::regclass, true);
  -- dates
  d := replace(d, '(ec.payload ->> ''NextEarningsDate''::text)::date',
                  'public.safe_date(ec.payload ->> ''NextEarningsDate''::text)');
  d := replace(d, '((ec.payload -> ''overview''::text) ->> ''NextEarningsDate''::text)::date',
                  'public.safe_date((ec.payload -> ''overview''::text) ->> ''NextEarningsDate''::text)');
  -- market cap (NULLIF::numeric::bigint form)
  d := replace(d, 'NULLIF(ec.payload ->> ''MarketCapitalization''::text, ''''::text)::numeric::bigint',
                  'public.safe_bigint(ec.payload ->> ''MarketCapitalization''::text)');
  d := replace(d, 'NULLIF((ec.payload -> ''overview''::text) ->> ''MarketCapitalization''::text, ''''::text)::numeric::bigint',
                  'public.safe_bigint((ec.payload -> ''overview''::text) ->> ''MarketCapitalization''::text)');
  -- market cap (raw ::bigint form, in case the screener bigint fix did not run first)
  d := replace(d, '(ec.payload ->> ''MarketCapitalization''::text)::bigint',
                  'public.safe_bigint(ec.payload ->> ''MarketCapitalization''::text)');
  d := replace(d, '((ec.payload -> ''overview''::text) ->> ''MarketCapitalization''::text)::bigint',
                  'public.safe_bigint((ec.payload -> ''overview''::text) ->> ''MarketCapitalization''::text)');
  IF position('''NextEarningsDate''::text)::date' in d) > 0
     OR position('''MarketCapitalization''::text)::bigint' in d) > 0 THEN
    RAISE EXCEPTION 'vw_screener: a raw vendor-JSON ::date/::bigint cast still remains after hardening';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW vw_screener AS ' || d;
END $$;

-- vw_earnings_calendar: earnings_date, days_to_earnings, ex_div_date, ORDER BY
DO $$
DECLARE d text;
BEGIN
  d := pg_get_viewdef('vw_earnings_calendar'::regclass, true);
  d := replace(d, '((co.payload -> ''overview''::text) ->> ''NextEarningsDate''::text)::date',
                  'public.safe_date((co.payload -> ''overview''::text) ->> ''NextEarningsDate''::text)');
  d := replace(d, '((co.payload -> ''overview''::text) ->> ''ExDividendDate''::text)::date',
                  'public.safe_date((co.payload -> ''overview''::text) ->> ''ExDividendDate''::text)');
  IF position('''NextEarningsDate''::text)::date' in d) > 0
     OR position('''ExDividendDate''::text)::date' in d) > 0 THEN
    RAISE EXCEPTION 'vw_earnings_calendar: a raw date cast still remains after hardening';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW vw_earnings_calendar AS ' || d;
END $$;
