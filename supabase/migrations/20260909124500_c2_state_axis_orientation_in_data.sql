-- C2. State each axis's orientation in the data, not only in prose.
--
-- The stored orientation is CORRECT and is not changed here. No axis is
-- renamed and no loading is flipped: negating an axis would invalidate every
-- stored score in factor_axis_scores and every beta in book_factor_betas,
-- which is an append-only history that cannot be restated. The ambiguity was
-- only ever in the documentation, so it is fixed there.
--
-- `label` already carried the direction in prose. Two columns make it
-- machine-readable, so a surface renders direction by reading a field rather
-- than by parsing a sentence or inferring from the key:
--
--   positive_means   what a positive score indicates, in plain language
--   pc_sign_flipped  true where the stored loadings negate the raw eigenvector
--
-- pc_sign_flipped is relative to the derivation recorded in
-- 20260908190632_b0_persist_a1_axes_and_loadings.sql -- cyclical PC1 as
-- computed, concentration PC2 negated, dollar PC3 negated. It is provenance,
-- not a control: an eigenvector's raw sign is solver-dependent, so this column
-- says how the stored vector was reached, while `positive_means` says what it
-- means. Read positive_means to render; read pc_sign_flipped to audit.

alter table public.factor_axes
  add column positive_means  text,
  add column pc_sign_flipped boolean;

update public.factor_axes set
  positive_means = 'risk appetite rising: cyclicals, credit and inflation-sensitives leading, gold lagging',
  pc_sign_flipped = false
where axis_key = 'cyclical';

update public.factor_axes set
  positive_means = 'leadership narrowing into mega-cap growth; QQQ/SPY rising, DIA/SPY and RSP/SPY falling',
  pc_sign_flipped = true
where axis_key = 'concentration';

update public.factor_axes set
  positive_means = 'dollar strengthening; EEM/SPY, GLD/SPY and IWM/SPY falling',
  pc_sign_flipped = true
where axis_key = 'dollar';

alter table public.factor_axes
  alter column positive_means  set not null,
  alter column pc_sign_flipped set not null;

-- NOT NULL alone would admit an empty string, which reads as "documented"
-- while saying nothing. Same guard as market_instruments.caveats in A0.
alter table public.factor_axes
  add constraint factor_axes_positive_means_nonblank_ck
  check (length(btrim(positive_means)) > 0);

comment on column public.factor_axes.positive_means is
  'What a positive axis score indicates, in plain language. Any surface rendering an axis reads this rather than inferring direction from axis_key.';
comment on column public.factor_axes.pc_sign_flipped is
  'True where the stored loadings negate the raw eigenvector of the A1 derivation (see 20260908190632). Provenance for auditing the orientation, not a rendering control -- use positive_means for that.';
