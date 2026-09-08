-- B0 section 4. Full available book history: 174 daily log returns from 175
-- equity levels, 2025-12-26 .. 2026-09-04, no gaps.
--
-- Standard errors are Newey-West (Bartlett kernel), lag L=4 from the rule of
-- thumb floor(4*(T/100)^(2/9)) at T=174. Verified against statsmodels
-- HAC(maxlags=4, use_correction=False): agreement to 1e-7 on every coefficient
-- and standard error.
--
-- HAC matters most for the market beta: its OLS standard error is 0.0996 and
-- its Newey-West one 0.1444, so OLS would have overstated t by 45% (9.72 vs
-- 6.70). No significance verdict changes under either, but the market beta is
-- materially less precise than OLS claims.
--
-- Book-return rho(1) is -0.074 and Durbin-Watson 2.133 -- mild NEGATIVE serial
-- correlation, not the positive autocorrelation the spec anticipated. HAC is
-- still the right choice; it simply widens rather than narrows here.

insert into public.book_factor_betas
  (window_start, window_end, n_obs, factor, beta, std_error, t_stat, significant,
   r_squared, adj_r_squared)
select date '2025-12-26', date '2026-09-04', 174, v.factor, v.beta, v.se, v.t, v.sig,
       0.770033572237, 0.764590579864
from (values
  ('alpha',         -0.000802145299, 0.000604166856,  -1.327688355931, false),
  ('market',         0.968233954623, 0.144441620857,   6.703289182698, true),
  ('cyclical',       0.000652949904, 0.000510552018,   1.278909652641, false),
  ('concentration',  0.001205347185, 0.000390049701,   3.090239990438, true),
  ('dollar',        -0.004759371509, 0.000460083450, -10.344583161676, true)
) as v(factor, beta, se, t, sig);
