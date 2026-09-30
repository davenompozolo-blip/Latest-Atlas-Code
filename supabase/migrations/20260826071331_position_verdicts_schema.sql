CREATE TABLE IF NOT EXISTS public.position_verdicts (
  verdict_id            bigserial primary key,
  as_of                 date        not null,
  logic_version         text        not null,
  asset_id              uuid        not null references public.assets(id),
  symbol                text        not null,
  position_state        text        not null,
  side                  text        not null,
  verdict_status        text        not null,
  status_reason         text,
  price_days_old        int,
  last_measurable_date  date,
  first_entry_date      date,
  days_held             int,
  capital_deployed_usd  numeric,
  position_mwr_pct      numeric,
  position_twr_pct      numeric,
  annualised_return     numeric,
  entry_price           numeric,
  entry_efficiency_score numeric,
  peer_basis            text        not null,
  cluster_threshold_rho numeric     not null,
  cluster_id            int,
  cluster_members       text[],
  cluster_size          int,
  avg_intra_rho         numeric,
  peer_window_start     date,
  peer_window_end       date,
  cf_median_return_pct  numeric,
  cf_best_return_pct    numeric,
  cf_best_symbol        text,
  cf_basket_return_pct  numeric,
  selection_effect_pct  numeric,
  allocation_effect_pct numeric,
  interaction_effect_pct numeric,
  regret_vs_best_pct    numeric,
  position_vol_annual   numeric,
  cluster_vol_annual    numeric,
  selection_effect_vol_adj numeric,
  marginal_vol_contribution numeric,
  dollar_var_95_daily   numeric,
  cluster_risk_share    numeric,
  rank_in_cluster       int,
  verdict_label         text,
  suggested_reason_code text,
  computed_at           timestamptz not null default now(),
  unique (as_of, asset_id, logic_version)
);

CREATE INDEX IF NOT EXISTS position_verdicts_as_of_version_idx
    ON public.position_verdicts (as_of desc, logic_version);
CREATE INDEX IF NOT EXISTS position_verdicts_asset_as_of_idx
    ON public.position_verdicts (asset_id, as_of desc);

ALTER TABLE public.position_verdicts
  ADD COLUMN IF NOT EXISTS ranking_basis          text not null default 'mwr',
  ADD COLUMN IF NOT EXISTS engine_status          text,
  ADD COLUMN IF NOT EXISTS status_detail          text,
  ADD COLUMN IF NOT EXISTS cluster_eligible       boolean not null default false,
  ADD COLUMN IF NOT EXISTS cf_book_return_pct     numeric,
  ADD COLUMN IF NOT EXISTS excess_vs_book_pct     numeric,
  ADD COLUMN IF NOT EXISTS best_correlate_rho     numeric,
  ADD COLUMN IF NOT EXISTS best_correlate_symbol  text,
  ADD COLUMN IF NOT EXISTS conviction_at_entry    numeric,
  ADD COLUMN IF NOT EXISTS confidence_at_entry    numeric,
  ADD COLUMN IF NOT EXISTS family_code_at_entry   text,
  ADD COLUMN IF NOT EXISTS thesis_state           text,
  ADD COLUMN IF NOT EXISTS thesis_state_as_of     date,
  ADD COLUMN IF NOT EXISTS frozen_weight_return_pct numeric,
  ADD COLUMN IF NOT EXISTS trading_effect_pct       numeric,
  ADD COLUMN IF NOT EXISTS coherence_at_entry     numeric,
  ADD COLUMN IF NOT EXISTS cluster_dispersion     numeric,
  ADD COLUMN IF NOT EXISTS evidence_own_return_known boolean not null default true,
  ADD COLUMN IF NOT EXISTS evidence_staleness_days   int;

ALTER TABLE public.position_verdicts DROP CONSTRAINT IF EXISTS position_verdicts_status_ck;
ALTER TABLE public.position_verdicts ADD CONSTRAINT position_verdicts_status_ck
  CHECK (verdict_status IN ('measured','one_sided','stale_mark','ledger_mismatch'));

ALTER TABLE public.position_verdicts DROP CONSTRAINT IF EXISTS position_verdicts_peer_basis_ck;
ALTER TABLE public.position_verdicts ADD CONSTRAINT position_verdicts_peer_basis_ck
  CHECK (peer_basis IN ('cluster','book','none'));

ALTER TABLE public.position_verdicts DROP CONSTRAINT IF EXISTS position_verdicts_ranking_basis_ck;
ALTER TABLE public.position_verdicts ADD CONSTRAINT position_verdicts_ranking_basis_ck
  CHECK (ranking_basis IN ('mwr','since_entry'));

