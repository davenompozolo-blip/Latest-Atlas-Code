create or replace view vw_funding_sleeve as
with candidates as (
  select
    tk,
    theme,
    conviction,
    weight_pct,
    fv_gap_pct,
    contrib_pct,
    stale,
    fv_trustworthy,
    -- funding score: low conviction and rich valuation make a good funding source;
    -- negative contributors get a mild boost, positive carriers a mild penalty
    (
      (50 - conviction) * 1.0
      + coalesce(-fv_gap_pct, 0) * 0.5
      + case when contrib_pct < 0 then 5 else -5 end
    ) as funding_score,
    case
      when stale then 'stale price data'
      when conviction >= 40 then 'high conviction - protected'
      when weight_pct < 0.75 then 'position too small to fund from'
      else null
    end as disqualification_reason
  from nexus_holdings
  where weight_pct > 0
)
select
  tk,
  theme,
  conviction,
  weight_pct,
  fv_gap_pct,
  contrib_pct,
  fv_trustworthy,
  funding_score,
  disqualification_reason,
  (disqualification_reason is null) as qualified,
  rank() over (
    partition by (disqualification_reason is null)
    order by funding_score desc
  ) as sleeve_rank
from candidates
order by qualified desc, sleeve_rank;
