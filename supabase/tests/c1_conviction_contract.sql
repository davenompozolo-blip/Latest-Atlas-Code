-- C-1 conviction contract. Read-only: every check is a select, nothing is
-- written, so it is safe to run through the management API as well as psql.
-- Each row is (check, ok); every ok must be true.

with checks(check_name, ok) as (values
  -- the formula
  ('no fundamental leg -> no score',
     atlas_conviction(null, 'Bull', null) is null),
  ('valuation + trend renormalises over the legs present',
     atlas_conviction(80, 'Bull', null) = 80),
  ('quality + trend renormalises over the legs present',
     atlas_conviction(null, 'Bull', 100) = 88),
  ('all three legs, weights 0.35 / 0.25 / 0.15',
     atlas_conviction(50, 'Neutral', 5 * 100.0 / 9) = 51),
  ('trend alone can never carry a score, whatever the trend',
     atlas_conviction(null, 'Wary', null) is null and atlas_conviction(null, 'Neutral', null) is null),
  ('basis names the legs',
     atlas_conviction_basis(null, null) = 'no_fundamental_leg'
     and atlas_conviction_basis(1, 1) = 'valuation+quality+trend'
     and atlas_conviction_basis(1, null) = 'valuation+trend'
     and atlas_conviction_basis(null, 1) = 'quality+trend'),

  -- the action
  ('an absent score has no action',
     atlas_recommended_action(null, 5) is null),
  ('a 75+ name at exactly 10.0% trims (the old CASE fell through to Exit)',
     atlas_recommended_action(80, 10) = 'Trim'),
  ('bands otherwise unchanged',
     atlas_recommended_action(80, 9.99) = 'Add'
     and atlas_recommended_action(65, 15) = 'Hold'
     and atlas_recommended_action(50, 5) = 'Trim'
     and atlas_recommended_action(44, 5) = 'Exit'),

  -- the F-Score: a 9-point score only from nine tests (EQ-9)
  ('fscore exists only where all nine tests resolved',
     not exists (select 1 from vw_company_piotroski where fscore is not null and determinable <> 9)),
  ('grade exists exactly when fscore does',
     not exists (select 1 from vw_company_piotroski where (grade is null) <> (fscore is null))),
  ('grade bands match qualityGradeView (7+ A-, 5-6 B, else C)',
     not exists (select 1 from vw_company_piotroski where fscore is not null and grade <>
        case when fscore >= 7 then 'A-' when fscore >= 5 then 'B' else 'C' end)),

  -- the stored analytics
  ('conviction is NULL exactly when there is no fundamental leg',
     not exists (select 1 from nexus_holdings_analytics
                  where (conviction_score is null) <> (conviction_basis = 'no_fundamental_leg'))),
  ('no action without a score',
     not exists (select 1 from nexus_holdings_analytics
                  where conviction_score is null and recommended_action is not null)),
  ('quality grade comes from a complete F-Score only',
     not exists (select 1 from nexus_holdings_analytics
                  where (quality_grade is null) <> (quality_fscore is null))),
  ('a stock scores the same in every account (no book terms)',
     not exists (select 1 from nexus_holdings_analytics a
                   join nexus_holdings_analytics b on a.symbol = b.symbol and a.portfolio_id < b.portfolio_id
                  where a.conviction_score is distinct from b.conviction_score
                     or a.quality_grade is distinct from b.quality_grade)),
  ('the insight never goes NULL on a missing grade',
     not exists (select 1 from nexus_holdings_analytics where nexus_insight is null)),
  ('the old matview is gone',
     to_regclass('public.mv_nexus_holdings') is null)
)
select check_name, ok from checks order by ok, check_name;
