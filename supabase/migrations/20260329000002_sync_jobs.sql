-- =============================================================================
-- ATLAS — Sync Jobs Table
-- Tracks broker sync / ingestion runs with status, errors, and timing.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  broker text NOT NULL DEFAULT 'alpaca',
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  portfolio_id uuid REFERENCES public.portfolios(id),
  error_message text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  rows_synced integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sync_jobs_org
  ON public.sync_jobs (organization_id);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_user
  ON public.sync_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_status
  ON public.sync_jobs (status)
  WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS idx_sync_jobs_requested
  ON public.sync_jobs (requested_at DESC);

-- RLS
ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;

-- Org members can see their org's sync jobs
CREATE POLICY sync_jobs_select ON public.sync_jobs
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.user_org_ids()));

-- Owner + member can create sync jobs
CREATE POLICY sync_jobs_insert ON public.sync_jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT public.user_org_ids())
    AND public.user_org_role(organization_id) IN ('owner', 'member')
  );

-- Service role can update job status (from the sync pipeline)
CREATE POLICY sync_jobs_service_update ON public.sync_jobs
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);
