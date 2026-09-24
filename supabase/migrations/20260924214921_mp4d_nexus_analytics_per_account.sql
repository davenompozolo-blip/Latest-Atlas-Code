-- MP-4d: the holdings analytics are computed PER ACCOUNT, and the flagship
-- read stops timing out cold.
--
-- 1. WHAT WAS WRONG. vw_nexus_holdings takes its analytic columns from
--    mv_nexus_holdings, a matview refreshed every 10 minutes by pg_cron with
--    no request header -- so it only ever describes the DEFAULT account, and
--    MP-2 correctly withheld it from every other account. But the withholding
--    blanked columns that are facts about the STOCK, not the book: beta, fair
--    value / upside, PEG, drawdown, next earnings, the technical / quant /
--    macro signals -- and conviction_score itself, which is a blend of the
--    stock's valuation, macro, technical and quality reads. On Atlas
--    Secondary every one of those was NULL for all 38 names.
--
--    The book-dependent columns (total_return_pct from vw_performance_suite,
--    var_contribution_pct from vw_risk_analysis) are request-scoped since MP-0:
--    computed UNDER an account's header, they describe that account. The
--    matview could never do that, because a matview has one context.
--
-- 2. THE FIX. nexus_holdings_analytics holds the same computation once per
--    portfolio, keyed (portfolio_id, symbol). atlas_refresh_nexus_holdings_
--    analytics() evaluates vw_nexus_holdings_compute (the matview's own SQL)
--    under each portfolio's x-atlas-portfolio header in turn, so every
--    request-scoped view underneath answers for that account. It runs on the
--    existing 10-minute job, logs one sync_log row per portfolio, and one
--    account failing neither blocks nor rolls back the others.
--
--    mv_nexus_holdings is KEPT: vw_nexus_price_freshness reads it, and it
--    remains the default account's snapshot. vw_nexus_holdings no longer does.
--
-- 3. THE COLD TIMEOUT. vw_nexus_holdings measured ~1.1s warm and past anon's
--    3s cap cold, and a failed read drops the whole flagship to its mock
--    baseline -- which is what both accounts showed. Two nodes:
--      * quality_grade was computed live from vw_portfolio_home.quality_score,
--        which drags in that view's unbounded returns/stats CTE (57k price
--        rows, an external sort; H-4 recorded the planner used to prune it).
--        quality_grade is an analytic like conviction_score, so it now comes
--        from the per-account table -- and the CTE is pruned again.
--      * the 120-day vol was a DISTINCT ON over all of universe_risk_stats,
--        whose only index leads with the date. A LATERAL top-1 per held name
--        on a new (symbol, window_days, as_of_date desc) index.
--      * vw_positions_current aggregated every snapshot and every position
--        row the account ever wrote to find the newest (4b).
--      * two single-reference CTEs over equity_screener_universe were inlined
--        into a nested loop and evaluated once per holding (5d).
--    Measured in a rolled-back run as anon: 3,520 ms -> 126 ms (default),
--    2,108 ms -> 84 ms (Secondary). Output proven identical: every column of
--    vw_nexus_holdings for the default account against a freshly refreshed
--    matview, and vw_positions_current EXCEPT ALL both ways for both accounts.

-- ── 1. The computation, as a plain view ─────────────────────────────────────

do $$
begin
  execute 'create view public.vw_nexus_holdings_compute as '
       || rtrim(pg_get_viewdef('public.mv_nexus_holdings'::regclass, true), E'; \n');
end $$;

comment on view public.vw_nexus_holdings_compute is
  'mv_nexus_holdings'' definition as a view, evaluated per account by '
  'atlas_refresh_nexus_holdings_analytics(). Seconds per call: never read it '
  'from a surface. MP-4d.';

revoke all on public.vw_nexus_holdings_compute from public, anon, authenticated;

-- ── 2. The per-account table ────────────────────────────────────────────────

create table public.nexus_holdings_analytics as
  select null::uuid as portfolio_id, null::timestamptz as computed_at, c.*
    from public.vw_nexus_holdings_compute c
  with no data;

alter table public.nexus_holdings_analytics
  alter column portfolio_id set not null,
  alter column computed_at  set not null,
  alter column symbol       set not null,
  add primary key (portfolio_id, symbol),
  add constraint nha_portfolio_fk foreign key (portfolio_id)
      references public.portfolios(id) on delete cascade;

comment on table public.nexus_holdings_analytics is
  'Holdings analytics (conviction, signals, valuation, book-scoped returns and '
  'risk share) computed under each portfolio''s own context every 10 minutes. '
  'Read through vw_nexus_holdings, never directly. MP-4d.';

