-- FD-05: held bond / international ETFs (e.g. TIP) had assets.name = NULL or just
-- the ticker, so the Earnings Calendar and other name displays showed "—". The
-- curated sector_overrides table (migration 20260622000000) already carries a
-- proper fund name in its note column for these symbols; backfill from it where
-- the note reads like a fund name. Only touches rows whose name is missing or is
-- merely the ticker — never overwrites a real name. Re-runnable.

update public.assets a
set name = o.note
from public.sector_overrides o
where o.symbol = a.symbol
  and o.note ilike any (array['%ETF%', '%Fund%'])
  and (a.name is null or btrim(a.name) = '' or a.name = a.symbol);
