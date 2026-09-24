-- MP-2: the browser chooses the portfolio; single-book analytics refuse to
-- answer for a portfolio they were not computed for.
--
-- Multi-portfolio, phase 2 (database half). Behaviour-neutral until a client
-- sends the header: with no x-atlas-portfolio, every function below resolves to
-- the default portfolio exactly as MP-0 did.
--
-- 1. atlas_active_portfolio() reads the PostgREST request header
--    x-atlas-portfolio, validated against portfolios; anything absent,
--    malformed or unknown falls back to the default. MP-0 made this the one
--    choke point, so all 25 scoped views and 5 functions follow it unchanged.
--
-- 2. SINGLE-BOOK SOURCES. Nine matviews are refreshed by cron with no request
--    context, so they are always the default portfolio's; seven tables are
--    written nightly from the book and carry no portfolio_id. Joined to another
--    portfolio's live rows on asset_id, they would attach the default book's
--    conviction, verdicts, risk shares and betas to a name held in both
--    accounts -- a figure that looks right and is about a different book.
--    Every reader is gated on atlas_on_default_portfolio():
--      - the 11 views that read a source directly: the reference is wrapped in
--        a guarded subquery (a LEFT JOIN comes back NULL, a wholly single-book
--        view comes back empty); views built on them inherit the guard;
--      - the 7 tables: their anon/authenticated SELECT policy;
--      - the matviews: revoked from browser roles, with guarded views for the
--        two the app reads, so a read this migration missed FAILS rather than
--        leaking. mv_book_ex_index keeps its grant: atlas_counterfactual_book is
--        SECURITY INVOKER and reads it on behalf of vw_position_tier2 (itself
--        guarded, so it is never reached on another portfolio).
--    MP-4 makes these per-portfolio; until then, absent beats wrong.
--
-- 3. book_model_diagnostics had RLS OFF, leaving it open to anonymous writes
--    under Supabase's default grants -- the book_regime_cvar defect of
--    2026-09-15, again. Enabled, with the guarded read and a service policy.
--
-- 4. Four SECURITY DEFINER WRITERS were executable by anon through the
--    default PUBLIC grant: atlas_write_verdicts, atlas_write_segment_verdicts,
--    atlas_refresh_position_returns, atlas_refresh_verdict_inputs. Anyone with
--    the public key could append permanent rows to append-only verdict
--    history. Nothing in src/ or api/ calls them over RPC; pg_cron runs as the
--    owner. Revoked from PUBLIC, anon and authenticated.
--
-- 5. vw_portfolios feeds the switcher and reports which portfolio the SERVER
--    resolved as active, so the UI shows the truth rather than its own belief.

-- ── 1. Resolution ────────────────────────────────────────────────────────────

create or replace function public.atlas_default_portfolio()
returns uuid language sql stable security definer set search_path = public
as $fn$
  select id from public.portfolios where is_default
$fn$;

create or replace function public.atlas_active_portfolio()
returns uuid language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_hdr text;
  v_id  uuid;
begin
  -- request.headers is set by PostgREST; absent (pg_cron, psql, a service
  -- job) or unparsable means "no choice was made", never an error.
  begin
    v_hdr := nullif(current_setting('request.headers', true), '')::json ->> 'x-atlas-portfolio';
  exception when others then
    v_hdr := null;
  end;
  if v_hdr ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select p.id into v_id from public.portfolios p where p.id = v_hdr::uuid;
    if v_id is not null then
      return v_id;
    end if;
  end if;
  return (select p.id from public.portfolios p where p.is_default);
end
$fn$;

create or replace function public.atlas_on_default_portfolio()
returns boolean language sql stable security definer set search_path = public
as $fn$
  select coalesce(public.atlas_active_portfolio() = public.atlas_default_portfolio(), false)
$fn$;

do $$
declare f text;
begin
  foreach f in array array['atlas_default_portfolio()','atlas_active_portfolio()','atlas_on_default_portfolio()'] loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated, service_role', f);
  end loop;
