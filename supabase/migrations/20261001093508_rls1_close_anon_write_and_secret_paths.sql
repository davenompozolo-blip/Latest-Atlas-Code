-- RLS-1: close the anon-key write and secret paths (2026-10-01).
--
-- Measured before this migration, holding only the publishable key:
--   * rpc/atlas_cron_secret returned CRON_SECRET (SECURITY DEFINER, PUBLIC
--     EXECUTE). That secret authorises every scheduled handler and
--     /api/broker-accounts.
--   * rpc/run_read_sql ran any SELECT as the function owner, so RLS and
--     grants did not apply -- vault.decrypted_secrets included.
--   * rpc/materialize_insight ran arbitrary SQL as the owner inside
--     CREATE TABLE AS, with no keyword filter at all.
--   * atlas_chain_dispatch / atlas_chain_reap / atlas_chain_base,
--     refresh_universe_correlations, expire_stale_trade_triggers and
--     atlas_log_universe_price_coverage were callable by anon (SECURITY
--     DEFINER, PUBLIC EXECUTE): fire authenticated HTTP stages, rewrite
--     the correlation matrix, write logs.
--   * 22 public tables had RLS off, and anon held SELECT/INSERT/UPDATE/
--     DELETE on every one. bench_claims had RLS on with anon UPDATE
--     USING (true) on every column.
--   * anon held TRUNCATE on 116 of 129 public tables. RLS never governs
--     TRUNCATE; the only path to it was run_read_sql's keyword filter.
--
-- Callers checked before revoking: pg_cron runs as postgres (owner), and
-- api/trade-sync.js calls refresh_universe_correlations and
-- expire_stale_trade_triggers with the service-role key. No browser or
-- anon-key route calls any revoked function except materialize_insight
-- (the SQL terminal's "route to Supabase" button, which now refuses).

-- ── 1. Functions ────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.atlas_cron_secret()',
    'public.atlas_chain_base()',
    'public.atlas_chain_dispatch(text, text, boolean, integer)',
    'public.atlas_chain_reap()',
    'public.refresh_universe_correlations(integer, integer, numeric, integer)',
    'public.expire_stale_trade_triggers()',
    'public.atlas_log_universe_price_coverage()',
    'public.materialize_insight(text, text, uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- The SQL terminal keeps working, as the CALLER: anon sees what anon may
-- see, and the transaction is read-only, so no function it calls can
-- write either (the keyword filter could be walked past by any SECURITY
-- DEFINER function that writes). Body otherwise unchanged.
create or replace function public.run_read_sql(sql_text text)
 returns jsonb
 language plpgsql
 security invoker
 set search_path to 'public'
as $function$
DECLARE
  result   JSONB;
  norm     TEXT;
BEGIN
  SET LOCAL statement_timeout = '30000';   -- 30 s hard cap
  SET LOCAL transaction_read_only = on;    -- RLS-1: no write survives, whoever calls

  norm := upper(regexp_replace(sql_text, '\s+', ' ', 'g'));

  -- Belt-and-suspenders: block write keywords at DB level too
  IF norm ~ '\m(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|REPLACE|MERGE)\M' THEN
    RAISE EXCEPTION 'Write operations are not permitted in the SQL Terminal';
  END IF;

  -- Block dangerous system catalogues
  IF norm ~ '\m(PG_CATALOG|PG_CLASS|PG_PROC|PG_STAT_ACTIVITY|PG_TOAST)\M' THEN
    RAISE EXCEPTION 'Access to system catalogues is restricted';
  END IF;

  EXECUTE format(
    'SELECT jsonb_agg(row_to_json(t)) FROM (%s) t',
    sql_text
  ) INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$function$;

-- ── 2. TRUNCATE / TRIGGER / REFERENCES never belong to a browser role ───
do $$
declare t record;
begin
  for t in select c.oid::regclass as rel from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r','p') loop
    execute format('revoke truncate, trigger, references on %s from anon, authenticated', t.rel);
  end loop;
end $$;
alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;

-- ── 3. The 22 tables ────────────────────────────────────────────────────
-- Pattern: enable RLS, revoke every write from browser roles, then grant
-- back exactly what a page does, by column where the write is narrow.
do $$
declare t text;
begin
  foreach t in array array[
    'cortex_paper_trades','cortex_signal_controls','cortex_signals',
    'insight_best_worst_tradingdays','insight_correlation_cluster',
    'insight_correlation_clusters_common','insight_counter_specific_var_vs_sector',
    'insight_drawdown_severity_by_counter','insight_factor_decomposition',
    'insight_positions_approaching_52_week_high_low','insight_sector_attributiom',
    'insight_sector_attribution','insight_ssector_pnl_decomposition',
    'insight_top_winner_losers_within_52w_extremes','instrument_sector_overrides',
    'materialized_insights','query_log','saved_queries','sector_industry_map',
    'sector_overrides','theme_taxonomy','users'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Read-only reference and analytics tables: anyone may read, nobody may
-- write from a browser. insight_correlation_cluster and
-- insight_counter_specific_var_vs_sector are read by api/nexus-opportunities.js
-- on the anon key; the rest by the SQL terminal.
do $$
declare t text;
begin
  foreach t in array array[
    'cortex_signal_controls','cortex_signals',
    'insight_best_worst_tradingdays','insight_correlation_cluster',
    'insight_correlation_clusters_common','insight_counter_specific_var_vs_sector',
    'insight_drawdown_severity_by_counter','insight_factor_decomposition',
    'insight_positions_approaching_52_week_high_low','insight_sector_attributiom',
    'insight_sector_attribution','insight_ssector_pnl_decomposition',
    'insight_top_winner_losers_within_52w_extremes','instrument_sector_overrides',
    'materialized_insights','saved_queries','sector_industry_map',
    'sector_overrides','theme_taxonomy'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
  end loop;
end $$;

-- users (0 rows) and cortex_paper_trades: no browser reader or writer.
revoke select on public.users, public.cortex_paper_trades from anon, authenticated;

-- cortex.js mutes a signal: is_muted only.
grant update (is_muted) on public.cortex_signals to anon, authenticated;
drop policy if exists cortex_signals_mute on public.cortex_signals;
create policy cortex_signals_mute on public.cortex_signals
  for update to anon, authenticated using (true) with check (true);

-- cortex.js saveControl(): enabled / feed_weight / updated_at.
grant update (enabled, feed_weight, updated_at) on public.cortex_signal_controls to anon, authenticated;
drop policy if exists cortex_signal_controls_tune on public.cortex_signal_controls;
create policy cortex_signal_controls_tune on public.cortex_signal_controls
  for update to anon, authenticated using (true) with check (true);

-- sql-terminal.js logs each run: insert only, no read-back.
grant insert (sql_text, execution_time_ms, row_count, error) on public.query_log to anon, authenticated;
drop policy if exists query_log_append on public.query_log;
create policy query_log_append on public.query_log
  for insert to anon, authenticated with check (true);

-- sql-terminal.js saved queries: insert, pin, delete. Kept open because the
-- page needs it and there are no users to scope it to; see MOBILE_BRIEF §14.
grant insert (name, description, sql_text, tags, is_pinned) on public.saved_queries to anon, authenticated;
grant update (is_pinned) on public.saved_queries to anon, authenticated;
grant delete on public.saved_queries to anon, authenticated;
drop policy if exists saved_queries_insert on public.saved_queries;
drop policy if exists saved_queries_pin on public.saved_queries;
drop policy if exists saved_queries_delete on public.saved_queries;
create policy saved_queries_insert on public.saved_queries
  for insert to anon, authenticated with check (true);
create policy saved_queries_pin on public.saved_queries
  for update to anon, authenticated using (true) with check (true);
create policy saved_queries_delete on public.saved_queries
  for delete to anon, authenticated using (true);

-- ── 4. bench_claims: the Trade ticket's claim form, and nothing else ────
-- tradeData.upsertClaim() writes symbol, claim_text, falsifier_text,
-- review_by, status. Evidence, timestamps, ids and origin_decision_id
-- are not a browser's to set. No DELETE grant (none existed via policy).
revoke insert, update, delete on public.bench_claims from anon, authenticated;
grant insert (symbol, claim_text, falsifier_text, review_by, status) on public.bench_claims to anon, authenticated;
grant update (symbol, claim_text, falsifier_text, review_by, status) on public.bench_claims to anon, authenticated;

-- ── 5. Prove it inside the migration ───────────────────────────────────
do $$
declare n int;
begin
  if has_function_privilege('anon', 'public.atlas_cron_secret()', 'execute')
     or has_function_privilege('authenticated', 'public.atlas_cron_secret()', 'execute')
     or has_function_privilege('anon', 'public.materialize_insight(text, text, uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.atlas_chain_dispatch(text, text, boolean, integer)', 'execute') then
    raise exception 'RLS-1: a revoked function is still executable by a browser role';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.run_read_sql(text)'::regprocedure) then
    raise exception 'RLS-1: run_read_sql is still SECURITY DEFINER';
  end if;
  select count(*) into n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity;
  if n <> 0 then raise exception 'RLS-1: % public tables still have RLS off', n; end if;
  select count(*) into n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relkind in ('r','p')
     and (has_table_privilege('anon', c.oid, 'TRUNCATE') or has_table_privilege('authenticated', c.oid, 'TRUNCATE'));
  if n <> 0 then raise exception 'RLS-1: % public tables still TRUNCATE-able by a browser role', n; end if;
  if has_table_privilege('anon', 'public.bench_claims', 'DELETE')
     or has_column_privilege('anon', 'public.bench_claims', 'evidence_text', 'UPDATE') then
    raise exception 'RLS-1: bench_claims still writable beyond the claim form';
  end if;
end $$;
