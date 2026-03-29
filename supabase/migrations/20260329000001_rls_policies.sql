-- =============================================================================
-- ATLAS — Row Level Security Policies (Per-Org Tenancy)
--
-- Access model:
--   owner  = full CRUD on org data + manage membership
--   member = read/write org portfolios, positions, transactions
--   viewer = read-only on org data
--
-- Shared reference data (assets, price_history) = readable by all authenticated.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: reusable function to check org membership
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.org_members
  WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.user_org_role(org_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.org_members
  WHERE user_id = auth.uid()
    AND organization_id = org_id
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- 1. org_members
-- ---------------------------------------------------------------------------
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

-- Members can see other members in their org
CREATE POLICY org_members_select ON public.org_members
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.user_org_ids()));

-- Only owners can add members
CREATE POLICY org_members_insert ON public.org_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_org_role(organization_id) = 'owner'
  );

-- Only owners can update members (e.g. change role)
CREATE POLICY org_members_update ON public.org_members
  FOR UPDATE TO authenticated
  USING (public.user_org_role(organization_id) = 'owner')
  WITH CHECK (public.user_org_role(organization_id) = 'owner');

-- Only owners can remove members
CREATE POLICY org_members_delete ON public.org_members
  FOR DELETE TO authenticated
  USING (public.user_org_role(organization_id) = 'owner');

-- ---------------------------------------------------------------------------
-- 2. organizations
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Members can see their orgs
CREATE POLICY organizations_select ON public.organizations
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.user_org_ids()));

-- Only owners can update org details
CREATE POLICY organizations_update ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.user_org_role(id) = 'owner')
  WITH CHECK (public.user_org_role(id) = 'owner');

-- Any authenticated user can create an org (they become owner via trigger)
CREATE POLICY organizations_insert ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3. portfolios (org-scoped)
-- ---------------------------------------------------------------------------
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;

-- All org members can read portfolios
CREATE POLICY portfolios_select ON public.portfolios
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.user_org_ids()));

-- owner + member can create portfolios
CREATE POLICY portfolios_insert ON public.portfolios
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT public.user_org_ids())
    AND public.user_org_role(organization_id) IN ('owner', 'member')
  );

-- owner + member can update portfolios
CREATE POLICY portfolios_update ON public.portfolios
  FOR UPDATE TO authenticated
  USING (
    organization_id IN (SELECT public.user_org_ids())
    AND public.user_org_role(organization_id) IN ('owner', 'member')
  )
  WITH CHECK (
    organization_id IN (SELECT public.user_org_ids())
    AND public.user_org_role(organization_id) IN ('owner', 'member')
  );

-- Only owners can delete portfolios
CREATE POLICY portfolios_delete ON public.portfolios
  FOR DELETE TO authenticated
  USING (public.user_org_role(organization_id) = 'owner');

-- ---------------------------------------------------------------------------
-- 4. positions (scoped via portfolio → org)
-- ---------------------------------------------------------------------------
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY positions_select ON public.positions
  FOR SELECT TO authenticated
  USING (
    portfolio_id IN (
      SELECT id FROM public.portfolios
      WHERE organization_id IN (SELECT public.user_org_ids())
    )
  );

CREATE POLICY positions_write ON public.positions
  FOR INSERT TO authenticated
  WITH CHECK (
    portfolio_id IN (
      SELECT id FROM public.portfolios
      WHERE organization_id IN (SELECT public.user_org_ids())
        AND public.user_org_role(organization_id) IN ('owner', 'member')
    )
  );

CREATE POLICY positions_update ON public.positions
  FOR UPDATE TO authenticated
  USING (
    portfolio_id IN (
      SELECT id FROM public.portfolios
      WHERE organization_id IN (SELECT public.user_org_ids())
        AND public.user_org_role(organization_id) IN ('owner', 'member')
    )
  );

CREATE POLICY positions_delete ON public.positions
  FOR DELETE TO authenticated
  USING (
    portfolio_id IN (
      SELECT id FROM public.portfolios
      WHERE organization_id IN (SELECT public.user_org_ids())
        AND public.user_org_role(organization_id) = 'owner'
    )
  );

-- ---------------------------------------------------------------------------
-- 5. transactions (scoped via portfolio → org)
-- ---------------------------------------------------------------------------
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY transactions_select ON public.transactions
  FOR SELECT TO authenticated
  USING (
    portfolio_id IN (
      SELECT id FROM public.portfolios
      WHERE organization_id IN (SELECT public.user_org_ids())
    )
  );

CREATE POLICY transactions_write ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    portfolio_id IN (
      SELECT id FROM public.portfolios
      WHERE organization_id IN (SELECT public.user_org_ids())
        AND public.user_org_role(organization_id) IN ('owner', 'member')
    )
  );

CREATE POLICY transactions_update ON public.transactions
  FOR UPDATE TO authenticated
  USING (
    portfolio_id IN (
      SELECT id FROM public.portfolios
      WHERE organization_id IN (SELECT public.user_org_ids())
        AND public.user_org_role(organization_id) IN ('owner', 'member')
    )
  );

CREATE POLICY transactions_delete ON public.transactions
  FOR DELETE TO authenticated
  USING (
    portfolio_id IN (
      SELECT id FROM public.portfolios
      WHERE organization_id IN (SELECT public.user_org_ids())
        AND public.user_org_role(organization_id) = 'owner'
    )
  );

-- ---------------------------------------------------------------------------
-- 6. assets — shared reference data, readable by all authenticated
-- ---------------------------------------------------------------------------
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY assets_select ON public.assets
  FOR SELECT TO authenticated
  USING (true);

-- Only service_role (sync pipeline) should write assets
CREATE POLICY assets_service_write ON public.assets
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 7. price_history — shared market data, readable by all authenticated
-- ---------------------------------------------------------------------------
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY price_history_select ON public.price_history
  FOR SELECT TO authenticated
  USING (true);

-- Only service_role (sync pipeline) should write price data
CREATE POLICY price_history_service_write ON public.price_history
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Auto-add org creator as owner
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_org()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.org_members (organization_id, user_id, role)
  VALUES (NEW.id, auth.uid(), 'owner');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_org_created ON public.organizations;
CREATE TRIGGER on_org_created
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_org();
