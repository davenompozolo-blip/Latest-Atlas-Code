-- ============================================================
-- Valuation sync — allow null implied_price on dropped methods
-- ------------------------------------------------------------
-- The weekly sync appends a snapshot row for EVERY attempted method,
-- including the ones that failed loud (shares_unhydrated, tv_clamped,
-- outlier_trimmed, …). Those rows carry implied_price = null + a
-- drop_reason, which the original NOT NULL constraint rejected. Valued
-- methods still carry a real implied_price.
-- ============================================================

ALTER TABLE public.scrapbook_snapshots ALTER COLUMN implied_price DROP NOT NULL;
