-- B-09: screener fundamentals showed "—" because vw_screener filtered
-- equity_cache to expires_at > now()-48h, but the universe-rotation sync only
-- refreshes each symbol every ~10 days, so most entries were excluded. Also,
-- most metrics live under Finnhub's payload.metric.* keys (peTTM/evEbitdaTTM/pb)
-- which the view did not read. Fix: relax freshness to 21d and add metric.*
-- RATIO fallbacks (ratios only — ROE/RevGrowth/Div skipped on purpose because
-- Finnhub stores them as percents vs AV's fractions, a scale trap).
-- Applied as a DO block over the live definition to avoid transcription error.
DO $$
DECLARE d text;
BEGIN
  d := pg_get_viewdef('vw_screener'::regclass, true);
  d := replace(d, '(now() - ''48:00:00''::interval)', '(now() - ''21 days''::interval)');
  d := replace(d,
    'COALESCE((ec.payload ->> ''PERatio''::text)::numeric, ((ec.payload -> ''overview''::text) ->> ''PERatio''::text)::numeric) AS pe_ratio',
    'COALESCE((ec.payload ->> ''PERatio''::text)::numeric, ((ec.payload -> ''overview''::text) ->> ''PERatio''::text)::numeric, ((ec.payload -> ''metric''::text) ->> ''peTTM''::text)::numeric) AS pe_ratio');
  d := replace(d,
    'COALESCE((ec.payload ->> ''EVToEBITDA''::text)::numeric, ((ec.payload -> ''overview''::text) ->> ''EVToEBITDA''::text)::numeric) AS ev_ebitda',
    'COALESCE((ec.payload ->> ''EVToEBITDA''::text)::numeric, ((ec.payload -> ''overview''::text) ->> ''EVToEBITDA''::text)::numeric, ((ec.payload -> ''metric''::text) ->> ''evEbitdaTTM''::text)::numeric) AS ev_ebitda');
  d := replace(d,
    'COALESCE((ec.payload ->> ''PriceToBookRatio''::text)::numeric, ((ec.payload -> ''overview''::text) ->> ''PriceToBookRatio''::text)::numeric) AS pb_ratio',
    'COALESCE((ec.payload ->> ''PriceToBookRatio''::text)::numeric, ((ec.payload -> ''overview''::text) ->> ''PriceToBookRatio''::text)::numeric, ((ec.payload -> ''metric''::text) ->> ''pb''::text)::numeric) AS pb_ratio');
  EXECUTE 'CREATE OR REPLACE VIEW vw_screener AS ' || d;
END $$;