-- Read only through vw_nexus_holdings, which runs as its owner and filters to
-- the active account. No browser grant, and RLS on with no policy.
alter table public.nexus_holdings_analytics enable row level security;
revoke all on public.nexus_holdings_analytics from public, anon, authenticated;

-- ── 3. The writer ───────────────────────────────────────────────────────────

create or replace function public.atlas_refresh_nexus_holdings_analytics()
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
    values ('refresh_nexus_holdings_analytics', 'pg_cron', 'running', r.id, clock_timestamp(),
            jsonb_build_object('portfolio', r.name))
    returning id into v_log;

    begin
      -- Every request-scoped view under the computation now answers for r.id.
      perform set_config('request.headers',
                         json_build_object('x-atlas-portfolio', r.id::text)::text, true);

      delete from public.nexus_holdings_analytics where portfolio_id = r.id;
      get diagnostics v_del = row_count;

      insert into public.nexus_holdings_analytics
      select r.id, clock_timestamp(), c.* from public.vw_nexus_holdings_compute c;
      get diagnostics v_n = row_count;

      update public.sync_log
         set status = case when v_n > 0 then 'success' else 'skipped' end,
             finished_at = clock_timestamp(),
             details = details || jsonb_build_object('rows_written', v_n, 'rows_replaced', v_del,
                        'reason', case when v_n = 0 then 'no held positions' end)
       where id = v_log;
    exception when others then
      -- The block's writes roll back; the log row was written outside it.
      update public.sync_log
         set status = 'error', finished_at = clock_timestamp(), error_message = sqlerrm
       where id = v_log;
    end;
  end loop;

  -- Leave the caller's context as it was found.
  perform set_config('request.headers', coalesce(v_orig, ''), true);
end
$fn$;

comment on function public.atlas_refresh_nexus_holdings_analytics() is
  'Writes nexus_holdings_analytics for every portfolio, each under its own '
  'x-atlas-portfolio context. One sync_log row per portfolio. MP-4d.';

revoke execute on function public.atlas_refresh_nexus_holdings_analytics() from public, anon, authenticated;

-- On the existing 10-minute job, straight after the default matview and
-- BEFORE mv_bench_contribution, which reads vw_nexus_holdings.
create or replace function public.refresh_nexus_holdings()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_nexus_holdings;
  PERFORM public.atlas_refresh_nexus_holdings_analytics();
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_bench_contribution;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_book_candidate_map;
END;
$fn$;

-- ── 4. The vol lookup's index ───────────────────────────────────────────────

create index if not exists universe_risk_stats_symbol_window_date_idx
  on public.universe_risk_stats (symbol, window_days, as_of_date desc);

-- ── 4b. vw_positions_current: two clocks, stopped ───────────────────────────
-- Its watermark was max(as_of) GROUP BY portfolio over every snapshot the
-- account ever wrote (49k rows for the default account, +288 a day) and its
-- date was max(as_of_date) over every position row (11k). Both were flagged
-- as growth-linked on 2026-09-17; cold they cost ~570 ms of every holdings
-- read. vw_active_* is one portfolio, so the watermark is the newest row by
-- the existing (portfolio_id, as_of desc) index, and the date gets an index
-- of its own. Same rows out: the GROUP BY returned one row per the one
-- portfolio in scope, or none -- and so does the LIMIT 1.

create index if not exists positions_portfolio_as_of_date_idx
  on public.positions (portfolio_id, as_of_date desc);

do $$
declare
  v_def text := pg_get_viewdef('public.vw_positions_current'::regclass, true);
  o text := E'SELECT account_snapshots.portfolio_id,\n            max(account_snapshots.as_of) AS last_sync_at\n           FROM vw_active_account_snapshots account_snapshots\n          GROUP BY account_snapshots.portfolio_id';
  nw text := E'SELECT account_snapshots.portfolio_id,\n            account_snapshots.as_of AS last_sync_at\n           FROM vw_active_account_snapshots account_snapshots\n          ORDER BY account_snapshots.as_of DESC\n         LIMIT 1';
begin
  if (length(v_def) - length(replace(v_def, o, ''))) / length(o) <> 1 then
    raise exception 'MP-4d: vw_positions_current watermark anchor not found exactly once';
  end if;
  execute 'create or replace view public.vw_positions_current as ' || rtrim(replace(v_def, o, nw), E'; \n');
end $$;

-- ── 5. vw_nexus_holdings reads the active account's analytics ───────────────

