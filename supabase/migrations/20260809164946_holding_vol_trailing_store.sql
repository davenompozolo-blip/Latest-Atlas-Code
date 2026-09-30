-- §5.3 Trailing volatility store. Backs the §4.4 surfacing trigger, which is
-- not a panel: it decides which holdings are flagged `vol trigger` on today's
-- docket and renders nothing of its own.
--
-- Why a z-score rather than the raw daily move the legacy panel showed: raw
-- moves re-list the same high-beta names every session. NPSNY moving 12% is
-- not information. JNJ moving 4% is.
create table if not exists public.holding_vol_trailing (
    symbol   text    not null,
    asof     date    not null,
    ret_1d   numeric,
    vol_20d  numeric,          -- stdev of ret_1d over the trailing 20 sessions
    z_move   numeric,          -- abs(ret_1d) / vol_20d
    primary key (symbol, asof)
);

create index if not exists holding_vol_trailing_asof_z_idx
    on public.holding_vol_trailing (asof desc, z_move desc);

alter table public.holding_vol_trailing enable row level security;

drop policy if exists holding_vol_trailing_read on public.holding_vol_trailing;
create policy holding_vol_trailing_read on public.holding_vol_trailing
    for select to anon, authenticated using (true);

grant select on public.holding_vol_trailing to anon, authenticated;

-- Recomputes the trailing window from price_history. Idempotent: safe to run
-- repeatedly, and re-runs correct any row whose inputs have since been fixed.
--
-- z_move stays NULL until 20 prior sessions exist. The trigger abstains on a
-- short window rather than firing on one — a z-score off four observations is
-- noise wearing a statistic's clothing.
create or replace function public.refresh_holding_vol_trailing(p_days int default 400)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    n integer;
begin
    with px as (
        select a.symbol, p.price_date, p.close
        from price_history p
        join assets a on a.id = p.asset_id
        where p.interval = '1d'
          and p.close > 0
          and p.price_date >= current_date - p_days
    ), rets as (
        select
            symbol,
            price_date,
            close / nullif(lag(close) over w, 0) - 1 as ret_1d
        from px
        window w as (partition by symbol order by price_date)
    ), windowed as (
        select
            symbol,
            price_date,
            ret_1d,
            -- Trailing 20 sessions ENDING AT the prior row: today's own move
            -- must not inflate the yardstick it is being measured against.
            stddev_samp(ret_1d) over (
                partition by symbol order by price_date
                rows between 20 preceding and 1 preceding
            ) as vol_20d,
            count(ret_1d) over (
                partition by symbol order by price_date
                rows between 20 preceding and 1 preceding
            ) as obs
        from rets
        where ret_1d is not null
    )
    insert into holding_vol_trailing (symbol, asof, ret_1d, vol_20d, z_move)
    select
        symbol,
        price_date,
        round(ret_1d * 100, 4)                                    as ret_1d,
        case when obs >= 20 then round(vol_20d * 100, 4) end      as vol_20d,
        case when obs >= 20 and vol_20d > 0
             then round(abs(ret_1d) / vol_20d, 3)
        end                                                       as z_move
    from windowed
    on conflict (symbol, asof) do update
        set ret_1d  = excluded.ret_1d,
            vol_20d = excluded.vol_20d,
            z_move  = excluded.z_move;

    get diagnostics n = row_count;
    return n;
end;
$$;

revoke all on function public.refresh_holding_vol_trailing(int) from public, anon, authenticated;
