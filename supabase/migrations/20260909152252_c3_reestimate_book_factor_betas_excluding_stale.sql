-- C3. B0 re-estimated on the C1-cleaned equity curve.
--
-- APPENDED, not corrected. book_factor_betas is append-only by trigger and the
-- 2026-09-08 estimate stays exactly as it was; the two sets are told apart by
-- estimated_at and by n_obs (174 prior, 168 here).
--
-- Sample: a return is kept only when BOTH of its endpoints are settled levels.
-- Excluding only the stale row's own return would leave the return OUT of it in
-- the sample, and that one is a two-day move labelled as one day -- the
-- provider computes the next day's change against the carried level. Six of the
-- 174 returns touch a stale level, so n falls to 168.
--
-- The 2025-12-24/26 pair at exactly 100,000.00 is NOT excluded. It is a
-- genuinely flat, undeployed account, not a carried-forward level, and C1
-- leaves it `settled` for that reason.
--
-- Everything else is unchanged from B0: frozen loadings, the same
-- standardisation baseline, SPY adj_close log returns as the market term, and
-- Newey-West (Bartlett) standard errors at lag floor(4*(T/100)^(2/9)) = 4,
-- which is 4 at both T=174 and T=168.
--
-- The prior estimate was reproduced first as a control, to 3.0e-12 on every
-- coefficient, so the two sets differ by the sample and nothing else.
--
-- NO SIGNIFICANCE VERDICT CHANGED. market rises 0.968 -> 1.026 (the
-- attenuation the zero returns were causing), concentration and dollar remain
-- significant, cyclical and alpha remain not significant. cyclical moves
-- further from significance (t 1.279 -> 0.948), not toward it.

insert into public.book_factor_betas
  (window_start, window_end, n_obs, factor, beta, std_error, t_stat, significant,
   r_squared, adj_r_squared)
select date '2025-12-26', date '2026-09-04', 168, v.factor, v.beta, v.se, v.t, v.sig,
       0.778109716915, 0.772664556593
from (values
  ('alpha',         -0.000917890495, 0.000634557239,  -1.446505435667, false),
  ('market',         1.026261530509, 0.148147570296,   6.927292350868, true),
  ('cyclical',       0.000496309675, 0.000523604808,   0.947870737724, false),
  ('concentration',  0.001108815986, 0.000398214750,   2.784467391962, true),
  ('dollar',        -0.004763141529, 0.000471099924, -10.110682013911, true)
) as v(factor, beta, se, t, sig);
