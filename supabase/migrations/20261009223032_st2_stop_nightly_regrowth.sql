-- ST-2: stop two jobs refilling the database every night.
--
-- After the restriction lifted on 2026-10-09 the database went from 414 MiB to
-- 516 MiB within two hours, back over the Free plan's 500 MB:
--   * refresh_holding_vol_trailing(400) rewrites 400 days of history for ~1,900
--     symbols every night (420k rows, 65 MB). atlas_prune_storage then deletes
--     all but 30 days at 02:30, so the table swells by ~60 MB every evening.
--     Every reader wants the newest days; the 400 days are only the lookback
--     the 20-session vol needs. It now READS p_days of prices and WRITES the
--     last 35 days. Signature unchanged (a new one would make an overload).
--   * refresh_universe_correlations replaced only the current snapshot, so the
--     previous one (~35 MB) sat beside it until the 02:30 prune. It now
--     replaces every snapshot for its window in the same transaction.
-- Both are textual patches of the live definitions, each anchor asserted to
-- occur exactly once, refusing an already-patched body.

do $$
declare
    v_def text;
    v_old text := 'from windowed
    on conflict (symbol, asof) do update';
    v_new text := 'from windowed
    -- ST-2: read p_days for the lookback, write only what readers use.
    where price_date >= current_date - 35
    on conflict (symbol, asof) do update';
begin
    select pg_get_functiondef('public.refresh_holding_vol_trailing(integer)'::regprocedure) into v_def;
    if position('ST-2' in v_def) > 0 then raise exception 'ST-2: refresh_holding_vol_trailing already patched'; end if;
    if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
        raise exception 'ST-2: holding-vol anchor not found exactly once';
    end if;
    execute replace(v_def, v_old, v_new);

    -- refresh_universe_correlations replaced only TODAY's snapshot, so the
    -- previous one sat beside it from ~22:00 until the 02:30 prune: a second
    -- ~35 MB copy every evening. Its delete now clears every snapshot for the
    -- window inside the same transaction, so readers see the old one until
    -- the new one commits and never two at rest.
    select pg_get_functiondef(p.oid) into v_def from pg_proc p
     where p.proname = 'refresh_universe_correlations';
    v_old := 'delete from public.universe_correlations
   where as_of_date = d_asof and window_days = p_window;';
    v_new := 'delete from public.universe_correlations
   where window_days = p_window;  -- ST-2: one snapshot at rest';
    if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
        raise exception 'ST-2: correlation writer anchor not found exactly once';
    end if;
    execute replace(v_def, v_old, v_new);
end $$;

revoke all on function public.refresh_holding_vol_trailing(integer) from public, anon, authenticated;
revoke all on function public.refresh_universe_correlations(integer, integer, numeric, integer) from public, anon, authenticated;

-- Trim now rather than wait for 02:30.
delete from public.holding_vol_trailing where asof < current_date - 30;
delete from public.universe_correlations
 where as_of_date < (select max(as_of_date) from public.universe_correlations);
