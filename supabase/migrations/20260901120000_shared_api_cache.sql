-- The shared durable cache for the Vercel API proxies that are NOT /api/equity.
--
-- Why this exists: api/macro.js, api/calendar.js, api/news.js and api/movers.js
-- have all been reading and writing `public.cache` since they were written.
-- That table has never existed. PostgREST answered every write with PGRST205
-- ("Could not find the table 'public.cache' in the schema cache", hinting at
-- 'public.equity_cache'), and every one of those writes was discarded by a
-- `catch (_) { /* non-fatal */ }` that neither checked the response status nor
-- logged. The reads then missed forever.
--
-- The visible cost was on /api/macro, which rebuilds from 21 FRED series plus
-- 27 Finnhub quotes on EVERY request. Measured on the live deployment before
-- this table existed: 1.5s, 1.7s, 1.7s, 2.2s, 2.8s, 9.7s across six calls. The
-- endpoint gates first paint on the Nexus Flagship — getNexusModel() cannot
-- resolve until it returns — so the page read "Loading Nexus…" for the whole of
-- whichever of those numbers the user happened to draw.
--
-- Shape is dictated by the four call sites, which POST
--   { cache_key, payload, cached_at, expires_at }
-- and read `?cache_key=eq.<key>&select=payload,expires_at`. Do not add NOT NULL
-- columns here without changing them: equity_cache carries `symbol` and
-- `endpoint` NOT NULL, which is precisely why these four cannot simply reuse it.
--
-- RLS on with no policies, matching equity_cache: the serverless functions hold
-- the service role, which bypasses RLS, so the anon key cannot enumerate the
-- cache even though the payloads are public market data.

CREATE TABLE IF NOT EXISTS public.cache (
    cache_key   text PRIMARY KEY,
    payload     jsonb NOT NULL,
    cached_at   timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cache_expires ON public.cache(expires_at);

ALTER TABLE public.cache ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.cache IS
    'Shared durable cache for the non-equity Vercel API proxies (macro, calendar, news, movers). Written by the serverless functions via the service role; keyed by their CACHE_KEY constants. /api/equity uses equity_cache instead, which carries per-symbol columns.';
