-- Durable cache for the /api/equity proxy (Module B: Equity Research).
--
-- Context: the Vercel serverless function was originally bucket-sorting hits
-- through an in-memory Map, but cold starts reset the Map and Yahoo Finance
-- IP-bans serverless egress pools aggressively. This table persists upstream
-- responses across cold starts so steady-state traffic never hits the provider.
--
-- TTL strategy:
--   endpoint='daily'     → 4h   (prices refresh after market close)
--   endpoint='overview'  → 24h  (fundamentals change rarely)
--
-- The /api/equity proxy caches `overview` and `daily` under separate keys even
-- for a `combined` request, so subsequent combined requests can stitch fresh
-- data from whichever leg is still warm.

CREATE TABLE IF NOT EXISTS equity_cache (
    cache_key   text PRIMARY KEY,           -- e.g. 'AAPL:daily'
    symbol      text NOT NULL,
    endpoint    text NOT NULL,              -- 'daily' | 'overview'
    payload     jsonb NOT NULL,
    cached_at   timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_equity_cache_symbol  ON equity_cache(symbol);
CREATE INDEX IF NOT EXISTS idx_equity_cache_expires ON equity_cache(expires_at);

-- Only the serverless proxy writes here (via service role). RLS is enabled so
-- the anon key cannot enumerate the full cache, though the payload itself is
-- non-sensitive public market data.
ALTER TABLE equity_cache ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE equity_cache IS
    'Durable cache for /api/equity proxy responses. Written by Vercel serverless function via service role. See api/equity.js.';
