CREATE TABLE IF NOT EXISTS public.theme_taxonomy (
    theme        text PRIMARY KEY,
    description  text NOT NULL,
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tt_description_nonblank CHECK (btrim(description) <> '')
);

COMMENT ON TABLE public.theme_taxonomy IS
    'The closed set of themes. position_themes.theme references this, so a new theme is a deliberate insert here, never a side effect of a typo.';

INSERT INTO public.theme_taxonomy (theme, description) VALUES
    ('AI / accelerated compute',     'Semis, accelerators and the compute buildout behind them'),
    ('Mega-cap platforms',           'The large platform franchises held for their franchise, not their sector'),
    ('Software / SaaS',              'Application and subscription software - a different bet from the compute buildout'),
    ('China internet (ADRs)',        'Chinese internet platforms held via ADR'),
    ('International / EM ETFs',      'Country and region equity funds'),
    ('Consumer / autos',             'Discretionary consumer demand, including autos and travel'),
    ('Consumer staples',             'Defensive consumer demand - food, beverages, household'),
    ('Healthcare / defensives',      'Pharma and biotech held for defensiveness'),
    ('Financials',                   'Banks, brokers and diversified financials'),
    ('Energy',                       'Oil, gas and oilfield services'),
    ('Energy transition',            'Electrification and generation build-out on the decarbonisation thesis'),
    ('Utilities / regulated',        'Rate-regulated utilities held for the regulated return, not the transition'),
    ('Industrials / electrification','Capital goods levered to grid and factory electrification'),
    ('Materials',                    'Chemicals, industrial metals and materials'),
    ('Precious metals / miners',     'Gold and precious-metal miners and royalties'),
    ('Real estate',                  'REITs and real-estate funds'),
    ('Fixed income / duration',      'Bond funds held for duration and ballast')
ON CONFLICT (theme) DO UPDATE
    SET description = EXCLUDED.description, updated_at = now();

DO $$
DECLARE v_orphans text;
BEGIN
    SELECT string_agg(DISTINCT pt.theme, ', ')
      INTO v_orphans
      FROM public.position_themes pt
      LEFT JOIN public.theme_taxonomy tt ON tt.theme = pt.theme
     WHERE tt.theme IS NULL;
    IF v_orphans IS NOT NULL THEN
        RAISE EXCEPTION 'themes in use but absent from theme_taxonomy: %', v_orphans;
    END IF;
END $$;

ALTER TABLE public.position_themes DROP CONSTRAINT IF EXISTS position_themes_theme_fkey;
ALTER TABLE public.position_themes
    ADD CONSTRAINT position_themes_theme_fkey
    FOREIGN KEY (theme) REFERENCES public.theme_taxonomy(theme)
    ON UPDATE CASCADE;

INSERT INTO public.position_themes (symbol, theme, updated_at) VALUES
    ('TIP',  'Fixed income / duration',       now()),
    ('MS',   'Financials',                    now()),
    ('GS',   'Financials',                    now()),
    ('IXC',  'Energy',                        now()),
    ('XLE',  'Energy',                        now()),
    ('CRWV', 'AI / accelerated compute',      now()),
    ('MRVL', 'AI / accelerated compute',      now()),
    ('AMGN', 'Healthcare / defensives',       now()),
    ('NEE',  'Energy transition',             now()),
    ('ANF',  'Consumer / autos',              now()),
    ('ATAT', 'Consumer / autos',              now()),
    ('BKNG', 'Consumer / autos',              now()),
    ('CPER', 'Materials',                     now()),
    ('ADBE', 'Software / SaaS',               now()),
    ('INTU', 'Software / SaaS',               now()),
    ('PG',   'Consumer staples',              now()),
    ('ABEV', 'Consumer staples',              now()),
    ('AEE',  'Utilities / regulated',         now())
ON CONFLICT (symbol) DO UPDATE
    SET theme = EXCLUDED.theme, updated_at = now();

DO $$
DECLARE v_gap text;
BEGIN
    SELECT string_agg(h.symbol, ' ' ORDER BY h.symbol)
      INTO v_gap
      FROM public.vw_nexus_holdings h
      LEFT JOIN public.position_themes pt ON pt.symbol = h.symbol
     WHERE pt.theme IS NULL;
    IF v_gap IS NOT NULL THEN
        RAISE EXCEPTION 'held positions still unmapped to a theme: %', v_gap;
    END IF;
END $$;
