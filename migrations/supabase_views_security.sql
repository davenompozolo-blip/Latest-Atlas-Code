-- =============================================================================
-- ATLAS — Enable security_invoker on all analytics views
-- This ensures views respect RLS policies of the calling user,
-- rather than bypassing RLS as the view owner (postgres).
--
-- Run AFTER creating the views (supabase_views.sql) AND after
-- the RLS policies migration (20260329000001_rls_policies.sql).
-- =============================================================================

ALTER VIEW IF EXISTS vw_portfolio_home       SET (security_invoker = on);
ALTER VIEW IF EXISTS vw_quant_dashboard      SET (security_invoker = on);
ALTER VIEW IF EXISTS vw_risk_analysis        SET (security_invoker = on);
ALTER VIEW IF EXISTS vw_performance_suite    SET (security_invoker = on);
ALTER VIEW IF EXISTS vw_portfolio_nav_daily  SET (security_invoker = on);
ALTER VIEW IF EXISTS vw_command_centre       SET (security_invoker = on);
ALTER VIEW IF EXISTS vw_portfolio_returns_daily SET (security_invoker = on);
