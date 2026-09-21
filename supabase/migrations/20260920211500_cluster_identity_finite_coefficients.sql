-- The eight fit coefficients and `avg_intra_rho` carried NO numeric CHECK at
-- all, so a non-finite value could be stored with nothing to refuse it.
--
-- TWO-SIDED, never a sentinel list. PostgreSQL sorts `numeric 'NaN'` ABOVE
-- every finite value, so a one-sided bound is NaN-permeable and
-- `IS DISTINCT FROM 'NaN'` still admits both infinities -- the correction
-- made four hours later on PR #783. The range refuses all three and leaves
-- NULL untouched (a NULL comparison yields NULL and a CHECK passes).
--
-- This is defence in depth behind the engine's own regressor guard, because
-- a gate applied at one consumer is missed by the next one, and this table is
-- what every surface reads. It is validated rather than NOT VALID: 206 rows,
-- 0 violate, and checking them is what proves the first write was coherent.
alter table public.cluster_identity
  add constraint ci_finite_coeff_ck check (
        (avg_intra_rho      is null or (avg_intra_rho      > '-Infinity'::numeric and avg_intra_rho      < 'Infinity'::numeric))
    and (beta_market        is null or (beta_market        > '-Infinity'::numeric and beta_market        < 'Infinity'::numeric))
    and (t_market           is null or (t_market           > '-Infinity'::numeric and t_market           < 'Infinity'::numeric))
    and (beta_cyclical      is null or (beta_cyclical      > '-Infinity'::numeric and beta_cyclical      < 'Infinity'::numeric))
    and (t_cyclical         is null or (t_cyclical         > '-Infinity'::numeric and t_cyclical         < 'Infinity'::numeric))
    and (beta_concentration is null or (beta_concentration > '-Infinity'::numeric and beta_concentration < 'Infinity'::numeric))
    and (t_concentration    is null or (t_concentration    > '-Infinity'::numeric and t_concentration    < 'Infinity'::numeric))
    and (beta_dollar        is null or (beta_dollar        > '-Infinity'::numeric and beta_dollar        < 'Infinity'::numeric))
    and (t_dollar           is null or (t_dollar           > '-Infinity'::numeric and t_dollar           < 'Infinity'::numeric))
  );

comment on constraint ci_finite_coeff_ck on public.cluster_identity is
'Two-sided finite range on every stored coefficient. A one-sided bound is NaN-permeable (numeric NaN sorts above every finite value) and IS DISTINCT FROM ''NaN'' admits both infinities. abs(NaN) > 2 is TRUE, so an unguarded NaN t-stat would clear the significance gate and be named the primary axis.';
