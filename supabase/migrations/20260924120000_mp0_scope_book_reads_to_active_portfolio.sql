-- MP-0: scope every book read to ONE portfolio before a second one exists.
--
-- Multi-portfolio, phase 0. Behaviour-neutral today: there is exactly one
-- portfolio, so every filter added here keeps every row it sees.
--
-- WHY THIS COMES FIRST. positions / account_snapshots / transactions /
-- portfolio_equity_curve all carry portfolio_id, but 25 views and 5 functions
-- read them with no portfolio filter. The moment a second account's rows land,
-- every one of them would SUM TWO BOOKS -- NAV, weights, risk, verdicts -- with
-- nothing on screen to say so. Several would be wrong in subtler ways too:
-- vw_positions_current takes max(as_of_date) across ALL portfolios, and
-- vw_sleeve_headroom takes the newest equity snapshot from ANY account. So the
-- reads are scoped before the writers are allowed to write a second book.
--
-- MECHANISM. One choke point, atlas_active_portfolio(), and four scoped views
-- over the four book tables. Every book-scoped reader is rewritten to read the
-- scoped view, ALIASED BACK TO THE ORIGINAL TABLE NAME where it had no alias,
-- so qualified column references (account_snapshots.equity) still resolve and
-- the rewritten definition is otherwise byte-for-byte the old one.
--
-- Phase 2 (the account switcher) changes the BODY of atlas_active_portfolio()
-- and nothing else. Until then it returns the default portfolio, always.
--
-- NOT SCOPED, deliberately -- "held anywhere" is the right meaning for these:
--   atlas_check_universe_price_coverage  (book's held set for coverage)
--   atlas_refresh_asset_sectors          (sectors for every held name)
--   refresh_universe_correlations        (pins held names into the matrix)
-- refresh_universe_correlations still takes a GLOBAL max(as_of_date); that must
-- become per-portfolio before a second account syncs (MP-1), or a lagging
-- account's names drop out of the matrix.
--
-- The patch is textual against the LIVE definitions with every replacement
-- count asserted, the idiom 20260811150000 / 20260906083659 use: a replay
-- against a different base fails loudly rather than quietly doing something
-- else, and an already-patched object is refused outright.

-- ── 1. The default portfolio ────────────────────────────────────────────────

alter table public.portfolios
  add column if not exists is_default boolean not null default false;

create unique index if not exists portfolios_one_default_uidx
  on public.portfolios ((true)) where is_default;

-- The oldest portfolio is the original book. Only set when none is marked.
update public.portfolios
   set is_default = true
 where id = (select id from public.portfolios order by created_at, id limit 1)
   and not exists (select 1 from public.portfolios where is_default);

do $$
begin
  if exists (select 1 from public.portfolios)
     and (select count(*) from public.portfolios where is_default) <> 1 then
    raise exception 'MP-0: expected exactly one default portfolio';
  end if;
end $$;

comment on column public.portfolios.is_default is
  'The book every scoped reader shows when no other portfolio is selected. '
  'At most one row (portfolios_one_default_uidx). MP-0.';

-- ── 2. The one choke point ──────────────────────────────────────────────────
-- SECURITY DEFINER because a function called inside a view runs as the QUERYING
-- role (anon), not the view owner, and portfolios is under RLS. Always call it
-- as (select public.atlas_active_portfolio()) so it is an InitPlan evaluated
-- once, not a per-row call.

create or replace function public.atlas_active_portfolio()
returns uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select id from public.portfolios where is_default
$fn$;

revoke execute on function public.atlas_active_portfolio() from public;
grant execute on function public.atlas_active_portfolio() to anon, authenticated, service_role;

comment on function public.atlas_active_portfolio() is
  'The portfolio every book-scoped reader is filtered to. MP-0: always the '
  'default portfolio. MP-2 (account switcher) changes this body and nothing else.';

-- ── 3. Scoped views over the four book tables ───────────────────────────────
-- A single-table view is AUTO-UPDATABLE and these are owned by postgres, so
-- Supabase's default grants would let anon INSERT/UPDATE/DELETE positions
-- THROUGH the view with RLS bypassed. Revoke everything; grant SELECT only.

create or replace view public.vw_active_positions as
  select * from public.positions
   where portfolio_id = (select public.atlas_active_portfolio());

create or replace view public.vw_active_account_snapshots as
  select * from public.account_snapshots
   where portfolio_id = (select public.atlas_active_portfolio());

create or replace view public.vw_active_transactions as
  select * from public.transactions
   where portfolio_id = (select public.atlas_active_portfolio());

create or replace view public.vw_active_equity_curve as
  select * from public.portfolio_equity_curve
   where portfolio_id = (select public.atlas_active_portfolio());

do $$
declare v text;
begin
  foreach v in array array['vw_active_positions','vw_active_account_snapshots',
                           'vw_active_transactions','vw_active_equity_curve'] loop
    execute format('revoke all on public.%I from public, anon, authenticated', v);
    execute format('grant select on public.%I to anon, authenticated, service_role', v);
    execute format($c$comment on view public.%I is %L$c$, v,
      'The book table filtered to atlas_active_portfolio(). Read this, never the '
      'base table, for anything that means "my book". MP-0.');
  end loop;
end $$;

-- ── 4. Rewrite every book-scoped reader ─────────────────────────────────────

create or replace function pg_temp.mp0_scope(src text) returns text
language plpgsql immutable as $fn$
declare
  t   text;
  kw  constant text :=
    'where|join|left|right|inner|cross|full|group|order|limit|on|union|window|'
    'having|except|intersect|returning|for|natural|using|offset|fetch|lateral|tablesample';
  tgt text;
begin
  foreach t in array array['positions','account_snapshots','transactions','portfolio_equity_curve'] loop
    tgt := case t when 'portfolio_equity_curve' then 'vw_active_equity_curve'
                  else 'vw_active_' || t end;
    -- Pass 1: a reference that already carries an alias keeps it.
    src := regexp_replace(src,
      '\m(from|join)(\s+)(public\.)?' || t || '\M(\s+(as\s+)?(?!(' || kw || ')\M)[a-z_][a-z0-9_]*)',
      '\1\2public.' || tgt || '\4', 'gi');
    -- Pass 2: a bare reference is aliased back to the table's own name, so
    -- qualified column references (positions.as_of_date) still resolve.
    src := regexp_replace(src,
      '\m(from|join)(\s+)(public\.)?' || t || '\M',
      '\1\2public.' || tgt || ' ' || t, 'gi');
  end loop;
  return src;
end $fn$;

do $$
declare
  r        record;
  v_old    text;
  v_new    text;
  v_n      int;
  v_opts   text;
begin
  for r in
    select * from (values
      ('nexus_holdings', 2), ('nexus_options', 2), ('nexus_portfolio_aggregates', 2),
      ('vw_book_realised_returns', 1), ('vw_command_centre', 3),
      ('vw_earnings_calendar', 2), ('vw_filled_transactions', 1),
      ('vw_held_symbols_absent_from_matrix', 2), ('vw_pcm_allocation', 2),
      ('vw_pcm_drift', 2), ('vw_pcm_risk', 2), ('vw_performance_suite', 2),
      ('vw_portfolio_home', 1), ('vw_portfolio_nav_daily', 2),
      ('vw_portfolio_returns_daily', 1), ('vw_position_reconciliation', 2),
      ('vw_position_returns', 2), ('vw_positions_current', 3),
      ('vw_positions_exited_intraday', 3), ('vw_quant_correlation', 2),
      ('vw_quant_dashboard', 2), ('vw_quant_drawdown', 2),
      ('vw_quant_rolling_returns', 2), ('vw_screener', 2), ('vw_sleeve_headroom', 1)
    ) as x(name, expected)
  loop
    select pg_get_viewdef(c.oid, true), array_to_string(c.reloptions, ', ')
      into v_old, v_opts
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = r.name and c.relkind = 'v';
    if v_old is null then
      raise exception 'MP-0: view % not found', r.name;
    end if;
    if v_old ~ 'vw_active_' then
      raise exception 'MP-0: view % already reads a scoped view -- refusing to re-patch', r.name;
    end if;
    v_new := pg_temp.mp0_scope(v_old);
    select count(*) into v_n
      from regexp_matches(v_new, 'public\.vw_active_(positions|account_snapshots|transactions|equity_curve)\M', 'g');
    if v_n <> r.expected then
      raise exception 'MP-0: view % -- % references rewritten, expected %', r.name, v_n, r.expected;
    end if;
    execute format('create or replace view public.%I%s as %s',
                   r.name,
                   case when v_opts is not null then ' with (' || v_opts || ')' else '' end,
                   rtrim(v_new, E'; \n'));
  end loop;

  for r in
    select * from (values
      ('public.data_freshness()', 2),
      ('public.atlas_run_validation()', 6),
      ('public.atlas_symbol_search(text, integer)', 2),
      ('public.atlas_verdict_preflight()', 2),
      ('public.atlas_write_verdicts(date, text, boolean)', 2)
    ) as x(sig, expected)
  loop
    v_old := pg_get_functiondef(r.sig::regprocedure);
    if v_old ~ 'vw_active_' then
      raise exception 'MP-0: function % already reads a scoped view -- refusing to re-patch', r.sig;
    end if;
    v_new := pg_temp.mp0_scope(v_old);
    select count(*) into v_n
      from regexp_matches(v_new, 'public\.vw_active_(positions|account_snapshots|transactions|equity_curve)\M', 'g');
    if v_n <> r.expected then
      raise exception 'MP-0: function % -- % references rewritten, expected %', r.sig, v_n, r.expected;
    end if;
    execute v_new;
  end loop;
end $$;

-- ── 5. Nothing book-scoped may still read a base table ──────────────────────
-- The three universe-scoped functions above are the only permitted readers.

do $$
declare v_left text;
begin
  select string_agg(name, ', ') into v_left from (
    select c.relname as name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('v','m')
       and c.relname not like 'vw\_active\_%'
       and pg_get_viewdef(c.oid, true)
           ~* '\m(from|join)\s+(public\.)?(positions|account_snapshots|transactions|portfolio_equity_curve)\M'
    union all
    select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prolang <> 13
       and p.proname not in ('atlas_check_universe_price_coverage',
                             'atlas_refresh_asset_sectors',
                             'refresh_universe_correlations')
       and p.prosrc
           ~* '\m(from|join)\s+(public\.)?(positions|account_snapshots|transactions|portfolio_equity_curve)\M'
  ) s;
  if v_left is not null then
    raise exception 'MP-0: still reading an unscoped book table: %', v_left;
  end if;
end $$;
