-- fund_prices_raw: make nav nullable
-- LatestPrices.aspx provides TER/TC/TIC cost registry data only; no NAV prices.
ALTER TABLE fund_prices_raw ALTER COLUMN nav DROP NOT NULL;
