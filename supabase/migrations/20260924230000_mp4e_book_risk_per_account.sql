-- MP-4e: book_risk_daily per account -- the first nightly history that
-- follows the account switch.
--
-- 1. WHY THIS ONE FIRST. MP-2 withheld book_risk_daily from every non-default
--    account (its read policy was atlas_on_default_portfolio()), so Atlas
--    Secondary's Risk tile reads NOT MEASURED. But the figures the Risk gauge
--    reads -- book_var_95_daily and total_vol_annual -- come from
--    vw_risk_analysis and vw_book_mctr, which are request-scoped since MP-0
--    and already correct for any account. Only the nightly WRITE was
--    single-book. Verdicts, segments, factor betas, regime CVaR and the VaR
--    backtest stay default-only: they rest on the return engine's matviews
--    and on the account's own return history, and Secondary's first fill was
--    2026-09-24 11:52 UTC -- there is nothing yet for them to measure.
--
-- 2. THE KEY. portfolio_id joins the key. Existing rows are the default
--    account's (they were written before a second account existed). The
--    column defaults to atlas_default_portfolio(), so atlas_write_verdicts --
--    whose inputs are the default book's matviews -- keeps writing the default
--    account with no change beyond its ON CONFLICT target, which must name the
--    new key or every run would fail with 42P10.
--
-- 3. THE WRITER. atlas_write_account_book_risk() evaluates, for each
--    NON-default portfolio in turn, under that portfolio's x-atlas-portfolio
--    context (the MP-4d mechanism):
--      total_vol_annual     vw_book_mctr.book_vol_annual (Sigma = D R D, B4)
--      book_var_95_daily    sum(vw_risk_analysis.dollar_var_95_daily)
--      sum_contributions    sum of Euler contributions; residual = vol - sum
--      effective_bets /     over the universe_clusters partition, the
--      cluster_shares       verdict job's own definitions
--      unmapped_theme_weight, positions_in_matrix, positions_absent_from_matrix
--    and leaves NULL everything that needs the return engine (traded / frozen
--    book return, trading effect, cluster eligibility): an absent number is
--    the honest reading for an account with no history, never a zero.
--    One difference from the default row, stated rather than hidden: the
--    verdict job sums over the positions it RANKED (open book), this over the
--    whole current book in vw_book_mctr / vw_risk_analysis.
--    A book behind the last traded day is refused (skipped), never written --
--    this is an append-only-in-practice history keyed on as_of.

-- ── 1. The key ──────────────────────────────────────────────────────────────

alter table public.book_risk_daily add column portfolio_id uuid;

update public.book_risk_daily
   set portfolio_id = (select public.atlas_default_portfolio())
 where portfolio_id is null;

alter table public.book_risk_daily
  alter column portfolio_id set not null,
  alter column portfolio_id set default public.atlas_default_portfolio(),
  add constraint brd_portfolio_fk foreign key (portfolio_id)
      references public.portfolios(id),
  drop constraint book_risk_daily_pkey,
  add constraint book_risk_daily_pkey primary key (portfolio_id, as_of, logic_version);

comment on column public.book_risk_daily.portfolio_id is
  'The account this row describes. Rows before MP-4e are the default account''s. '
  'Non-default rows carry only the live risk columns (atlas_write_account_book_risk). MP-4e.';

-- ── 2. The browser reads its own account ───────────────────────────────────

alter policy book_risk_daily_read on public.book_risk_daily
  using (portfolio_id = (select public.atlas_active_portfolio()));

-- ── 3. The verdict job's conflict target names the new key ─────────────────

do $$
declare
  v_def text := pg_get_functiondef('public.atlas_write_verdicts(date, text, boolean)'::regprocedure);
  o constant text := E'      ) mc ON true\n    ON CONFLICT (as_of, logic_version) DO NOTHING;';
  nw constant text := E'      ) mc ON true\n    ON CONFLICT (portfolio_id, as_of, logic_version) DO NOTHING;';
begin
  if position(nw in v_def) > 0 then
    raise exception 'MP-4e: atlas_write_verdicts already targets the new key -- refusing to re-patch';
  end if;
  if (length(v_def) - length(replace(v_def, o, ''))) / length(o) <> 1 then
    raise exception 'MP-4e: book_risk_daily ON CONFLICT anchor not found exactly once';
  end if;
  execute replace(v_def, o, nw);
end $$;

-- ── 4. The per-account writer ───────────────────────────────────────────────

create or replace function public.atlas_write_account_book_risk(
  p_as_of date default null,
  p_logic_version text default 'v1:rho0.75:n5:mwr')
returns table (out_portfolio text, out_status text, out_rows integer, out_note text)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_orig    text := current_setting('request.headers', true);
  v_as_of   date := coalesce(p_as_of, current_date);
  v_traded  date := public.atlas_last_traded_day();
  r         record;
  v_log     bigint;
  v_pos     date;
  v_n       int;
  v_status  text;
  v_note    text;
