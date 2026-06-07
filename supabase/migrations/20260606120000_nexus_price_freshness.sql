-- ============================================================
-- Nexus Spine — real data-integrity source
-- ------------------------------------------------------------
-- The new Nexus (flagship) computes its DataIntegrityIndicator
-- LIVE, not from a mock. It needs per-held-symbol price freshness
-- so it can surface stale feeds (e.g. the OTC ADRs whose prices
-- only refresh sporadically: TCEHY, NPSNY, PROSY, VWAGY).
--
-- The anon Supabase client can only read tables/views/rpc, not run
-- arbitrary SQL, so we expose a tiny read-only view it can SELECT.
-- It reads from the already-materialised mv_nexus_holdings (≈60 rows)
-- joined to the latest price_date per symbol, so the cost is trivial.
-- ============================================================

CREATE OR REPLACE VIEW vw_nexus_price_freshness AS
SELECT
    a.symbol,
    MAX(ph.price_date)                       AS last_price_date,
    (CURRENT_DATE - MAX(ph.price_date))::int AS days_old
FROM mv_nexus_holdings h
JOIN assets a        ON a.symbol = h.symbol
JOIN price_history ph ON ph.asset_id = a.id
GROUP BY a.symbol;

GRANT SELECT ON vw_nexus_price_freshness TO anon, authenticated, service_role;
