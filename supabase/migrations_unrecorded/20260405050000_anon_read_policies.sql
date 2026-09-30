-- ---------------------------------------------------------------------------
-- 20260405050000_anon_read_policies.sql
--
-- security_invoker views (vw_portfolio_home, vw_portfolio_nav_daily,
-- vw_position_nav_daily, vw_command_centre, etc.) run under the caller's
-- role. When the React terminal queries them with the anon key, RLS on the
-- underlying tables (positions, transactions, price_history, assets,
-- portfolios, broker_accounts) silently returns zero rows if no matching
-- policy exists — which is exactly what's happening: the terminal falls
-- back to its MOCK_POSITIONS constants and paints AAPL/MSFT/NVDA/GOOGL
-- under a green "LIVE DATA" pill.
--
-- Fix: add idempotent read-only policies for anon (and authenticated)
-- matching the pattern already used by sync_log_read_anon. Read-only —
-- writes continue to go through service_role from the Edge Functions.
--
-- This is safe whether or not RLS is currently enabled:
--   - `enable row level security` is a no-op if already enabled
--   - `drop policy if exists` + `create policy` gives us idempotency
-- ---------------------------------------------------------------------------

do $$
declare
    tbl text;
    tables text[] := array[
        'portfolios',
        'positions',
        'transactions',
        'price_history',
        'assets',
        'broker_accounts'
    ];
begin
    foreach tbl in array tables loop
        execute format('alter table public.%I enable row level security', tbl);
        execute format('drop policy if exists %I on public.%I',
                       tbl || '_read_anon', tbl);
        execute format(
            'create policy %I on public.%I for select to anon, authenticated using (true)',
            tbl || '_read_anon', tbl
        );
    end loop;
end $$;