end $$;

comment on function public.atlas_active_portfolio() is
  'The portfolio every book-scoped reader is filtered to: the x-atlas-portfolio '
  'request header when it names a known portfolio, else the default. MP-2.';
comment on function public.atlas_on_default_portfolio() is
  'True when the active portfolio is the default one -- the only portfolio the '
  'single-book analytics (nine matviews, seven nightly tables) describe. MP-2.';

-- ── 2a. Guard the views that read a single-book source ──────────────────────

create or replace function pg_temp.mp2_guard(src text) returns text
language plpgsql immutable as $fn$
declare
  s   text;
  kw  constant text :=
    'where|join|left|right|inner|cross|full|group|order|limit|on|union|window|'
    'having|except|intersect|returning|for|natural|using|offset|fetch|lateral|tablesample';
  g   text;
begin
  foreach s in array array[
    'mv_bench_contribution','mv_book_candidate_map','mv_book_daily_weights','mv_book_ex_index',
    'mv_nexus_holdings','mv_position_returns','mv_position_tier1','mv_position_tier2','mv_segment_ex_index',
    'book_factor_betas','book_model_diagnostics','book_regime_cvar','book_risk_daily',
    'position_verdicts','segment_verdicts','var_backtest_runs'] loop
    -- The inner name carries a placeholder so a later pass cannot match it.
    g := '(SELECT * FROM public.__MP2__' || s ||
         ' WHERE (SELECT public.atlas_on_default_portfolio()))';
    -- Pass 1: an aliased reference keeps its alias.
    src := regexp_replace(src,
      '\m(from|join)(\s+)(public\.)?' || s || '\M(\s+(as\s+)?(?!(' || kw || ')\M)[a-z_][a-z0-9_]*)',
      '\1\2' || g || '\4', 'gi');
    -- Pass 2: a bare reference is aliased back to the source's own name so
    -- qualified columns still resolve.
    src := regexp_replace(src,
      '\m(from|join)(\s+)(public\.)?' || s || '\M',
      '\1\2' || g || ' ' || s, 'gi');
  end loop;
  return src;
end $fn$;

do $$
declare
  r     record;
  v_old text;
  v_new text;
  v_n   int;
begin
  for r in
    select * from (values
      ('vw_bench_contribution', 1), ('vw_book_frozen_baseline', 2),
      ('vw_nexus_holdings', 1), ('vw_nexus_price_freshness', 1),
      ('vw_position_cluster_members', 1), ('vw_position_frozen', 1),
      ('vw_position_risk_thesis', 2), ('vw_position_segments', 1),
      ('vw_position_tier1', 2), ('vw_position_tier2', 2),
      ('vw_var_backtest_distribution', 4)
    ) as x(name, expected)
  loop
    select pg_get_viewdef(c.oid, true) into v_old
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = r.name and c.relkind = 'v'
       and c.reloptions is null;
    if v_old is null then
      raise exception 'MP-2: view % not found (or carries options this patch does not preserve)', r.name;
    end if;
    if v_old ~ 'atlas_on_default_portfolio' then
      raise exception 'MP-2: view % is already guarded -- refusing to re-patch', r.name;
    end if;
    v_new := pg_temp.mp2_guard(v_old);
    v_n := (length(v_new) - length(replace(v_new, '__MP2__', ''))) / length('__MP2__');
    if v_n <> r.expected then
      raise exception 'MP-2: view % -- % references guarded, expected %', r.name, v_n, r.expected;
    end if;
    execute format('create or replace view public.%I as %s',
                   r.name, rtrim(replace(v_new, '__MP2__', ''), E'; \n'));
  end loop;
end $$;

-- ── 2b. Guard the tables' browser-facing reads ──────────────────────────────