ALTER TABLE public.position_verdicts DROP CONSTRAINT IF EXISTS position_verdicts_cluster_basis_ck;
ALTER TABLE public.position_verdicts ADD CONSTRAINT position_verdicts_cluster_basis_ck
  CHECK (peer_basis <> 'cluster' OR cluster_eligible);

ALTER TABLE public.position_verdicts DROP CONSTRAINT IF EXISTS position_verdicts_cluster_eligible_ck;
ALTER TABLE public.position_verdicts ADD CONSTRAINT position_verdicts_cluster_eligible_ck
  CHECK (
    NOT cluster_eligible
    OR (cluster_threshold_rho >= 0.75 AND cluster_size >= 5 AND avg_intra_rho >= 0.75)
  );

ALTER TABLE public.position_verdicts DROP CONSTRAINT IF EXISTS position_verdicts_label_ck;
ALTER TABLE public.position_verdicts ADD CONSTRAINT position_verdicts_label_ck
  CHECK (
    (verdict_label IS NULL OR verdict_label IN ('leader','holding_own','lagging','cut_candidate'))
    AND (verdict_label <> 'cut_candidate' OR verdict_status = 'measured')
  );

ALTER TABLE public.position_verdicts DROP CONSTRAINT IF EXISTS position_verdicts_reason_ck;
ALTER TABLE public.position_verdicts ADD CONSTRAINT position_verdicts_reason_ck
  CHECK (
    (suggested_reason_code IS NULL OR verdict_status = 'measured')
    AND (suggested_reason_code IS NULL OR suggested_reason_code IN (
          'switch_to_cluster_leader',
          'cut_underperforming_comparables',
          'trim_concentration',
          'add_on_conviction',
          'exit_thesis_broken',
          'exit_unmeasurable'))
    AND (suggested_reason_code <> 'switch_to_cluster_leader' OR peer_basis = 'cluster')
  );

ALTER TABLE public.position_verdicts DROP CONSTRAINT IF EXISTS position_verdicts_annualisation_floor_ck;
ALTER TABLE public.position_verdicts ADD CONSTRAINT position_verdicts_annualisation_floor_ck
  CHECK (annualised_return IS NULL OR days_held >= 90);

ALTER TABLE public.position_verdicts DROP CONSTRAINT IF EXISTS position_verdicts_evidence_ck;
ALTER TABLE public.position_verdicts ADD CONSTRAINT position_verdicts_evidence_ck
  CHECK (evidence_own_return_known = (verdict_status = 'measured'));

ALTER TABLE public.position_verdicts DROP CONSTRAINT IF EXISTS position_verdicts_state_ck;
ALTER TABLE public.position_verdicts ADD CONSTRAINT position_verdicts_state_ck
  CHECK (position_state IN ('open','closed'));

CREATE TABLE IF NOT EXISTS public.book_risk_daily (
  as_of                     date        not null,
  logic_version             text        not null,
  total_vol_annual          numeric,
  book_var_95_daily         numeric,
  sum_contributions         numeric,
  residual                  numeric,
  effective_bets            numeric,
  cluster_shares            jsonb,
  unmapped_theme_weight     numeric,
  cluster_threshold_rho     numeric     not null,
  traded_book_return_pct    numeric,
  frozen_book_return_pct    numeric,
  trading_effect_pct        numeric,
  positions_cluster_eligible int,
  positions_no_correlate     int,
  computed_at               timestamptz not null default now(),
  primary key (as_of, logic_version)
);

ALTER TABLE public.position_verdicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_risk_daily   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS position_verdicts_read ON public.position_verdicts;
CREATE POLICY position_verdicts_read ON public.position_verdicts
    FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS position_verdicts_service ON public.position_verdicts;
CREATE POLICY position_verdicts_service ON public.position_verdicts
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS book_risk_daily_read ON public.book_risk_daily;
CREATE POLICY book_risk_daily_read ON public.book_risk_daily
    FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS book_risk_daily_service ON public.book_risk_daily;
CREATE POLICY book_risk_daily_service ON public.book_risk_daily
    FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.position_verdicts TO anon, authenticated;
GRANT SELECT ON public.book_risk_daily   TO anon, authenticated;
GRANT ALL    ON public.position_verdicts TO service_role;
GRANT ALL    ON public.book_risk_daily   TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.position_verdicts_verdict_id_seq TO service_role;
