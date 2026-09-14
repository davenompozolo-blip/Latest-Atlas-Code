-- B4, part 2 of 2. MCTR x Bench integrity.
--
-- Master spec section 7: "the top marginal risk contributor carrying a bending
-- thesis is one cell more actionable than the rest of a risk page combined."
-- This view is that join: risk contribution per held position against what the
-- Bench knows about why the position is held.
--
-- IT DOES NOT FLAG. The 2026-09-13 ruling section 8 defers E1.4 -- the
-- `premise_drifted` signal -- until E1.3 has been observed for 30 days. So
-- drift is PUBLISHED AS A MAGNITUDE and nothing here derives a verdict from
-- it. `thesis_coverage` classifies what is on file, which is a fact about the
-- Bench, not a judgement about the thesis.
--
-- DRIFT IS IN SIGMA, NEVER IN RAW SCORE. `vw_thesis_regime_drift.drift_score_20d`
-- is a difference of 20-session SUMS whose sd runs 4.19 (dollar) to 8.22
-- (cyclical), so raw magnitudes are not comparable across axes -- the third
-- place this codebase has hit that exact trap. On this book it inverts the
-- answer: raw drift ranks `cyclical` first at 6.725, but in sigma `dollar`
-- leads at 1.277 against cyclical's 0.818.
--
-- AND DRIFT ONLY COUNTS WHERE THE BOOK IS EXPOSED. An axis moving is only
-- evidence about a thesis if the book has measurable exposure to that axis, so
-- axes are gated on `book_factor_betas.significant` from the latest estimate.
-- `cyclical` fails that gate (t = 0.948) -- which is the SAME axis raw ranking
-- would have put on top, so the two rules agree on excluding it for
-- independent reasons.
--
-- NOT `factor_axes.marginal`, WHICH IS A DIFFERENT CONCEPT. That column means
-- the component barely cleared the Marchenko-Pastur noise edge -- a property of
-- the PCA, not of the book. `dollar` is marginal = true AND the most
-- significant exposure the book has (t = -10.111). Gating on `marginal` would
-- withhold the axis that matters most and publish the one that matters least.

create or replace view public.vw_position_risk_thesis as
with beta as (
  select factor, t_stat, significant
    from public.book_factor_betas
   where estimated_at = (select max(estimated_at) from public.book_factor_betas)
), drift as (
  select d.symbol,
         count(*) filter (where b.significant)                     as axes_exposed,
         count(*) filter (where not b.significant)                 as axes_no_exposure,
         max(abs(d.drift_score_20d) / nullif(d.score_20d_stdev_full,0))
           filter (where b.significant)                            as drift_sd_max,
         (array_agg(d.axis_key order by abs(d.drift_score_20d) / nullif(d.score_20d_stdev_full,0) desc)
            filter (where b.significant))[1]                       as drift_axis,
         bool_or(d.dispersion_changed) filter (where b.significant) as dispersion_changed_any,
         max(d.snapshot_at)                                         as snapshot_at
    from public.vw_thesis_regime_drift d
    join beta b on b.factor = d.axis_key
   group by d.symbol
)
select
  m.symbol,
  m.risk_rank,
  m.weight,
  m.vol_annual,
  m.mctr_annual,
  m.risk_contribution_annual,
  m.risk_share,
  m.book_vol_annual,

  -- What the Bench holds. `no_thesis` is its own class and is never folded in
  -- with a healthy thesis: a position carrying risk with nothing written down
  -- is a different state from one whose thesis is intact, and the whole value
  -- of this join is being able to see which.
  (t.symbol is not null)                     as has_thesis,
  case when t.symbol is null then 'no_thesis'
       else 'thesis_on_file' end             as thesis_coverage,
  t.thesis_state,
  t.claims_total,
  t.claims_confirmed,
  t.claims_contradicted,
  t.claims_pending,
  t.review_by,
  (t.review_by is not null and t.review_by < current_date) as review_overdue,

  -- E1 drift, as magnitudes. No verdict: E1.4 is deferred.
  d.drift_sd_max,
  d.drift_axis,
  d.axes_exposed,
  d.axes_no_exposure,
  d.dispersion_changed_any,
  d.snapshot_at                              as thesis_snapshot_at,

  m.n_measured,
  m.n_withheld,
  m.withheld_weight_pct,
  m.matrix_as_of
from public.vw_book_mctr m
left join public.vw_bench_thesis_state t on t.symbol = m.symbol
left join drift d on d.symbol = m.symbol;

comment on view public.vw_position_risk_thesis is
  'B4. Euler-additive risk contribution per held position joined to Bench thesis state and E1 axis drift. Drift is expressed in sigma and only over axes the book has measurable exposure to. Publishes magnitudes only -- E1.4 flagging is deferred by the 2026-09-13 ruling section 8.';
