create or replace function public.refresh_universe_correlations(
  p_window   int     default 120,
  p_min_days int     default 60,
  p_lambda   numeric default 0.97
)
returns integer language plpgsql as $$
declare
  n_pairs integer := 0;
  d_asof  date;
begin
  select max(price_date) into d_asof from public.price_history;
  if d_asof is null then return 0; end if;

  create temp table _px on commit drop as
    select distinct on (a.symbol, ph.price_date)
           a.symbol, ph.price_date, ph.close
      from public.price_history ph
      join public.assets a on a.id = ph.asset_id
     where ph.close > 0
       and coalesce(a.asset_class, '') not in ('option', 'us_option', 'cash')
       and a.symbol !~ '\d{6}[CP]\d{8}$'
       and ph.price_date > d_asof - (p_window * 2)
     order by a.symbol, ph.price_date, ph.created_at desc nulls last;

  create temp table _ret on commit drop as
    select symbol, price_date, r
      from (
        select symbol, price_date,
               close / lag(close) over (partition by symbol order by price_date) - 1 as r
          from _px
      ) s
     where r is not null and abs(r) < 0.75;

  create temp table _grid on commit drop as
    select price_date, row_number() over (order by price_date desc) - 1 as days_back
      from (select distinct price_date from _ret) g
     order by price_date desc
     limit p_window;

  create temp table _rw on commit drop as
    select r.symbol, r.price_date, r.r, power(p_lambda, g.days_back) as w
      from _ret r join _grid g using (price_date);

  delete from public.universe_correlations
   where as_of_date = d_asof and window_days = p_window;

  insert into public.universe_correlations
    (as_of_date, symbol_1, symbol_2, window_days, correlation, correlation_simple, common_days)
  select d_asof, p.s1, p.s2, p_window, p.rho_w, p.rho_s, p.n
  from (
    select
      a.symbol as s1,
      b.symbol as s2,
      count(*) as n,
      ( (sum(a.w * a.r * b.r) / sum(a.w))
        - (sum(a.w * a.r) / sum(a.w)) * (sum(a.w * b.r) / sum(a.w)) )
      / nullif(
          sqrt( greatest(sum(a.w * a.r * a.r) / sum(a.w) - power(sum(a.w * a.r) / sum(a.w), 2), 0) )
        * sqrt( greatest(sum(a.w * b.r * b.r) / sum(a.w) - power(sum(a.w * b.r) / sum(a.w), 2), 0) ), 0)
        as rho_w,
      corr(a.r, b.r) as rho_s
    from _rw a
    join _rw b on b.price_date = a.price_date and a.symbol < b.symbol
    group by a.symbol, b.symbol
    having count(*) >= p_min_days
  ) p
  where p.rho_w is not null and p.rho_w between -1 and 1;

  get diagnostics n_pairs = row_count;

  delete from public.universe_risk_stats
   where as_of_date = d_asof and window_days = p_window;

  insert into public.universe_risk_stats
    (as_of_date, symbol, window_days, vol_daily, vol_daily_simple, vol_annual,
     beta_spy, adv_usd, last_close, last_price_date, obs_days)
  select
    d_asof, v.symbol, p_window,
    v.vol_w, v.vol_s, v.vol_w * sqrt(252), b.beta, l.adv_usd, lc.last_close, lc.last_date, v.n
  from (
    select symbol,
           count(*) as n,
           sqrt(greatest(sum(w * r * r) / sum(w) - power(sum(w * r) / sum(w), 2), 0)) as vol_w,
           stddev_samp(r) as vol_s
      from _rw group by symbol
  ) v
  left join lateral (
    select case when var_samp(m.r) > 0 then covar_samp(x.r, m.r) / var_samp(m.r) end as beta
      from _rw x join _rw m on m.price_date = x.price_date and m.symbol = 'SPY'
     where x.symbol = v.symbol
  ) b on true
  left join lateral (
    select avg(px.close * px.volume) as adv_usd
      from public.price_history px
     where px.asset_id in (select id from public.assets where symbol = v.symbol)
       and px.price_date > d_asof - 30
       and px.volume is not null
  ) l on true
  left join lateral (
    select px.close as last_close, px.price_date as last_date
      from public.price_history px
     where px.asset_id in (select id from public.assets where symbol = v.symbol)
     order by px.price_date desc
     limit 1
  ) lc on true
  where v.n >= p_min_days;

  return n_pairs;
end $$;

comment on function public.refresh_universe_correlations is
  'Nightly correlation/vol/ADV snapshot over the eligible price universe (spec 4.1). Pairs thinner than p_min_days common observations are skipped rather than written weak.';
