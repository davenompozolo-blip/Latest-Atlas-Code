-- A2.2 §2 -- correct the ratio_pairs metadata layer before anything reads it.
--
-- Two changes: `thesis` becomes a plain-language statement of what the pair
-- MEASURES (it is rendered above the chart, read before the shape), and
-- `dimension` is retired.

-- -- §2.1 what each pair measures ---------------------------------------------
-- Present tense, one sentence, no jargon. Written to be read by someone who has
-- not memorised the taxonomy.
update public.ratio_pairs set thesis = v.t from (values
  ('xli_xlu', 'Physical industrial expansion against defensive yield-seeking.'),
  ('hyg_tlt', 'Appetite for credit risk against the safety of duration.'),
  ('xly_xlp', 'Consumer willingness to spend against defensive staples demand.'),
  ('xle_xlu', 'Energy-led inflation pressure against rate-sensitive defensives.'),
  ('xlf_spy', 'Bank profitability and credit conditions against the broad market.'),
  ('qqq_spy', 'Appetite for long-duration growth against broad equity beta.'),
  ('rsp_spy', 'Breadth of participation against mega-cap concentration.'),
  ('dia_spy', 'Old-economy blue chips against a tech-weighted market.'),
  ('iwm_spy', 'Domestic small-cap risk tolerance against large-cap safety.'),
  ('eem_spy', 'International growth and a weak dollar against US insulation.'),
  ('gld_spy', 'Macro hedging demand against risk assets.'),
  ('cper_gld', 'Global physical growth against monetary hedging.')
) as v(k, t) where ratio_pairs.pair_key = v.k;

comment on column public.ratio_pairs.thesis is
'What the pair MEASURES, in plain language -- rendered above the chart in the A2.2 pair explorer. Superseded the earlier "what a RISING ratio is claimed to indicate" wording, which was a claim under test rather than a description.';

-- -- §2.2 retire `dimension` ---------------------------------------------------
-- RENAMED, NOT DROPPED. The provisional labels are a record of what the source
-- documents believed before A1 tested it, and this codebase does not delete
-- history it can flag instead. The rename is what stops a future surface
-- reading it: `dimension` is a name something would plausibly select;
-- `dimension_deprecated` is not.
--
-- A1 contradicted three of the four groupings outright:
--   xle_xlu   filed 'safe_haven'        -- loads +0.370 on CYCLICAL
--   iwm_spy   filed 'breadth'           -- loads -0.472 on DOLLAR, +0.321 cyclical
--   growth_inflation                    -- its members split across all three axes
--
-- Keeping a contradictory parallel classification beside factor_axis_loadings
-- guarantees something eventually reads the wrong one. It is NOT repopulated
-- with axis names: the axis mapping has a home and does not need a second one.
alter table public.ratio_pairs rename column dimension to dimension_deprecated;

comment on column public.ratio_pairs.dimension_deprecated is
'DEPRECATED 2026-09-10 (A2.2 §2.2). Provisional grouping carried over from the source documents, retained as a record of what was believed before Phase A1. A1 disproved three of the four: xle_xlu is cyclical not safe_haven, iwm_spy is dollar/cyclical not breadth, and growth_inflation splits across all three axes. SUCCESSOR: factor_axis_loadings, which is derived rather than authored and carries a signed loading per pair per axis. Do not read this column, and do not repopulate it with axis names.';

-- The CHECK travels with the rename. It is left in place so the retained values
-- stay valid rather than becoming free text.
