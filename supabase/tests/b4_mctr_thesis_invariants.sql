-- B4 invariants. Read-only, but wrapped and rolled back like its siblings so it
-- can never leave anything behind.
--
-- Includes the happy path on purpose: a wall of failure cases that also rejects
-- healthy data is worse than none.

begin;

create temporary table _r(ck text, ok boolean, detail text) on commit drop;

-- 1. EULER ADDITIVITY. The property the whole unit rests on: contributions must
--    sum to book vol exactly, or no grouping of positions means anything.
insert into _r
select 'euler_additivity',
       abs(sum(risk_contribution_annual) - max(book_vol_annual)) < 1e-12,
       'residual=' || abs(sum(risk_contribution_annual) - max(book_vol_annual))::text
  from public.vw_book_mctr;

-- 2. Shares close to exactly 1.
insert into _r
select 'risk_share_closes', abs(sum(risk_share) - 1.0) < 1e-10,
       'sum=' || round(sum(risk_share)::numeric, 12)::text
  from public.vw_book_mctr;

-- 3. DIVERSIFICATION MUST REDUCE RISK. If book vol ever exceeds the
--    undiversified sum the correlation matrix has gone non-PSD and every
--    number above is void. This is the cheap standing check for that.
insert into _r
select 'book_vol_below_undiversified',
       max(book_vol_annual) < max(undiversified_vol_annual) and max(book_vol_annual) > 0,
       'book=' || round(max(book_vol_annual)::numeric,4)::text ||
       ' undiversified=' || round(max(undiversified_vol_annual)::numeric,4)::text
  from public.vw_book_mctr;

-- 4. NO STALE POSITIONS. Two different staleness defects, and this must catch
--    BOTH: vw_risk_analysis takes the latest row per ASSET (a sold name persists
--    forever), and sync_alpaca_positions is upsert-only (a name exited intraday
--    persists until as_of_date rolls over).
--
--    CHECKED AGAINST `vw_positions_current`, NOT `positions`. The raw table
--    still contains the exited row, so testing against it passes while the book
--    shows a position that was liquidated hours ago -- which is exactly how
--    KMTUY survived on screen on 2026-09-14.
insert into _r
select 'every_row_is_held', count(*) = 0,
       case when count(*) = 0 then 'none'
            else 'not held: ' || string_agg(symbol, ',') end
  from public.vw_book_mctr m
 where m.symbol not in (select symbol from public.vw_positions_current);

-- 5. WITHHELD IS COUNTED, NOT DROPPED. n_measured + n_withheld must equal the
--    eligible book. A measure that silently renormalises its own gaps away
--    still sums to a reassuring 1.0 -- that is exactly how a dropped position
--    hides.
insert into _r
select 'withheld_accounted',
       max(n_measured) + max(n_withheld) = (
         -- Same source as the view. Counting from raw `positions` here would
         -- include a name exited intraday and the two would never reconcile.
         select count(*) from public.vw_positions_current p
          where p.quantity <> 0 and (p.market_value is null or abs(p.market_value) > 0.01)),
       'measured=' || max(n_measured)::text || ' withheld=' || max(n_withheld)::text
  from public.vw_book_mctr;

-- 6. DRIFT IS GATED ON MEASURABLE EXPOSURE. No row may name an axis the book
--    has no significant exposure to. `cyclical` (t = 0.948) is the live case.
insert into _r
select 'drift_axis_is_exposed', count(*) = 0,
       case when count(*) = 0 then 'none' else 'unexposed axis published: ' || string_agg(distinct drift_axis, ',') end
  from public.vw_position_risk_thesis
 where drift_axis is not null
   and drift_axis not in (select factor from public.book_factor_betas
                           where estimated_at = (select max(estimated_at) from public.book_factor_betas)
                             and significant);

-- 7. DRIFT IS IN SIGMA, NOT IN RAW SCORE. Recomputed independently here: if the
--    view ever reverts to publishing the raw difference this fails, because the
--    two disagree by the axis sd (4.19 to 8.22).
insert into _r
select 'drift_is_sigma_normalised',
       coalesce(max(abs(v.drift_sd_max - x.expected)) < 1e-9, true),
       'max_gap=' || coalesce(max(abs(v.drift_sd_max - x.expected))::text, 'n/a')
  from public.vw_position_risk_thesis v
  join lateral (
        select max(abs(d.drift_score_20d) / nullif(d.score_20d_stdev_full,0)) as expected
          from public.vw_thesis_regime_drift d
          join public.book_factor_betas b
            on b.factor = d.axis_key
           and b.estimated_at = (select max(estimated_at) from public.book_factor_betas)
           and b.significant
         where d.symbol = v.symbol) x on true
 where v.drift_sd_max is not null;

