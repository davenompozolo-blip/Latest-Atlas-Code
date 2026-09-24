-- MP-4f: bench contribution and price freshness follow the account switch.
--
-- MP-2 gated both on atlas_on_default_portfolio(), so Atlas Secondary's Nexus
-- Contribution panel reads "the contribution feed did not answer"-shaped
-- absences and its data-integrity strip has no freshness rows. Neither needs
-- to be default-only:
--
-- 1. vw_bench_contribution read mv_bench_contribution, a matview refreshed by
--    pg_cron with no request header -- so it only ever described the default
--    book. Every input underneath it is request-scoped since MP-0 / MP-4d
--    (vw_position_nav_daily, vw_nexus_holdings), so the same computation run
--    under each portfolio's header describes that portfolio. That is the
--    MP-4d shape again: a per-account TABLE filled by the 10-minute job, never
--    a per-account refresh of a shared matview (which would hand one account's
--    book to every reader until the next refresh).
--
-- 2. vw_nexus_price_freshness took its symbol set from mv_nexus_holdings (the
--    default book, gated) and joined price_history with no interval filter and
--    no bound. It now takes the active account's live holdings from
--    vw_nexus_holdings and reads each name's newest 1d bar with a LATERAL
--    top-1 on the unique index -- the 2026-08-18 rule, and the `interval`
--    filter the 2026-09-21 entry flagged as missing here. SPY is the only
--    asset carrying a non-1d bar and it is not held, so no held name's date
--    moves.
--
-- Secondary's first fill was 2026-09-24, and a contribution needs two
-- consecutive priced sessions, so its contribution rows fill in from the next
-- session. Until then its names read `covered = false` with the view's own
-- coverage_reason -- a statement about its history, which is true.

-- ── 1. The contribution computation, as a plain view ────────────────────────

do $$
begin
  if to_regclass('public.vw_bench_contribution_compute') is not null then
    raise exception 'MP-4f: vw_bench_contribution_compute already exists -- refusing to re-apply';
  end if;
  execute 'create view public.vw_bench_contribution_compute as '
       || rtrim(pg_get_viewdef('public.mv_bench_contribution'::regclass, true), E'; \n');
end $$;

comment on view public.vw_bench_contribution_compute is
  'mv_bench_contribution''s definition as a view, evaluated per account by '
  'atlas_refresh_bench_contribution(). Never read it from a surface. MP-4f.';

revoke all on public.vw_bench_contribution_compute from public, anon, authenticated;

-- ── 2. The per-account table ────────────────────────────────────────────────

create table public.bench_contribution as
  select null::uuid as portfolio_id, c.*
    from public.vw_bench_contribution_compute c
  with no data;

alter table public.bench_contribution
  alter column portfolio_id set not null,
  alter column symbol       set not null,
  add primary key (portfolio_id, symbol),
  add constraint bc_portfolio_fk foreign key (portfolio_id)
      references public.portfolios(id) on delete cascade;

comment on table public.bench_contribution is
  'Per-position contribution (today, YTD, since entry) computed under each '
  'portfolio''s own context every 10 minutes. Read through '
  'vw_bench_contribution, never directly. MP-4f.';

alter table public.bench_contribution enable row level security;
revoke all on public.bench_contribution from public, anon, authenticated;

-- ── 3. The writer ───────────────────────────────────────────────────────────

create or replace function public.atlas_refresh_bench_contribution()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_orig  text := current_setting('request.headers', true);
  r       record;
  v_log   bigint;
  v_n     int;
  v_del   int;
