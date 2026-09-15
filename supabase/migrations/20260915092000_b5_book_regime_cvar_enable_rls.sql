-- Found while giving var_backtest_runs its policies: book_regime_cvar shipped
-- with RLS OFF, alone among the factor-layer tables. Supabase's default grants
-- give anon and authenticated INSERT on every table in `public`, and RLS is the
-- only thing that takes it back -- so an append-only risk history was open to
-- anonymous writes. The append-only trigger does not help: it refuses UPDATE
-- and DELETE, which is exactly the pair an attacker does not need.
--
-- book_factor_betas, factor_axis_scores and market_prices all carry the
-- read/service pair below. This is that pair, nothing more.
--
-- The nightly writer is unaffected: pg_cron executes as the job owner and
-- postgres owns the table, so it bypasses RLS (relforcerowsecurity is false,
-- as on every sibling).

alter table public.book_regime_cvar enable row level security;

drop policy if exists book_regime_cvar_read on public.book_regime_cvar;
create policy book_regime_cvar_read on public.book_regime_cvar
  for select to anon, authenticated using (true);

drop policy if exists book_regime_cvar_service on public.book_regime_cvar;
create policy book_regime_cvar_service on public.book_regime_cvar
  for all to service_role using (true) with check (true);
