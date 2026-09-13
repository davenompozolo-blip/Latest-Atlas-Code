-- E1.3 renders the three axes in factor_axes.pc_rank order, so the view has
-- to publish the rank. Without it the surface falls back to alphabetical --
-- concentration, cyclical, dollar -- which is not the axis order anywhere
-- else in the product and would silently disagree with the A2 panel.
--
-- Appended at the END of the select list: CREATE OR REPLACE VIEW can add
-- columns only at the end, and every existing column keeps its position and
-- type, so no consumer moves.

create or replace view public.vw_thesis_regime_drift as
with latest_snapshot as (
    -- The most recent snapshot per thesis per axis. A revision writes a new
    -- snapshot_at, so drift is always measured from the CURRENT premise, not
    -- from the thesis's original one.
    select distinct on (s.thesis_id, s.axis_key)
           s.thesis_id, s.axis_key, s.snapshot_at, s.snapshot_reason,
           s.score_date as snapshot_score_date,
           s.score_20d  as snapshot_score_20d,
           s.score_60d  as snapshot_score_60d,
           s.dispersion_state as snapshot_dispersion_state,
           s.logic_version
      from public.thesis_regime_snapshots s
     order by s.thesis_id, s.axis_key, s.snapshot_at desc, s.id desc
),
current_date_row as (
    select max(date) as d from public.factor_axis_scores
),
current_scores as (
    select s.axis_key, s.date as current_score_date,
           s.score_20d as current_score_20d,
           s.score_60d as current_score_60d
      from public.factor_axis_scores s, current_date_row c
     where s.date = c.d
),
current_dispersion as (
    select public.atlas_axis_dispersion_state((select d from current_date_row)) as st
),
-- Scale context, so a drift figure is readable. score_20d is a rolling
-- 20-session SUM, not a sigma level, so "8.5" means nothing on its own. This is
-- the full-history standard deviation of that column per axis, published as
-- CONTEXT -- it is not a z-score of the drift and must not be rendered as one.
axis_scale as (
    select axis_key, round(stddev_samp(score_20d)::numeric, 4) as score_20d_stdev_full
      from public.factor_axis_scores group by axis_key
)
select
    bc.id                                   as thesis_id,
    bc.symbol,
    bc.status                               as thesis_status,
    bc.claim_text,
    bc.created_at                           as thesis_created_at,
    ls.axis_key,
    a.label                                 as axis_label,
    a.positive_means,
    a.marginal                              as axis_marginal,
    ls.snapshot_at,
    ls.snapshot_reason,
    ls.snapshot_score_date,
    ls.snapshot_score_20d,
    cs.current_score_date,
    cs.current_score_20d,
    (cs.current_score_20d - ls.snapshot_score_20d)          as drift_score_20d,
    abs(cs.current_score_20d - ls.snapshot_score_20d)       as drift_abs,
    sc.score_20d_stdev_full,
    -- Sign flip is the readable event: the axis was positive when the thesis
    -- was written and is negative now, or the reverse. Reported separately from
    -- magnitude because a small move across zero and a large move within one
    -- sign are different things.
    (sign(ls.snapshot_score_20d) <> sign(cs.current_score_20d)
        and ls.snapshot_score_20d <> 0 and cs.current_score_20d <> 0) as sign_flipped,
    ls.snapshot_dispersion_state,
    cd.st                                                   as current_dispersion_state,
    (cd.st is distinct from ls.snapshot_dispersion_state)   as dispersion_changed,
    (cs.current_score_date - ls.snapshot_score_date)        as sessions_span_days,
    ls.logic_version,
    -- E1.3: render order. Appended last so existing positions are untouched.
    a.pc_rank
  from public.bench_claims bc
  join latest_snapshot   ls on ls.thesis_id = bc.id
  join public.factor_axes a  on a.axis_key  = ls.axis_key
  left join current_scores cs on cs.axis_key = ls.axis_key
  left join axis_scale     sc on sc.axis_key = ls.axis_key
  cross join current_dispersion cd
 -- Open theses only. A broken, confirmed, contradicted or expired thesis is
 -- settled; its premise moving is no longer a question anyone acts on.
 where bc.status in ('pending', 'untested', 'intact', 'bending');

comment on view public.vw_thesis_regime_drift is
'E1.2 -- per open bench_claims thesis per axis: the axis score it was written under, the current score, the drift between them, and whether the cross-axis dispersion state has changed since. Displays only: there is no premise_drifted flag in v1 (Master Build Spec §6.1 E1.3, and §10.3 reserves the flagging decision). score_20d_stdev_full is scale context for reading drift_score_20d, NOT a z-score. pc_rank is published so a surface can order the axes as the rest of the product does.';

grant select on public.vw_thesis_regime_drift to anon, authenticated;
