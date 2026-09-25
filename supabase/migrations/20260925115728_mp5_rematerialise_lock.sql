-- MP-5 follow-up (CodeRabbit, PR #836): serialise atlas_rematerialise per
-- (name, account). REFRESH MATERIALIZED VIEW took a lock that made two
-- refreshes of one matview run in turn; delete + insert takes none, so two
-- overlapping recomputes of the same account could both delete and then
-- collide on the unique key. A transaction-scoped advisory lock restores the
-- serialisation. Body otherwise identical to 20260925114040.

create or replace function public.atlas_rematerialise(p_names text[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_pid   uuid := public.atlas_active_portfolio();
  v_name  text;
  v_n     int;
  v_out   jsonb := '{}'::jsonb;
begin
  foreach v_name in array p_names loop
    if v_name <> all (array['mv_book_daily_weights','mv_book_ex_index','mv_position_returns',
                            'mv_position_tier1','mv_position_tier2','mv_segment_ex_index']) then
      raise exception 'atlas_rematerialise: % is not a per-account materialisation', v_name;
    end if;
    -- One transaction: a reader sees the previous rows until commit, the
    -- property REFRESH ... CONCURRENTLY was used for.
    -- Serialise writers of the same (name, account), as REFRESH's lock did:
    -- two overlapping recomputes (the 23:35 returns refresh and a verdict run
    -- with p_refresh) would otherwise both delete, and the second insert would
    -- hit the unique key. Taken before the DELETE so it sees the first commit.
    perform pg_advisory_xact_lock(hashtextextended(v_name || ':' || v_pid::text, 0));
    execute format('delete from public.%I where portfolio_id = $1', v_name || '__acct') using v_pid;
    execute format('insert into public.%I select $1, c.* from public.%I c',
                   v_name || '__acct', v_name || '__compute') using v_pid;
    get diagnostics v_n = row_count;
    v_out := v_out || jsonb_build_object(v_name, v_n);
  end loop;
  return v_out;
end
$fn$;


revoke execute on function public.atlas_rematerialise(text[]) from public, anon, authenticated;
