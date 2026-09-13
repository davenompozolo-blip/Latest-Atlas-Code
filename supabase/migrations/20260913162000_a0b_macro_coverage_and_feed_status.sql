-- A0b coverage report, plus the macro layer's entry in atlas_feed_status().

create or replace view public.vw_macro_series_coverage as
with frontier as (select max(date) as layer_last from public.macro_series_values)
select s.series_key,
       s.label,
       s.units,
       s.provider,
       s.provider_code,
       s.inception_date,
       min(v.date)                             as first_obs,
       max(v.date)                             as last_obs,
       count(v.date)::bigint                   as observations,
       (min(v.date) = s.inception_date)        as inception_matches,
       -- Measured against the macro layer's own frontier, never now(): these
       -- are weekday feeds and would read "late" every Sunday against wall
       -- clock. Same reason atlas_last_traded_day() exists.
       (f.layer_last - max(v.date))::int       as days_behind_layer,
       s.active
  from public.macro_series s
  left join public.macro_series_values v on v.series_key = s.series_key
  cross join frontier f
 group by s.series_key, s.label, s.units, s.provider, s.provider_code,
          s.inception_date, s.active, f.layer_last;

comment on view public.vw_macro_series_coverage is
  'A0b coverage report. days_behind_layer is measured against the newest date '
  'anywhere in macro_series_values, not against now() -- publication lag is not '
  'uniform across FRED series and a two-session lag on Brent is normal, not late.';

alter view public.vw_macro_series_coverage set (security_invoker = on);
grant select on public.vw_macro_series_coverage to anon, authenticated, service_role;

-- Add the macro layer to the feed sweep. It reports the MINIMUM of the
-- per-series latest dates, not the maximum: T10Y2Y alone publishing would
-- otherwise keep this row green while the other six sat frozen. A measure
-- scoped to the healthiest member cannot see the rest of the set stop --
-- the same mistake price_coverage made counting holdings while the universe
-- froze for eleven sessions.
create or replace function public.atlas_feed_status()
 returns table(feed text, latest date, rows bigint, days_late integer, verdict text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
    with lt as (select atlas_last_traded_day() as d),
    feeds as (
        select 'signal_scores'::text as feed, max(s.as_of_date)::date as latest, count(*)::bigint as rows, 2 as grace from signal_scores s
        union all select 'vol_dispersion_daily', max(v.date)::date, count(*)::bigint, 4 from vol_dispersion_daily v
        union all select 'options_positioning_snapshots', max(o.snapshot_date)::date, count(*)::bigint, 4 from options_positioning_snapshots o
        union all select 'holding_vol_trailing', max(h.asof)::date, count(*)::bigint, 4 from holding_vol_trailing h
        union all select 'fund_prices_raw', max(f.price_date)::date, count(*)::bigint, 4 from fund_prices_raw f
        union all select 'equity_screener_universe', max(e.cached_at)::date, count(*)::bigint, 8 from equity_screener_universe e
        union all select 'theme_leadership_weekly', max(t.snapshot_date)::date, count(*)::bigint, 8 from theme_leadership_weekly t
        -- Brent publishes with the longest lag of the seven, typically two
        -- sessions, so grace is 4 to clear that plus a weekend.
        union all select 'macro_series_values',
                         (select min(m.last_obs) from (
                            select max(mv.date) as last_obs
                              from macro_series_values mv
                              join macro_series ms using (series_key)
                             where ms.active
                             group by mv.series_key) m),
                         (select count(*)::bigint from macro_series_values), 4
    )
    select f.feed, f.latest, f.rows,
           case when f.latest is null then null else (lt.d - f.latest) end as days_late,
           case when f.rows = 0 then 'empty'
                when f.latest is null then 'empty'
                when lt.d is null then 'unknown'
                when lt.d - f.latest > f.grace then 'stale'
                else 'ok' end as verdict
      from feeds f cross join lt order by 1;
$function$;
