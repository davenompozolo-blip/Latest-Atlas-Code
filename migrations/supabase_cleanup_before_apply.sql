-- =============================================================================
-- ATLAS — Cleanup Script (run FIRST if the Supabase Assistant already
-- partially created org_members / RLS policies in the live DB)
--
-- This drops the incomplete objects so the migration files can recreate
-- them cleanly. Only run this if you get "already exists" errors.
-- =============================================================================

-- Drop any policies the Supabase Assistant may have partially created
DO $$ BEGIN
  -- org_members policies
  DROP POLICY IF EXISTS "org_members_admin_manage"  ON public.org_members;
  DROP POLICY IF EXISTS "org_members_read_own_org"  ON public.org_members;
  DROP POLICY IF EXISTS org_members_select           ON public.org_members;
  DROP POLICY IF EXISTS org_members_insert           ON public.org_members;
  DROP POLICY IF EXISTS org_members_update           ON public.org_members;
  DROP POLICY IF EXISTS org_members_delete           ON public.org_members;

  -- portfolios policies
  DROP POLICY IF EXISTS "portfolios_members_can_read"  ON public.portfolios;
  DROP POLICY IF EXISTS "portfolios_admin_can_write"   ON public.portfolios;
  DROP POLICY IF EXISTS "portfolios_admin_can_update"  ON public.portfolios;
  DROP POLICY IF EXISTS "portfolios_admin_can_delete"  ON public.portfolios;
  DROP POLICY IF EXISTS portfolios_select              ON public.portfolios;
  DROP POLICY IF EXISTS portfolios_insert              ON public.portfolios;
  DROP POLICY IF EXISTS portfolios_update              ON public.portfolios;
  DROP POLICY IF EXISTS portfolios_delete              ON public.portfolios;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Some policies did not exist — that is fine: %', SQLERRM;
END $$;

-- Drop the incomplete org_members table if it lacks the role CHECK constraint
-- (the Supabase Assistant created it without the constraint)
-- WARNING: This drops all data in org_members. Skip if you have real membership data.
DROP TABLE IF EXISTS public.org_members CASCADE;

-- Drop helper functions if they exist from a previous partial run
DROP FUNCTION IF EXISTS public.user_org_ids();
DROP FUNCTION IF EXISTS public.user_org_role(uuid);
DROP FUNCTION IF EXISTS public.handle_new_org();

SELECT 'Cleanup complete. Now run the migrations in order.' AS status;
