-- A3.1 -- the measure layer. One row per (session, operand), where an operand
-- is a (kind, key, baseline_window) triple referenced by at least one trigger.
--
-- SESSION SPINE is SPY's own bars in market_prices -- the platform's definition
-- of a traded day, the same one atlas_last_traded_day() uses. Never a calendar:
-- a weekday feed is not late on a holiday, and a theme state must not exist for
-- a day the market did not trade.
--
-- MACRO VALUES ARE CARRIED FORWARD, bounded at 7 days. FRED publishes with an
-- uneven lag -- Brent typically two sessions behind the breakevens -- so a
-- session with no same-day print is the normal case, not a gap. Past 7 days the
-- value goes NULL and every trigger on it fails, because at that point the
-- carry is a claim about a session the provider has not observed. 7 matches the
-- window this codebase already uses to null a figure off a stale mark.
--
-- THE MEASURE IS THE MOVE, not the level. m_value is what a trigger's threshold
-- is compared against:
--   series in percent units   -> (level - baseline mean) x 100, i.e. basis points
--   series in usd_per_bbl     -> (level / baseline mean - 1) x 100, i.e. percent
--   axis                      -> score_20d_z, already a sigma level
--   pair                      -> the N-session log-ratio move over its own
--                                trailing 5-year sd, i.e. a sigma level
--
-- The baseline EXCLUDES the current session. "25bp above the 60-session mean"
-- reads the current value against a reference it is not itself part of;
-- including it would let a large move drag its own baseline and understate it.
--
-- The baseline is computed from RUNNING SUMS differenced by a variable lag, not
-- from a ROWS frame: a window frame offset has to be a constant, and the whole
-- point of holding baseline_window in the trigger table is that a v1 row set
-- can change it without touching this view.

create or replace view public.vw_theme_operand_measures as
with spine as (
  select distinct date from public.market_prices where symbol = 'SPY'
),
-- Every (kind, key, baseline) triple any trigger actually references. Building
-- from the trigger table rather than from a hardcoded list means a v1 row set
-- that adds an operand is measured without editing this view.
ops as (
  select distinct operand_kind, series_key, axis_key, pair_key, baseline_window
    from public.regime_theme_triggers
),
-- ---------- series ----------
series_ops as (select distinct series_key, baseline_window from ops
                where operand_kind = 'series' and baseline_window is not null),
series_carry as (
  select sp.date, s.series_key, s.units, lv.value, lv.date as value_date
    from spine sp
    cross join (select series_key, units from public.macro_series
                 where series_key in (select series_key from series_ops)) s
    left join lateral (
      select v.value, v.date from public.macro_series_values v
       where v.series_key = s.series_key and v.date <= sp.date
       order by v.date desc limit 1
    ) lv on true
),
series_ok as (
  select date, series_key, units, value_date,
         -- Past 7 days the carry is a claim about a session the provider has
         -- not observed, so it is withheld rather than repeated.
         case when value_date is not null and (date - value_date) <= 7 then value end as value
    from series_carry
),
series_run as (
  select date, series_key, units, value, value_date,
         sum(value)   over (partition by series_key order by date) as cs,
         count(value) over (partition by series_key order by date) as cn
    from series_ok
),
series_m as (
  select r.date, r.series_key, r.units, r.value, r.value_date, o.baseline_window,
         (lag(r.cs, 1) over w - lag(r.cs, o.baseline_window + 1) over w) as base_sum,
         (lag(r.cn, 1) over w - lag(r.cn, o.baseline_window + 1) over w) as base_n
    from series_run r
    join series_ops o on o.series_key = r.series_key
  window w as (partition by r.series_key, o.baseline_window order by r.date)
),
-- ---------- axis ----------
axis_m as (
  select s.date, s.axis_key, s.score_20d_z
    from public.factor_axis_scores s
   where s.axis_key in (select axis_key from ops where operand_kind = 'axis')
),
-- ---------- pair ----------
pair_ops as (select distinct pair_key, baseline_window from ops
              where operand_kind = 'pair' and baseline_window is not null),
pair_lvl as (
  select rp.pair_key, p1.date, ln(p1.adj_close) - ln(p2.adj_close) as loglvl
    from public.ratio_pairs rp
    join public.market_prices p1 on p1.symbol = rp.numerator_symbol
    join public.market_prices p2 on p2.symbol = rp.denominator_symbol and p2.date = p1.date
   where rp.pair_key in (select pair_key from pair_ops)
),
pair_move as (
  select l.pair_key, l.date, o.baseline_window,
         l.loglvl - lag(l.loglvl, o.baseline_window)
           over (partition by l.pair_key, o.baseline_window order by l.date) as mv
    from pair_lvl l
    join pair_ops o on o.pair_key = l.pair_key
),
pair_m as (
  select pair_key, date, baseline_window, mv,
         stddev_samp(mv) over w as sd,
         count(mv)       over w as nb
    from pair_move
  window w as (partition by pair_key, baseline_window order by date
               range between interval '5 years' preceding and current row)
)
select 'series'::text as operand_kind, m.series_key as operand_key, m.baseline_window,
       m.date,
       m.value as raw_value,
       case when m.base_n = m.baseline_window then m.base_sum / m.base_n end as baseline_mean,
       case when m.value is null or m.base_n is distinct from m.baseline_window then null
            when m.units = 'usd_per_bbl' then
              case when m.base_sum <> 0 then (m.value / (m.base_sum / m.base_n) - 1) * 100 end
            else (m.value - m.base_sum / m.base_n) * 100
       end as m_value,
       case when m.units = 'usd_per_bbl' then 'pct' else 'bp' end as m_units,
       (m.value is null) as operand_missing
  from series_m m
union all
select 'axis', a.axis_key, null, a.date, a.score_20d_z, null, a.score_20d_z, 'sigma',
       (a.score_20d_z is null)
  from axis_m a
union all
select 'pair', p.pair_key, p.baseline_window, p.date, p.mv, p.sd,
       case when p.nb >= 750 and p.sd > 0 then p.mv / p.sd end, 'sigma',
       (p.mv is null)
  from pair_m p;

comment on view public.vw_theme_operand_measures is
  'A3.1 measure layer: m_value is the MOVE a trigger threshold is compared '
  'against, in the units m_units names. Built from the operands the trigger '
  'table references, so a v1 row set adding an operand is measured without '
  'editing this view.';

alter view public.vw_theme_operand_measures set (security_invoker = on);