begin
  for r in select p.id, p.name from public.portfolios p order by p.is_default desc, p.name loop
    insert into public.sync_log (function_name, source, status, portfolio_id, started_at, details)
    values ('refresh_bench_contribution', 'pg_cron', 'running', r.id, clock_timestamp(),
            jsonb_build_object('portfolio', r.name))
    returning id into v_log;

    begin
      -- vw_position_nav_daily and vw_nexus_holdings now answer for r.id.
      perform set_config('request.headers',
                         json_build_object('x-atlas-portfolio', r.id::text)::text, true);

      delete from public.bench_contribution where portfolio_id = r.id;
      get diagnostics v_del = row_count;

      insert into public.bench_contribution
      select r.id, c.* from public.vw_bench_contribution_compute c;
      get diagnostics v_n = row_count;

      update public.sync_log
         set status = case when v_n > 0 then 'success' else 'skipped' end,
             finished_at = clock_timestamp(),
             details = details || jsonb_build_object('rows_written', v_n, 'rows_replaced', v_del,
                        'reason', case when v_n = 0 then 'no held positions' end)
       where id = v_log;
    exception when others then
      update public.sync_log
         set status = 'error', finished_at = clock_timestamp(), error_message = sqlerrm
       where id = v_log;
    end;
  end loop;

  perform set_config('request.headers', coalesce(v_orig, ''), true);
end
$fn$;

comment on function public.atlas_refresh_bench_contribution() is
  'Writes bench_contribution for every portfolio, each under its own '
  'x-atlas-portfolio context. One sync_log row per portfolio. MP-4f.';

revoke execute on function public.atlas_refresh_bench_contribution() from public, anon, authenticated;

-- Holdings analytics first: the contribution reads vw_nexus_holdings, which
-- reads nexus_holdings_analytics for the account being computed.
create or replace function public.refresh_nexus_holdings()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_nexus_holdings;
  PERFORM public.atlas_refresh_nexus_holdings_analytics();
  PERFORM public.atlas_refresh_bench_contribution();
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_book_candidate_map;
END;
$fn$;

-- First fill, so the view is never empty between apply and the next tick.
select public.atlas_refresh_bench_contribution();

-- ── 4. The reader follows the active account ────────────────────────────────

create or replace view public.vw_bench_contribution as
 select symbol, contrib_today, contrib_ytd, contrib_since_entry,
        series_start, series_end, observations, covered, coverage_reason,
        actual_weight_pct, nav_coverage_pct, computed_at
   from public.bench_contribution
  where portfolio_id = (select public.atlas_active_portfolio());

comment on view public.vw_bench_contribution is
  'Per-position contribution for the ACTIVE account, from bench_contribution '
  '(10-minute job, computed under each account''s own context). MP-4f.';

-- The matview is now read by nothing and refreshed by nothing. A stale matview
-- left in place is one grep away from being consumed as current.
drop materialized view public.mv_bench_contribution;

-- ── 5. Price freshness follows the active account ───────────────────────────

create or replace view public.vw_nexus_price_freshness as
 select h.symbol,
        lb.price_date as last_price_date,
        current_date - lb.price_date as days_old
   from public.vw_nexus_holdings h
   join public.assets a on a.symbol = h.symbol
   join lateral (
        select ph.price_date
          from public.price_history ph
         where ph.asset_id = a.id
           and ph."interval" = '1d'
         order by ph.price_date desc
         limit 1) lb on true;

comment on view public.vw_nexus_price_freshness is
  'Newest 1d bar per name in the ACTIVE account''s live holdings. LATERAL '
  'top-1 on the unique index; a name with no bar has no row. MP-4f.';

-- ── Assertions ──────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from public.bench_contribution b
              where not exists (select 1 from public.portfolios p where p.id = b.portfolio_id)) then
    raise exception 'MP-4f: orphan contribution rows';
  end if;
  if not exists (select 1 from public.bench_contribution
                  where portfolio_id = public.atlas_default_portfolio()) then
    raise exception 'MP-4f: the default account has no contribution rows after the first fill';
  end if;
  if has_function_privilege('anon', 'public.atlas_refresh_bench_contribution()', 'execute') then
    raise exception 'MP-4f: the writer is executable by anon';
  end if;
  if has_table_privilege('anon', 'public.bench_contribution', 'select') then
    raise exception 'MP-4f: bench_contribution is readable by anon directly';
  end if;
end $$;