do $$
declare
  v_def text := pg_get_viewdef('public.vw_nexus_holdings'::regclass, true);
  v_new text;
  n     int;
  -- (a) the source of the analytic columns
  a_old constant text := E'FROM mv_nexus_holdings\n                  WHERE ( SELECT atlas_on_default_portfolio() AS atlas_on_default_portfolio)) m';
  a_new constant text := E'FROM nexus_holdings_analytics mv_nexus_holdings\n                  WHERE mv_nexus_holdings.portfolio_id = ( SELECT atlas_active_portfolio() AS atlas_active_portfolio)) m';
  -- (c) the vol lookup
  c_old constant text := 'LEFT JOIN vol v ON v.symbol = ph.symbol';
  c_new constant text := 'LEFT JOIN LATERAL ( SELECT u.vol_annual FROM universe_risk_stats u '
                      || 'WHERE u.symbol = ph.symbol AND u.window_days = 120 '
                      || 'ORDER BY u.as_of_date DESC LIMIT 1) v ON true';
begin
  if v_def ~ 'nexus_holdings_analytics' then
    raise exception 'MP-4d: vw_nexus_holdings already reads nexus_holdings_analytics -- refusing to re-patch';
  end if;

  if (length(v_def) - length(replace(v_def, a_old, ''))) / length(a_old) <> 1 then
    raise exception 'MP-4d: analytics-source anchor not found exactly once';
  end if;
  v_new := replace(v_def, a_old, a_new);

  -- (b) quality_grade from the per-account table, not from the live
  -- quality_score (which is what kept the unbounded stats CTE alive).
  select count(*) into n
    from regexp_matches(v_new, 'CASE\s+WHEN COALESCE\(ph\.quality_score, 0::numeric\) >= 85::numeric.*?END AS quality_grade', 'g');
  if n <> 1 then
    raise exception 'MP-4d: quality_grade CASE found % times, expected 1', n;
  end if;
  v_new := regexp_replace(v_new,
             'CASE\s+WHEN COALESCE\(ph\.quality_score, 0::numeric\) >= 85::numeric.*?END AS quality_grade',
             'm.quality_grade');

  if (length(v_new) - length(replace(v_new, c_old, ''))) / length(c_old) <> 1 then
    raise exception 'MP-4d: vol join anchor not found exactly once';
  end if;
  v_new := replace(v_new, c_old, c_new);

  if v_new ~ 'ph\.quality_score' then
    raise exception 'MP-4d: vw_nexus_holdings still reads ph.quality_score';
  end if;

  -- (d) equity_screener_universe is a view that re-parses equity_cache JSON
  -- (~50 ms). With the book's row count misestimated at 1, the planner put it
  -- on the inner side of a nested loop and evaluated it once per holding
  -- (3.4 s measured). The `mkt` median over the same view had the identical
  -- fault once that was fixed: a CTE referenced once is INLINED since PG12,
  -- and its Aggregate ran 64 times. Both are MATERIALIZED -- evaluated once.
  if (length(v_new) - length(replace(v_new, 'LEFT JOIN equity_screener_universe esu ON esu.symbol = ph.symbol', '')))
       / length('LEFT JOIN equity_screener_universe esu ON esu.symbol = ph.symbol') <> 1
     or left(ltrim(v_new), 12) <> 'WITH mkt AS ' then
    raise exception 'MP-4d: forward-P/E join anchors not found exactly once';
  end if;
  v_new := replace(v_new, 'LEFT JOIN equity_screener_universe esu ON esu.symbol = ph.symbol',
                          'LEFT JOIN esu_fpe esu ON esu.symbol = ph.symbol');
  v_new := regexp_replace(v_new, '^\s*WITH mkt AS ',
             'WITH esu_fpe AS MATERIALIZED ( SELECT equity_screener_universe.symbol, '
          || 'equity_screener_universe.forward_pe FROM equity_screener_universe ), mkt AS MATERIALIZED ');

  execute 'create or replace view public.vw_nexus_holdings as ' || rtrim(v_new, E'; \n');
end $$;

-- ── 6. Populate, and assert ─────────────────────────────────────────────────

select public.atlas_refresh_nexus_holdings_analytics();
analyze public.nexus_holdings_analytics;

do $$
declare
  v_missing text;
begin
  -- Every portfolio with a current book has analytics.
  select string_agg(p.name, ', ') into v_missing
    from public.portfolios p
   where exists (select 1 from public.positions x
                  where x.portfolio_id = p.id and x.as_of_date >= current_date - 3)
     and not exists (select 1 from public.nexus_holdings_analytics a where a.portfolio_id = p.id);
  if v_missing is not null then
    raise exception 'MP-4d: no analytics written for %', v_missing;
  end if;
  if has_table_privilege('anon', 'public.nexus_holdings_analytics', 'select') then
    raise exception 'MP-4d: nexus_holdings_analytics is readable by anon';
  end if;
end $$;
