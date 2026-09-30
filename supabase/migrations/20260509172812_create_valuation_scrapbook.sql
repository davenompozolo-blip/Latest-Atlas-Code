
-- TABLE 1: scrapbook_companies
CREATE TABLE public.scrapbook_companies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker              text NOT NULL,
  company_name        text,
  exchange            text,
  sector              text,
  currency            text NOT NULL DEFAULT 'USD',
  current_price       numeric,
  market_cap          text,
  thesis_summary      text,
  conviction_rating   text CHECK (
    conviction_rating IN ('Strong Buy', 'Buy', 'Hold', 'Avoid', 'Under Review')
  ),
  fair_value_low      numeric,
  fair_value_high     numeric,
  avg_fair_value      numeric,
  run_count           integer NOT NULL DEFAULT 0,
  last_run_at         timestamptz,
  tags                text[] DEFAULT '{}',
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticker)
);

-- TABLE 2: scrapbook_snapshots
CREATE TABLE public.scrapbook_snapshots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.scrapbook_companies(id)
                        ON DELETE CASCADE,
  method              text NOT NULL CHECK (
    method IN ('DCF', 'DDM', 'EV_EBITDA', 'Residual_Income', 'Monte_Carlo')
  ),
  method_label        text,
  inputs              jsonb NOT NULL DEFAULT '{}',
  assumptions         jsonb NOT NULL DEFAULT '{}',
  implied_price       numeric NOT NULL,
  current_price_at_save numeric,
  upside_pct          numeric,
  implied_ev          numeric,
  terminal_value      numeric,
  intrinsic_value     numeric,
  analyst_note        text,
  narrative_id        uuid,
  run_date            date NOT NULL DEFAULT CURRENT_DATE,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scrapbook_snapshots_company_id
  ON public.scrapbook_snapshots(company_id);
CREATE INDEX idx_scrapbook_snapshots_method
  ON public.scrapbook_snapshots(company_id, method);

-- TABLE 3: scrapbook_narratives
CREATE TABLE public.scrapbook_narratives (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.scrapbook_companies(id)
                        ON DELETE CASCADE,
  snapshot_ids        uuid[] NOT NULL,
  methods_included    text[] NOT NULL,
  snapshot_count      integer NOT NULL,
  thesis              text,
  value_drivers       jsonb,
  destroyers          jsonb,
  bull_case           text,
  bear_case           text,
  key_sensitivities   text,
  investment_verdict  text,
  conviction_rating   text,
  method_reconciliation text,
  blended_fair_value  numeric,
  implied_range_low   numeric,
  implied_range_high  numeric,
  avg_upside_pct      numeric,
  model_used          text DEFAULT 'claude-sonnet-4-6',
  prompt_version      text DEFAULT 'v1',
  input_token_est     integer,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scrapbook_narratives_company_id
  ON public.scrapbook_narratives(company_id);

-- FK back-reference: snapshots → narrative
ALTER TABLE public.scrapbook_snapshots
  ADD CONSTRAINT fk_snapshot_narrative
  FOREIGN KEY (narrative_id)
  REFERENCES public.scrapbook_narratives(id)
  ON DELETE SET NULL;

-- RLS
ALTER TABLE public.scrapbook_companies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrapbook_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrapbook_narratives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_scrapbook_companies"  ON public.scrapbook_companies
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_scrapbook_snapshots"  ON public.scrapbook_snapshots
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_scrapbook_narratives" ON public.scrapbook_narratives
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Helper function
CREATE OR REPLACE FUNCTION public.update_scrapbook_company_aggregates(p_company_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.scrapbook_companies
  SET
    run_count       = (SELECT COUNT(*) FROM public.scrapbook_snapshots WHERE company_id = p_company_id),
    fair_value_low  = (SELECT MIN(implied_price) FROM public.scrapbook_snapshots WHERE company_id = p_company_id),
    fair_value_high = (SELECT MAX(implied_price) FROM public.scrapbook_snapshots WHERE company_id = p_company_id),
    avg_fair_value  = (SELECT ROUND(AVG(implied_price), 2) FROM public.scrapbook_snapshots WHERE company_id = p_company_id),
    last_run_at     = now(),
    updated_at      = now()
  WHERE id = p_company_id;
END;
$$;
