-- ============================================================
-- ATLAS Ledger — Phase 3: calibration views + drift monitor
--
-- vw_calibration       — conviction decile bins vs actual accuracy
--                        per horizon; over/under-confidence flags
-- vw_brier_trend       — rolling monthly Brier score (drift)
-- vw_devil_advocate    — worst calls + systematic bias signals
-- ============================================================

-- ── vw_calibration ─────────────────────────────────────────
create or replace view vw_calibration as
with raw as (
  select
    d.conviction,
    o.correct,
    o.alpha,
    o.horizon_days,
    o.snapshot_at
  from decision_outcomes o
  join decisions d on d.id = o.decision_id
  where o.correct is not null and d.conviction is not null
),
bins as (
  select
    (floor(conviction / 10) * 10)::int                           as bin_low,
    (floor(conviction / 10) * 10 + 9)::int                      as bin_high,
    round((floor(conviction / 10) * 10 + 5)::numeric / 100, 2)  as mid_prob,
    horizon_days,
    count(*)                                                      as n,
    round(avg(case when correct then 1.0 else 0.0 end)::numeric, 4)  as actual_accuracy,
    round(avg(alpha)::numeric * 100, 2)                          as avg_alpha_pct,
    -- Brier score for this bin
    round(avg((conviction::float/100 - case when correct then 1 else 0 end)^2)::numeric, 4) as brier
  from raw
  group by 1, 2, 3, 4
)
select *,
  case
    when mid_prob - actual_accuracy >  0.10 then 'over-confident'
    when actual_accuracy - mid_prob  >  0.10 then 'under-confident'
    else 'calibrated'
  end as calibration_flag,
  -- distance from the 45° perfect-calibration line
  round(abs(mid_prob - actual_accuracy)::numeric, 4) as calibration_error
from bins
order by horizon_days, bin_low;


-- ── vw_brier_trend ─────────────────────────────────────────
-- Monthly rolling Brier score to detect drift.
create or replace view vw_brier_trend as
select
  date_trunc('month', o.snapshot_at)::date  as month,
  o.horizon_days,
  count(*)                                   as n,
  round(avg((d.conviction::float/100
    - case when o.correct then 1 else 0 end)^2)::numeric, 4) as brier_score,
  round(avg(case when o.correct then 1.0 else 0.0 end)::numeric, 4) as accuracy,
  round(avg(o.alpha)::numeric * 100, 2) as avg_alpha_pct
from decision_outcomes o
join decisions d on d.id = o.decision_id
where o.correct is not null and d.conviction is not null
group by 1, 2
order by 1, 2;


-- ── vw_devil_advocate ──────────────────────────────────────
-- Surfaces the worst calls, systematic bias, and the spread
-- between stated conviction and realized accuracy.
create or replace view vw_devil_advocate as
with per_symbol as (
  select
    d.symbol,
    d.intent,
    count(*) as calls,
    round(avg(case when o.correct then 1.0 else 0.0 end)::numeric * 100, 1) as accuracy_pct,
    round(avg(o.alpha)::numeric * 100, 2) as avg_alpha_pct,
    round(avg(d.conviction)::numeric, 0) as avg_conviction,
    -- over-confidence: mean stated conviction >> mean actual accuracy
    round((avg(d.conviction::float/100)
      - avg(case when o.correct then 1.0 else 0.0 end))::numeric * 100, 1) as overconfidence_gap_pct
  from decision_outcomes o
  join decisions d on d.id = o.decision_id
  where o.correct is not null and d.conviction is not null
  group by d.symbol, d.intent
  having count(*) >= 2
),
worst as (
  select *, rank() over (order by avg_alpha_pct asc) as alpha_rank
  from per_symbol
),
-- portfolio-wide bias: are bullish calls systematically over/under-confident?
bias as (
  select
    case when d.intent in ('add','hold') then 'bullish' else 'bearish' end as stance,
    count(*) as n,
    round(avg(case when o.correct then 1.0 else 0.0 end)::numeric * 100, 1) as accuracy_pct,
    round(avg(d.conviction)::numeric, 0) as avg_conviction,
    round((avg(d.conviction::float/100)
      - avg(case when o.correct then 1.0 else 0.0 end))::numeric * 100, 1) as overconfidence_gap_pct
  from decision_outcomes o
  join decisions d on d.id = o.decision_id
  where o.correct is not null and d.conviction is not null
  group by 1
)
select 'worst_calls'::text as section, symbol, intent, calls, accuracy_pct, avg_alpha_pct,
       avg_conviction, overconfidence_gap_pct, alpha_rank, null::text as stance
from worst
where alpha_rank <= 10
union all
select 'bias'::text, null, null, n, accuracy_pct, null,
       avg_conviction, overconfidence_gap_pct, null, stance
from bias
order by section, alpha_rank nulls last, stance;