begin
  for r in select p.id, p.name from public.portfolios p
            where not coalesce(p.is_default, false)
            order by p.name loop
    insert into public.sync_log (function_name, source, status, portfolio_id, started_at, details)
    values ('atlas_write_account_book_risk', 'pg_cron', 'running', r.id, clock_timestamp(),
            jsonb_build_object('portfolio', r.name, 'as_of', v_as_of, 'logic_version', p_logic_version))
    returning id into v_log;

    v_n := 0; v_note := null;
    begin
      perform set_config('request.headers',
                         json_build_object('x-atlas-portfolio', r.id::text)::text, true);

      select max(p.as_of_date) into v_pos from public.vw_active_positions p;

      if not exists (select 1 from public.vw_positions_current) then
        v_status := 'skipped'; v_note := 'no current book';
      elsif v_pos is null or v_pos < v_traded then
        v_status := 'skipped';
        v_note := format('positions as of %s are behind the last traded day %s', v_pos, v_traded);
      else
        insert into public.book_risk_daily (
            portfolio_id, as_of, logic_version,
            total_vol_annual, book_var_95_daily, sum_contributions, residual,
            effective_bets, cluster_shares, unmapped_theme_weight, cluster_threshold_rho,
            positions_in_matrix, positions_absent_from_matrix,
            vol_basis, vol_matrix_as_of)
        with m as (
            select mm.symbol, mm.risk_contribution_annual, mm.book_vol_annual, mm.matrix_as_of
              from public.vw_book_mctr mm
        ),
        agg as (
            select max(book_vol_annual)::numeric as vol, max(matrix_as_of) as mx,
                   sum(risk_contribution_annual)::numeric as sc, count(*)::int as n
              from m
        ),
        clus as (
            select u.symbol, u.cluster_id from public.universe_clusters u
             where u.as_of_date = (select max(u2.as_of_date) from public.universe_clusters u2)
        ),
        share as (
            select c.cluster_id, sum(m.risk_contribution_annual)::numeric as contrib
              from m join clus c on c.symbol = m.symbol
             group by c.cluster_id
        ),
        share_n as (
            select cluster_id, contrib / nullif(sum(contrib) over (), 0) as s from share
        ),
        ra as (
            select v.symbol, v.weight::numeric as weight, v.dollar_var_95_daily::numeric as dollar_var_95_daily
              from public.vw_risk_analysis v
        )
        select r.id, v_as_of, p_logic_version,
               a.vol,
               (select sum(ra.dollar_var_95_daily) from ra),
               a.sc,
               a.vol - coalesce(a.sc, 0),
               (select 1.0 / nullif(sum(s * s), 0) from share_n),
               (select jsonb_object_agg(cluster_id::text, round(s, 6))
                  from share_n where cluster_id is not null),
               (select coalesce(sum(ra.weight) filter (
                         where not exists (select 1 from public.position_themes pt
                                            where pt.symbol = ra.symbol and pt.theme is not null)), 0)
                       / nullif(sum(ra.weight), 0)
                  from ra),
               0.75,
               a.n,
               (select count(*) from public.vw_held_symbols_absent_from_matrix),
               case when a.vol is null then null else 'mctr_covariance' end,
               case when a.vol is null then null else a.mx end
          from agg a
        on conflict (portfolio_id, as_of, logic_version) do nothing;

        get diagnostics v_n = row_count;
        v_status := case when v_n > 0 then 'success' else 'skipped' end;
        if v_n = 0 then v_note := 'already written for this as_of'; end if;
      end if;

      update public.sync_log
         set status = v_status, finished_at = clock_timestamp(),
             error_message = case when v_status = 'skipped' then v_note end,
             details = details || jsonb_build_object('rows_written', v_n, 'positions_as_of', v_pos,
                                                     'last_traded_day', v_traded)
       where id = v_log;
    exception when others then
      v_status := 'error'; v_note := sqlerrm;
      update public.sync_log
         set status = 'error', finished_at = clock_timestamp(), error_message = sqlerrm
       where id = v_log;
    end;

    out_portfolio := r.name; out_status := v_status; out_rows := v_n; out_note := v_note;
    return next;
  end loop;

  perform set_config('request.headers', coalesce(v_orig, ''), true);
end
$fn$;

comment on function public.atlas_write_account_book_risk(date, text) is
  'Writes book_risk_daily''s live risk columns for every non-default account, each under '
  'its own x-atlas-portfolio context; the default account is written by '
  'atlas_write_verdicts. One sync_log row per account. MP-4e.';

revoke execute on function public.atlas_write_account_book_risk(date, text) from public, anon, authenticated;

-- ── 5. Schedule: after the verdict job (23:37) and segments (23:38) ─────────

select cron.schedule('atlas_write_account_book_risk', '41 23 * * 1-5',
                     'select * from public.atlas_write_account_book_risk();');

-- ── Assertions ──────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from public.book_risk_daily where portfolio_id is distinct from public.atlas_default_portfolio()) then
    raise exception 'MP-4e: existing rows were not all stamped as the default account';
  end if;
  if has_function_privilege('anon', 'public.atlas_write_account_book_risk(date, text)', 'execute') then
    raise exception 'MP-4e: the writer is executable by anon';
  end if;
end $$;
