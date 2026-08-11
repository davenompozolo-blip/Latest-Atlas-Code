-- Widening the universe, and keeping the correlation matrix from exploding
-- when it arrives.
--
-- The Trade module's liquidity floor was rejecting 7,623 of 7,650 names almost
-- entirely for want of an ADV rather than for being illiquid, because ADV comes
-- from price_history and price_history only covered the book. api/price-backfill.js
-- fixes the coverage; this migration gives it somewhere to record its target
-- list, and stops the nightly correlation job from turning a 1,500-name
-- universe into a 1.1-million-row pairwise matrix.

create table if not exists public.price_backfill_targets (
  symbol        text primary key,
  rank          int not null,
  dollar_volume numeric,
  last_close    numeric,
  exchange      text,
  name          text,
  status        text not null default 'pending'
                check (status in ('pending','filled','failed','skipped')),
  ranked_at     timestamptz not null default now(),
  filled_at     timestamptz,
  bars_written  int
);

comment on table public.price_backfill_targets is
  'The ranked target list for api/price-backfill.js: Alpaca''s tradeable US equities ordered by dollar volume. Stored rather than recomputed so a resumable run always walks the same list.';

create index if not exists price_backfill_targets_rank_idx
  on public.price_backfill_targets (rank);

alter table public.price_backfill_targets enable row level security;

drop policy if exists price_backfill_targets_read on public.price_backfill_targets;
create policy price_backfill_targets_read on public.price_backfill_targets
  for select to anon, authenticated using (true);

-- ── Bound the correlation universe ───────────────────────────────────────────
-- Pairwise correlation is quadratic: 55 symbols is 1,485 pairs, 1,500 symbols
-- is 1,124,250 — and the self-join behind it is worse. Effective exposure only
-- ever asks "what in MY BOOK moves with this candidate", so the matrix needs
-- the book plus a liquid neighbourhood, not the entire market.
--
-- Everything held is always included regardless of rank, because the one
-- correlation you must never be missing is against a position you own.
--
-- The 3-argument version is dropped rather than left in place: an overload
-- differing only by a defaulted trailing parameter makes every existing
-- 3-argument call ambiguous.
drop function if exists public.refresh_universe_correlations(int, int, numeric);

create or replace function public.refresh_universe_correlations(
  p_window      int     default 120,
  p_min_days    int     default 60,
  p_lambda      numeric default 0.97,
  p_max_symbols int     default 400
)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n_pairs integer := 0;
  d_asof  date;
begin
  select max(price_date) into d_asof from public.price_history;
  if d_asof is null then return 0; end if;

  -- The symbols worth carrying: everything currently held, plus the most
  -- liquid names up to the cap.
  create temp table _uni on commit drop as
    with held as (
      select distinct a.symbol
        from public.positions p
        join public.assets a on a.id = p.asset_id
       where p.as_of_date = (select max(as_of_date) from public.positions)
         and p.quantity is not null and p.quantity <> 0
    ),
    liquid as (
      select a.symbol, avg(ph.close * ph.volume) as adv
        from public.price_history ph
        join public.assets a on a.id = ph.asset_id
       where ph.price_date > d_asof - 30
         and ph.volume is not null and ph.close > 0
         and coalesce(a.asset_class, '') not in ('option','us_option','cash')
         and a.symbol !~ '\d{6}[CP]\d{8}$'
       group by a.symbol
       order by 2 desc nulls last
       limit p_max_symbols
    )
    select symbol from held
    union
    select symbol from liquid
    union
    select 'SPY';                      -- the beta reference must always be present

  create temp table _px on commit drop as
    select distinct on (a.symbol, ph.price_date)
           a.symbol, ph.price_date, ph.close
      from public.price_history ph
      join public.assets a on a.id = ph.asset_id
     where ph.close > 0
       and a.symbol in (select symbol from _uni)
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
  create index on _rw (price_date);

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

  -- Risk stats, by contrast, are per-symbol and linear, so they are computed
  -- for every name with a usable series — the ticket needs a vol for anything
  -- it might size, not just for the correlation neighbourhood.
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
  'Nightly correlation/vol/ADV snapshot (spec §4.1). The pairwise matrix is bounded to the book plus the p_max_symbols most liquid names, because correlation is quadratic and effective exposure only ever asks what in YOUR BOOK moves with a candidate.';

revoke all on function public.refresh_universe_correlations(int, int, numeric, int) from public;
grant execute on function public.refresh_universe_correlations(int, int, numeric, int)
  to anon, authenticated, service_role;
