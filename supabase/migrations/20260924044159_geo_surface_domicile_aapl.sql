-- AAPL carried equity_screener_universe.country = 'US' on 2026-09-22 and NULL
-- on 2026-09-24, so the seed (which reads that column) found nothing for it.
-- The vendor field is not stable night to night, which is why security_domicile
-- is a recorded fact rather than a join to the screener.
insert into public.security_domicile (security_id, iso2, instrument_kind, source, source_note)
select a.id, 'US', 'issuer', 'manual', 'Apple Inc. -- California corporation, HQ Cupertino CA'
  from public.assets a
 where a.symbol = 'AAPL'
on conflict (security_id) do nothing;