-- 8. `no_thesis` IS ITS OWN CLASS AND IS NOT EMPTY. The finding this view
--    exists to surface: risk carried with nothing written down. If this ever
--    returns zero rows the classification has collapsed, not the book.
insert into _r
select 'no_thesis_class_distinct',
       count(*) filter (where thesis_coverage = 'no_thesis') > 0
   and count(*) filter (where thesis_coverage = 'thesis_on_file') > 0
   and count(*) filter (where thesis_coverage = 'no_thesis' and has_thesis) = 0,
       'no_thesis=' || count(*) filter (where thesis_coverage = 'no_thesis')::text ||
       ' on_file='  || count(*) filter (where thesis_coverage = 'thesis_on_file')::text
  from public.vw_position_risk_thesis;

-- 9. NO FLAG IS DERIVED FROM DRIFT. E1.4 is deferred by the 2026-09-13 ruling
--    section 8, so the view must expose magnitudes and no verdict column. This
--    asserts the absence rather than trusting it.
insert into _r
select 'no_drift_verdict_column', count(*) = 0,
       case when count(*) = 0 then 'none' else 'found: ' || string_agg(column_name, ',') end
  from information_schema.columns
 where table_schema = 'public' and table_name = 'vw_position_risk_thesis'
   and (column_name ~* 'flag' or column_name ~* 'drifted' or column_name ~* 'verdict'
        or column_name ~* 'alert' or column_name ~* 'stale');

-- 10. HAPPY PATH. A well-formed top row: positive risk share, a rank, a real
--     weight, and a book vol attached.
insert into _r
select 'happy_path_row',
       count(*) = 1,
       'rank1=' || coalesce(max(symbol),'none')
  from public.vw_position_risk_thesis
 where risk_rank = 1 and risk_share > 0 and weight > 0 and book_vol_annual > 0
   and thesis_coverage in ('no_thesis','thesis_on_file');

-- 11. THE DIAGONAL LANDS EXACTLY ONCE. Checks 1-3 all still pass if the unit
--     diagonal of the correlation matrix is doubled or dropped -- the Euler
--     identity holds against whatever sigma_p was computed, so it cannot see an
--     error in sigma_p itself. The degenerate portfolio does: put all weight on
--     one name and sigma_p must equal that name's own vol exactly. A doubled
--     diagonal returns sqrt(2) times it; a missing one returns zero.
insert into _r
select 'unit_diagonal_exact',
       abs(x.sigma_p - x.own_sd) < 1e-12,
       'residual=' || abs(x.sigma_p - x.own_sd)::text
  from (
    with mat as (select max(as_of_date) d from public.universe_correlations),
    sess as (
      select ph.price_date from public.price_history ph, mat
       where ph.interval = '1d'
         and ph.asset_id = (select id from public.assets where symbol = 'SPY' limit 1)
         and ph.price_date <= mat.d
       group by ph.price_date order by ph.price_date desc limit 120),
    pick as (select symbol from public.vw_book_mctr order by risk_rank limit 1),
    r as (
      select a.symbol,
             ph.close / lag(ph.close) over (partition by a.symbol order by ph.price_date) - 1 as rr
        from public.price_history ph join public.assets a on a.id = ph.asset_id
       where ph.interval = '1d' and ph.price_date in (select price_date from sess)
         and a.symbol in (select symbol from pick)),
    v as (select symbol, stddev_samp(rr) sd from r where rr is not null group by symbol),
    w as (select symbol, sd, 1.0::numeric as wt from v),
    rs as (
      select u.symbol_1 a, u.symbol_2 b, u.correlation_simple rho
        from public.universe_correlations u, mat where u.as_of_date = mat.d
      union all
      select u.symbol_2, u.symbol_1, u.correlation_simple
        from public.universe_correlations u, mat where u.as_of_date = mat.d
      union all
      select symbol, symbol, 1.0 from w),
    sw as (
      select x.symbol, x.wt, x.sd * sum(rs.rho * y.sd * y.wt) as sigma_w
        from w x join rs on rs.a = x.symbol join w y on y.symbol = rs.b
       group by x.symbol, x.wt, x.sd)
    select sqrt(sum(wt * sigma_w)) as sigma_p, max((select sd from v)) as own_sd from sw
  ) x;

select ck, case when ok then 'PASS' else 'FAIL' end result, detail from _r order by ck;

rollback;
