-- B1 · first validation run against the C3 estimate set (2026-09-09, n=168).
-- Figures produced by the reproduction + diagnostics script; see
-- docs/B1_FACTOR_MODEL_VALIDATION_REPORT.md for method and reading.

insert into public.book_model_diagnostics (
  betas_estimated_at, window_start, window_end, n_obs,
  sigma_pred, sigma_pred_factor, sigma_pred_residual,
  sigma_realised_20d_mean, sigma_realised_60d_mean, sigma_realised_full,
  bias_ratio, bias_20d_mean, bias_20d_min, bias_20d_max, bias_60d_mean,
  bias_20d_share_outside,
  arch_lm_p, arch_lm_lags, ljung_box_p, ljung_box_sq_p, jarque_bera_p,
  skew, excess_kurtosis, stability, axis_correlations, logic_version, notes
) values (
  timestamptz '2026-09-09 15:22:52.968575+00',
  date '2025-12-26', date '2026-09-04', 168,
  0.016635113868003957, 0.014634133189574662, 0.007910066952387116,
  0.016915673308950756, 0.018407302591017740, 0.016590007561959053,
  0.9972884882903229, 1.0168654956721652, 0.4957515260493656, 1.6163695046457436,
  1.1065330082544498,
  0.4758,
  0.3709275185063172, 5, 0.0021900116771929046, 0.32655425603007937,
  3.0385827509728137e-19,
  0.5375202468747651, 3.3206166957061054,
  jsonb_build_object(
    'split', 'halves of the estimation window, Newey-West errors',
    'half1_window', jsonb_build_array('2025-12-26','2026-04-30'),
    'half2_window', jsonb_build_array('2026-05-01','2026-09-04'),
    'half1_n', 84, 'half2_n', 84,
    'half1_r2', 0.6922, 'half2_r2', 0.8503,
    'factors', jsonb_build_array('alpha','market','cyclical','concentration','dollar'),
    'half1_beta', jsonb_build_array(-0.00121841, 1.05262649, 0.00005209, 0.00036573, -0.00370139),
    'half1_se',   jsonb_build_array( 0.00097513, 0.24659274, 0.00088443, 0.00084968,  0.00085487),
    'half2_beta', jsonb_build_array(-0.00044512, 1.15137355, 0.00017243, 0.00090062, -0.00552290),
    'half2_se',   jsonb_build_array( 0.00073978, 0.12535808, 0.00085708, 0.00048296,  0.00058371),
    'ci_overlap', jsonb_build_object('alpha', true, 'market', true, 'cyclical', true,
                                     'concentration', true, 'dollar', true)),
  jsonb_build_object(
    'note', 'near-orthogonality is a FULL-SAMPLE property and does not transfer to sub-windows',
    'full', jsonb_build_object('market/cyclical', 0.3217, 'market/concentration', 0.5861,
                               'market/dollar', -0.3726, 'cyclical/concentration', 0.0631,
                               'cyclical/dollar', 0.0126, 'concentration/dollar', -0.3087),
    'half1', jsonb_build_object('market/cyclical', 0.3791, 'market/concentration', 0.5002,
                                'market/dollar', -0.2571, 'cyclical/concentration', -0.0523,
                                'cyclical/dollar', 0.1973, 'concentration/dollar', 0.0617),
    'half2', jsonb_build_object('market/cyclical', 0.2299, 'market/concentration', 0.6877,
                                'market/dollar', -0.5058, 'cyclical/concentration', 0.2000,
                                'cyclical/dollar', -0.2618, 'concentration/dollar', -0.5538)),
  'v1',
  'First B1 run. The C3 estimate set was reproduced from scratch to 4.6e-13 on every '
  || 'coefficient before anything was measured. ARCH is NOT significant at any lag 1-20 '
  || '(p 0.37-0.97), so the expected volatility-clustering defect is absent. Ljung-Box on the '
  || 'residual level fires at p=0.0022 but is outlier-driven: dropping the three largest '
  || 'residuals takes it to p=0.2954, and the significant autocorrelations sit at lags 6/7/9 '
  || 'with no short-lag structure, so it is not read as a missing factor. The real finding is '
  || 'distributional: excess kurtosis 3.32, skew +0.54, Jarque-Bera p=3e-19, one 5.0-sigma day '
  || '(2026-03-18). bias_ratio 0.997 is an in-sample identity and carries no information; '
  || '47.6% of rolling 20d windows fall outside 0.8-1.2 and 20d realised vol spans 13.1%-42.7% '
  || 'annualised (3.26x), which is what a constant sigma cannot track. IN-SAMPLE ONLY: n=168 '
  || 'admits no honest holdout.'
);
