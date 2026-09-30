CREATE TABLE IF NOT EXISTS public.sector_industry_map (
    industry    text PRIMARY KEY,
    sector      text NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT sim_sector_nonblank CHECK (btrim(sector) <> '')
);

COMMENT ON TABLE public.sector_industry_map IS
    'Finnhub industry (equity_screener_universe.sector) -> ATLAS sector. Adding a row here classifies every present and future name in that industry; no code change and no redeploy.';

INSERT INTO public.sector_industry_map (industry, sector) VALUES
    ('Technology','Technology'),('Semiconductors','Technology'),('Media','Technology'),
    ('Telecommunication','Technology'),('Communications','Technology'),
    ('Biotechnology','Healthcare'),('Pharmaceuticals','Healthcare'),('Health Care','Healthcare'),
    ('Life Sciences Tools & Services','Healthcare'),
    ('Banking','Financials'),('Financial Services','Financials'),('Insurance','Financials'),
    ('Real Estate','Real Estate'),('Utilities','Utilities'),('Energy','Energy'),
    ('Metals & Mining','Materials'),('Chemicals','Materials'),('Packaging','Materials'),
    ('Paper & Forest','Materials'),
    ('Electrical Equipment','Industrials'),('Machinery','Industrials'),('Aerospace & Defense','Industrials'),
    ('Professional Services','Industrials'),('Construction','Industrials'),('Building','Industrials'),
    ('Trading Companies & Distributors','Industrials'),('Commercial Services & Supplies','Industrials'),
    ('Road & Rail','Industrials'),('Airlines','Industrials'),('Logistics & Transportation','Industrials'),
    ('Marine','Industrials'),('Transportation Infrastructure','Industrials'),
    ('Industrial Conglomerates','Industrials'),('Distributors','Industrials'),
    ('Retail','Consumer Discretionary'),('Hotels, Restaurants & Leisure','Consumer Discretionary'),
    ('Automobiles','Consumer Discretionary'),('Auto Components','Consumer Discretionary'),
    ('Textiles, Apparel & Luxury Goods','Consumer Discretionary'),('Leisure Products','Consumer Discretionary'),
    ('Diversified Consumer Services','Consumer Discretionary'),
    ('Beverages','Consumer Staples'),('Food Products','Consumer Staples'),('Tobacco','Consumer Staples'),
    ('Consumer products','Consumer Staples')
ON CONFLICT (industry) DO UPDATE SET sector = EXCLUDED.sector, updated_at = now();

CREATE TABLE IF NOT EXISTS public.instrument_sector_overrides (
    symbol      text PRIMARY KEY,
    sector      text NOT NULL,
    reason      text NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT iso_sector_nonblank CHECK (btrim(sector) <> ''),
    CONSTRAINT iso_reason_nonblank CHECK (btrim(reason) <> '')
);

COMMENT ON TABLE public.instrument_sector_overrides IS
    'Symbol -> ATLAS sector, for instruments whose sector is a fund mandate rather than an issuer attribute. Takes precedence over sector_industry_map.';

