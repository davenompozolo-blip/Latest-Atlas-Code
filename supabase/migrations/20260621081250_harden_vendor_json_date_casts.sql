-- Harden the remaining unguarded vendor-JSON casts to the safe_* helpers, so a
-- malformed earnings/ex-div date degrades to NULL instead of throwing
-- "invalid input syntax for type date" and taking down the surface. The
-- MarketCapitalization bigint legs (already NULLIF(...)::numeric::bigint from the
-- screener bigint fix) are folded into safe_bigint() for one canonical form.
-- Idempotent: replaces are no-ops if already hardened; asserts no raw date cast
-- on these JSON paths remains afterward.

-- vw_screener: next_earnings date + market_cap_raw bigint
DO $$
DECLARE d text;
BEGIN
  d := pg_get_viewdef('vw_screener'::regclass, true);
  d := replace(d, '(ec.payload ->> ''NextEarningsDate''::text)::date',
                  'public.safe_date(ec.payload ->> ''NextEarningsDate''::text)');
  d := replace(d, '((ec.payload -> ''overview''::text) ->> ''NextEarningsDate''::text)::date',
                  'public.safe_date((ec.payload -> ''overview''::text) ->> ''NextEarningsDate''::text)');
  d := replace(d, 'NULLIF(ec.payload ->> ''MarketCapitalization''::text, ''''::text)::numeric::bigint',
                  'public.safe_bigint(ec.payload ->> ''MarketCapitalization''::text)');
  d := replace(d, 'NULLIF((ec.payload -> ''overview''::text) ->> ''MarketCapitalization''::text, ''''::text)::numeric::bigint',
                  'public.safe_bigint((ec.payload -> ''overview''::text) ->> ''MarketCapitalization''::text)');
  IF position('''NextEarningsDate''::text)::date' in d) > 0 THEN
    RAISE EXCEPTION 'vw_screener: a raw NextEarningsDate ::date cast still remains after hardening';
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