alter policy book_factor_betas_read on public.book_factor_betas using ((select public.atlas_on_default_portfolio()));
alter policy book_regime_cvar_read  on public.book_regime_cvar  using ((select public.atlas_on_default_portfolio()));
alter policy book_risk_daily_read   on public.book_risk_daily   using ((select public.atlas_on_default_portfolio()));
alter policy position_verdicts_read on public.position_verdicts using ((select public.atlas_on_default_portfolio()));
alter policy segment_verdicts_read  on public.segment_verdicts  using ((select public.atlas_on_default_portfolio()));
alter policy var_backtest_runs_read on public.var_backtest_runs using ((select public.atlas_on_default_portfolio()));

-- 3. book_model_diagnostics: RLS was OFF.
alter table public.book_model_diagnostics enable row level security;
drop policy if exists book_model_diagnostics_read on public.book_model_diagnostics;
create policy book_model_diagnostics_read on public.book_model_diagnostics
  for select to anon, authenticated using ((select public.atlas_on_default_portfolio()));
drop policy if exists book_model_diagnostics_service on public.book_model_diagnostics;
create policy book_model_diagnostics_service on public.book_model_diagnostics
  for all to service_role using (true) with check (true);

-- ── 2c. Matviews: revoked from browser roles; guarded views for the two read ─

do $$
declare m text;
begin
  foreach m in array array['mv_bench_contribution','mv_book_candidate_map','mv_book_daily_weights',
                           'mv_nexus_holdings','mv_position_returns','mv_position_tier1',
                           'mv_position_tier2','mv_segment_ex_index'] loop
    execute format('revoke all on public.%I from anon, authenticated', m);
  end loop;
end $$;

create or replace view public.vw_default_only_position_returns as
  select * from public.mv_position_returns where (select public.atlas_on_default_portfolio());
create or replace view public.vw_default_only_book_candidate_map as
  select * from public.mv_book_candidate_map where (select public.atlas_on_default_portfolio());

-- ── 5. The switcher's list ──────────────────────────────────────────────────

create or replace view public.vw_portfolios as
select p.id,
       p.name,
       p.is_default,
       p.id = (select public.atlas_active_portfolio()) as is_active,
       right(b.alpaca_account_number, 4)              as account_last4,
       b.is_paper,
       s.equity                                        as latest_equity,
       s.as_of                                         as equity_as_of
  from public.portfolios p
  left join public.broker_accounts b on b.id = p.broker_account_id
  left join lateral (
         select a.equity, a.as_of
           from public.account_snapshots a
          where a.portfolio_id = p.id
          order by a.as_of desc
          limit 1) s on true;

do $$
declare v text;
begin
  foreach v in array array['vw_default_only_position_returns','vw_default_only_book_candidate_map','vw_portfolios'] loop
    execute format('revoke all on public.%I from public, anon, authenticated', v);
    execute format('grant select on public.%I to anon, authenticated, service_role', v);
  end loop;
end $$;

comment on view public.vw_portfolios is
  'Portfolios for the account switcher. is_active is what the SERVER resolved '
  'from x-atlas-portfolio, not what the client believes. MP-2.';

-- ── 4. Writers were executable by anon ──────────────────────────────────────

revoke execute on function public.atlas_write_verdicts(date, text, boolean)      from public, anon, authenticated;
revoke execute on function public.atlas_write_segment_verdicts                    from public, anon, authenticated;
revoke execute on function public.atlas_refresh_position_returns                  from public, anon, authenticated;
revoke execute on function public.atlas_refresh_verdict_inputs                    from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array['atlas_write_verdicts','atlas_write_segment_verdicts',
                           'atlas_refresh_position_returns','atlas_refresh_verdict_inputs'] loop
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = f
                  and (has_function_privilege('anon', p.oid, 'execute')
                       or has_function_privilege('authenticated', p.oid, 'execute'))) then
      raise exception 'MP-2: % is still executable by a browser role', f;
    end if;
  end loop;
end $$;
