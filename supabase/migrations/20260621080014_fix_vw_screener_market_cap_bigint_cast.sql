-- Bugfix: vw_screener cast the JSON MarketCapitalization text straight to
-- bigint. Finnhub/AV return fractional market caps (e.g. Citigroup
-- "245334658571.99997"), and casting decimal *text* to bigint throws
-- "invalid input syntax for type bigint" — which failed the entire screener
-- load on both the Equity and Valuation pages (portfolio mode reads vw_screener).
--
-- Fix: text -> numeric -> bigint (numeric->bigint rounds, so no error), with
-- NULLIF to guard empty strings. Applied as a guarded DO block over the live
-- definition to avoid transcribing the ~100-line view; raises if the expected
-- expression is absent so it can't silently no-op.
DO $$
DECLARE
  d   text;
  src text := 'COALESCE((ec.payload ->> ''MarketCapitalization''::text)::bigint, ((ec.payload -> ''overview''::text) ->> ''MarketCapitalization''::text)::bigint) AS market_cap_raw';
  dst text := 'COALESCE(NULLIF(ec.payload ->> ''MarketCapitalization''::text, ''''::text)::numeric::bigint, NULLIF((ec.payload -> ''overview''::text) ->> ''MarketCapitalization''::text, ''''::text)::numeric::bigint) AS market_cap_raw';
BEGIN
  d := pg_get_viewdef('vw_screener'::regclass, true);
  IF position(src in d) = 0 THEN
    RAISE EXCEPTION 'vw_screener: expected market_cap_raw bigint-cast expression not found; aborting (view may have already been patched or changed shape)';
  END IF;
  d := replace(d, src, dst);
  EXECUTE 'CREATE OR REPLACE VIEW vw_screener AS ' || d;
END $$;
