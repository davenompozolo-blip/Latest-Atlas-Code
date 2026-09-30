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

alter table public.ratio_pairs rename column dimension to dimension_deprecated;

comment on column public.ratio_pairs.dimension_deprecated is
'DEPRECATED 2026-09-10 (A2.2 2.2). Provisional grouping carried over from the source documents, retained as a record of what was believed before Phase A1. A1 disproved three of the four: xle_xlu is cyclical not safe_haven, iwm_spy is dollar/cyclical not breadth, and growth_inflation splits across all three axes. SUCCESSOR: factor_axis_loadings, which is derived rather than authored and carries a signed loading per pair per axis. Do not read this column, and do not repopulate it with axis names.';