INSERT INTO public.instrument_sector_overrides (symbol, sector, reason) VALUES
    ('ACWI', 'International',  'MSCI ACWI global equity index fund'),
    ('AVEE', 'International',  'Avantis emerging markets equity fund'),
    ('AVEM', 'International',  'Avantis emerging markets equity fund'),
    ('DFEV', 'International',  'Dimensional emerging markets value fund'),
    ('EWA',  'International',  'iShares MSCI Australia country fund'),
    ('EWY',  'International',  'iShares MSCI South Korea country fund'),
    ('EZA',  'International',  'iShares MSCI South Africa country fund'),
    ('UAE',  'International',  'iShares MSCI UAE country fund'),
    ('BOND', 'Fixed Income',   'PIMCO Active Bond ETF'),
    ('BSV',  'Fixed Income',   'Vanguard Short-Term Bond ETF'),
    ('PTRB', 'Fixed Income',   'PGIM Total Return Bond ETF'),
    ('SHY',  'Fixed Income',   'iShares 1-3 Year Treasury Bond ETF'),
    ('TIP',  'Fixed Income',   'iShares TIPS Bond ETF'),
    ('IBIE', 'Fixed Income',   'iShares iBonds term corporate ETF'),
    ('IXC',  'Energy',         'iShares Global Energy ETF - sector mandate; was NULL/unenriched'),
    ('XLE',  'Energy',         'Energy Select Sector SPDR - was classified ''ETFs'', a wrapper type'),
    ('XLRE', 'Real Estate',    'Real Estate Select Sector SPDR'),
    ('GDX',  'Materials',      'VanEck Gold Miners ETF - miners, not bullion'),
    ('FIDU', 'Industrials',    'Fidelity MSCI Industrials index fund'),
    ('CPER', 'Materials',      'United States Copper Index Fund - industrial metal exposure'),
    ('SONY', 'Consumer Discretionary',
             'Finnhub industry ''Consumer products'' maps to Staples; Sony is consumer electronics')
ON CONFLICT (symbol) DO UPDATE
    SET sector = EXCLUDED.sector, reason = EXCLUDED.reason, updated_at = now();

CREATE OR REPLACE FUNCTION public.atlas_resolve_sector(p_symbol text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
    SELECT COALESCE(
        (SELECT o.sector FROM public.instrument_sector_overrides o
          WHERE o.symbol = p_symbol),
        (SELECT m.sector FROM public.equity_screener_universe e
           JOIN public.sector_industry_map m ON m.industry = e.sector
          WHERE e.symbol = p_symbol)
    );
$$;

REVOKE EXECUTE ON FUNCTION public.atlas_resolve_sector(text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.atlas_refresh_asset_sectors()
RETURNS TABLE(out_updated integer, out_unresolved integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_log_id     bigint;
    v_updated    int := 0;
    v_unresolved int := 0;
    v_held_gap   text;
BEGIN
    INSERT INTO public.sync_log (source, function_name, status, started_at, details)
    VALUES ('atlas_refresh_asset_sectors', 'atlas_refresh_asset_sectors',
            'running', clock_timestamp(), '{}'::jsonb)
    RETURNING id INTO v_log_id;

    WITH resolved AS (
        SELECT a.id,
               NULLIF(NULLIF(a.sector, 'Other'), 'ETFs') AS current_sector,
               public.atlas_resolve_sector(a.symbol)     AS new_sector
          FROM public.assets a
         WHERE COALESCE(a.asset_class, '') NOT ILIKE '%option%'
    ), changed AS (
        UPDATE public.assets a
           SET sector = r.new_sector, updated_at = now()
          FROM resolved r
         WHERE a.id = r.id
           AND r.new_sector IS NOT NULL
           AND r.current_sector IS DISTINCT FROM r.new_sector
        RETURNING 1
    )
    SELECT count(*) INTO v_updated FROM changed;

    SELECT count(*), string_agg(a.symbol, ' ' ORDER BY a.symbol)
      INTO v_unresolved, v_held_gap
      FROM public.assets a
     WHERE a.id IN (SELECT asset_id FROM public.positions)
       AND COALESCE(a.asset_class, '') NOT ILIKE '%option%'
       AND NULLIF(NULLIF(a.sector, 'Other'), 'ETFs') IS NULL;

    UPDATE public.sync_log
       SET status = 'success', finished_at = clock_timestamp(),
           details = jsonb_build_object(
               'sectors_updated',         v_updated,
               'held_unresolved',         v_unresolved,
               'held_unresolved_symbols', COALESCE(v_held_gap, ''))
     WHERE id = v_log_id;

    RETURN QUERY SELECT v_updated, v_unresolved;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.atlas_refresh_asset_sectors() FROM public, anon, authenticated;

UPDATE public.assets SET name = 'iShares Global Energy ETF', updated_at = now()
 WHERE symbol = 'IXC' AND name IS NULL;
