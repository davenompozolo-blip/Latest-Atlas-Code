create or replace function public.atlas_feed_status()
returns table (feed text, latest date, rows bigint, days_late integer, verdict text)
language sql stable security definer set search_path to 'public'
as $$
    with lt as (select atlas_last_traded_day() as d),
    feeds as (
        select 'signal_scores'::text as feed, max(s.as_of_date)::date as latest, count(*)::bigint as rows, 2 as grace from signal_scores s
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
