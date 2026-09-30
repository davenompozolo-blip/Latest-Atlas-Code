-- =============================================================================
-- ATLAS — Organization Model & Membership
-- Per-org tenancy: portfolios scoped by organization_id,
-- downstream tables (positions, transactions) inherit via portfolio_id FK.
-- =============================================================================

-- Organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Org membership: maps auth.users → organizations with a role
CREATE TABLE IF NOT EXISTS public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'member', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

-- Add organization_id to portfolios (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'portfolios'
      AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.portfolios
      ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
  END IF;
END $$;

-- Indexes for RLS policy performance
CREATE INDEX IF NOT EXISTS idx_org_members_user_id
  ON public.org_members (user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_user
  ON public.org_members (organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_portfolios_organization_id
  ON public.portfolios (organization_id);
