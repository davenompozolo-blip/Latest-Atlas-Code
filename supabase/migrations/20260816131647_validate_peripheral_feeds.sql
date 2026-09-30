create or replace function public.atlas_last_traded_day()
returns date language sql stable security definer set search_path to 'public'
as $$
    select max(ph.price_date) from price_history ph
    join assets a on a.id = ph.asset_id where a.symbol = 'SPY';
$$;

comment on function public.atlas_last_traded_day() is
'Most recent session with a SPY bar. SPY comes from an independent benchmark writer and is absent on real market holidays, so its presence marks a day the market traded - the same convention price_coverage already uses.';

create or replace function public.atlas_feed_status()
returns table (feed text, latest date, rows bigint, days_late integer, verdict text)
language sql stable security definer set search_path to 'public'
as $$
    with lt as (select atlas_last_traded_day() as d),
    feeds as (
        select 'signal_scores'::text as feed, max(s.as_of_date)::date as latest, count(*)::bigint as rows, 3 as grace from signal_scores s
        union all select 'vol_dispersion_daily', max(v.date)::date, count(*)::bigint, 4 from vol_dispersion_daily v
        union all select 'options_positioning_snapshots', max(o.snapshot_date)::date, count(*)::bigint, 4 from options_positioning_snapshots o
        union all select 'holding_vol_trailing', max(h.asof)::date, count(*)::bigint, 4 from holding_vol_trailing h
        union all select 'fund_prices_raw', max(f.price_date)::date, count(*)::bigint, 4 from fund_prices_raw f
        union all select 'equity_screener_universe', max(e.cached_at)::date, count(*)::bigint, 8 from equity_screener_universe e
        union all select 'theme_leadership_weekly', max(t.snapshot_date)::date, count(*)::bigint, 8 from theme_leadership_weekly t
    )
    select f.feed, f.latest, f.rows,
           case when f.latest is null then null else (lt.d - f.latest) end as days_late,
           case when f.rows = 0 then 'empty'
                when f.latest is null then 'empty'
                when lt.d is null then 'unknown'
                when lt.d - f.latest > f.grace then 'stale'
                else 'ok' end as verdict
      from feeds f cross join lt order by 1;
$$;

comment on function public.atlas_feed_status() is
'Freshness of every feed outside the Alpaca core. "empty" means the pipeline has never written a row; "stale" means it wrote once and stopped. The two are different failures and the message keeps them apart.';

grant execute on function public.atlas_last_traded_day() to service_role;
grant execute on function public.atlas_feed_status() to service_role, authenticated;
