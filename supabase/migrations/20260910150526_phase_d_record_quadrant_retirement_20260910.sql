-- Phase D, 2026-09-10. Record the quadrant retirement in the database.
--
-- NO TABLE IS DROPPED AND NO LABEL IS DELETED. In fact no table held the
-- retired object at all: the Growth x Inflation classification was computed
-- live in api/macro.js (classifyRegime -- UNRATE + CPI, four hardcoded
-- branches, a per-branch confidence literal) and never persisted.
--
-- market_regime_windows is a DIFFERENT object and is explicitly NOT retired.
-- It is a hand-authored set of dated historical windows, and its second row
-- ('Tariff Shock') is not a quadrant at all. It is consumed by the Regime
-- Slicer, risk-v2 and api/trade-sync, all of which keep working. The comment
-- below exists so a future reader does not conflate the two because some of
-- the names coincide.
comment on table public.market_regime_windows is
'Hand-authored dated market windows used to slice performance and risk history (Regime Slicer, risk-v2, api/trade-sync). NOT the retired Growth x Inflation quadrant: some names coincide but this is a period labelling, and "Tariff Shock" is not a quadrant. The quadrant was never stored -- it was computed live in api/macro.js classifyRegime() and was retired from every surface on 2026-09-10 (Phase D), superseded by factor_axes / factor_axis_scores / book_factor_betas.';

comment on table public.factor_axes is
'The three intermarket axes (A1/B0) that supersede the Growth x Inflation quadrant retired on 2026-09-10. Render direction from positive_means, never from the axis key; audit sign provenance with pc_sign_flipped. An axis whose latest book_factor_betas row is not significant renders "no measurable exposure", never the number.';
