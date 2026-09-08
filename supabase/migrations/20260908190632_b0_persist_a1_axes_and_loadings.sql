-- A1 eigenvectors, frozen.
--
-- Reproduced from market_prices rather than transcribed, because the spec
-- supplied variance_explained but not the loadings. The reproduction is exact
-- on the spec's own checksum: PCA of the 11x11 correlation matrix of daily log
-- returns of the 11 pairs (cper_gld excluded) over 2007-04-12..2026-09-04,
-- 4,882 balanced observations, gives
--     PC1 0.290810  PC2 0.195059  PC3 0.103176   -> 0.291 / 0.195 / 0.103
-- and exactly three eigenvalues above the Marchenko-Pastur edge
-- (1.0972 for N=11, T=4882), with PC3 at 1.1349 -- "barely cleared", as specified.
--
-- SIGN CONVENTION. An eigenvector is defined only up to sign and
-- variance_explained is sign-invariant, so A1's orientation is NOT recoverable
-- from the spec. Each axis is therefore oriented to point toward the thing it
-- is named for, and `label` states that direction so a loading is never read
-- without it:
--   cyclical      PC1 as computed  (already points cyclicals over defensives)
--   concentration PC2 negated      (raw points toward BREADTH: rsp/dia positive)
--   dollar        PC3 negated      (raw points toward a WEAK dollar: gold/EM up)
-- Flipping an axis flips only the sign of its own loadings and its own beta;
-- every acceptance diagnostic (R2, condition number, |t|, Durbin-Watson) is
-- sign-invariant.

insert into public.factor_axes
  (axis_key, label, pc_rank, variance_explained, marginal, estimation_start, estimation_end)
values
('cyclical','Cyclical risk-on (up = cyclicals & credit over defensives & gold)',1,0.290810,false,date '2007-04-11',date '2026-09-04'),
('concentration','Index concentration (up = leadership narrowing to mega-cap tech)',2,0.195059,false,date '2007-04-11',date '2026-09-04'),
('dollar','Dollar strength (up = stronger dollar; gold, EM and small caps pressured)',3,0.103176,true,date '2007-04-11',date '2026-09-04')
on conflict (axis_key) do update set
  label = excluded.label, pc_rank = excluded.pc_rank,
  variance_explained = excluded.variance_explained, marginal = excluded.marginal,
  estimation_start = excluded.estimation_start, estimation_end = excluded.estimation_end;

insert into public.factor_axis_loadings (axis_key, pair_key, loading) values
('cyclical','dia_spy',-0.106005142333),
('cyclical','eem_spy',0.158235965244),
('cyclical','gld_spy',-0.350304159283),
('cyclical','hyg_tlt',0.367681146405),
('cyclical','iwm_spy',0.320664376179),
('cyclical','qqq_spy',0.000149097683),
('cyclical','rsp_spy',0.243456954075),
('cyclical','xle_xlu',0.370359329376),
('cyclical','xlf_spy',0.325672947467),
('cyclical','xli_xlu',0.404650680077),
('cyclical','xly_xlp',0.369802423392),
('concentration','dia_spy',-0.472116361424),
('concentration','eem_spy',0.000123264896),
('concentration','gld_spy',-0.138666860790),
('concentration','hyg_tlt',0.046249805437),
('concentration','iwm_spy',-0.160709539657),
('concentration','qqq_spy',0.545876427833),
('concentration','rsp_spy',-0.465522180568),
('concentration','xle_xlu',-0.011134663684),
('concentration','xlf_spy',-0.319961296866),
('concentration','xli_xlu',0.094804402887),
('concentration','xly_xlp',0.322074471298),
('dollar','dia_spy',0.050229169407),
('dollar','eem_spy',-0.427015132198),
('dollar','gld_spy',-0.503951440891),
('dollar','hyg_tlt',0.371227062604),
('dollar','iwm_spy',-0.472447129448),
('dollar','qqq_spy',-0.276448573686),
('dollar','rsp_spy',-0.252363932601),
('dollar','xle_xlu',-0.059919278210),
('dollar','xlf_spy',0.197082991754),
('dollar','xli_xlu',-0.065339419395),
('dollar','xly_xlp',-0.115497172550)
on conflict (axis_key, pair_key) do update set loading = excluded.loading;
