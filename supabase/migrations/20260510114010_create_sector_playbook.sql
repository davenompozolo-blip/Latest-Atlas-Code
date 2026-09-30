
CREATE TABLE public.scrapbook_sector_notes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sector              text NOT NULL,
  company_ids         uuid[] NOT NULL,
  company_tickers     text[] NOT NULL,
  company_count       integer NOT NULL,
  sector_thesis       text,
  sector_tailwinds    jsonb,
  sector_headwinds    jsonb,
  relative_value      text,
  sector_verdict      text,
  sector_conviction   text CHECK (
    sector_conviction IN ('Overweight', 'Neutral', 'Underweight', 'Under Review')
  ),
  shared_assumptions  text,
  divergence_points   text,
  model_used          text DEFAULT 'claude-sonnet-4-6',
  prompt_version      text DEFAULT 'v1',
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sector_notes_sector
  ON public.scrapbook_sector_notes(sector);

CREATE INDEX idx_sector_notes_created
  ON public.scrapbook_sector_notes(sector, created_at DESC);

ALTER TABLE public.scrapbook_sector_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_sector_notes" ON public.scrapbook_sector_notes
  FOR ALL TO anon USING (true) WITH CHECK (true);
