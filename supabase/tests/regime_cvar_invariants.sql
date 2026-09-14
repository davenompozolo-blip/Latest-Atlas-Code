-- E3 / B2 invariants. Everything rolls back; nothing here persists.
--
-- The first check is the important one. It pins the FACTOR PANEL to the
-- published C3 regression by reproducing a quantity neither side was fitted to.
-- If the panel ever drifts -- `close` instead of `adj_close`, a cumulative score
-- column instead of the daily one, a changed join -- every CVaR downstream is
-- quietly in the wrong units, and nothing else in this file would notice.

begin;

create temporary table _t(name text, ok boolean, detail text) on commit drop;

-- ---------------------------------------------------------------- 1. control
with j as (
  select bk.bret,
         1.026261530509*p.market + 0.000496309675*p.cyclical
       + 0.001108815986*p.concentration + (-0.004763141529)*p.dollar as pred
  from (
    select (ts at time zone 'America/New_York')::date d, equity, data_quality,
           lag(equity)       over (order by (ts at time zone 'America/New_York')::date) pe,
           lag(data_quality) over (order by (ts at time zone 'America/New_York')::date) pq
    from public.portfolio_equity_curve
  ) c
  cross join lateral (select ln(c.equity/c.pe) as bret) bk
  join public.vw_factor_return_panel p on p.date = c.d
  where c.pe is not null and c.equity > 0 and c.pe > 0
    and c.data_quality = 'settled' and c.pq = 'settled'
    and c.d between date '2025-12-26' and date '2026-09-04'
    and p.market is not null
)
insert into _t
select 'panel reproduces C3 r_squared to 9dp',
       abs(var_samp(pred)/var_samp(bret) - 0.778109716915) < 1e-9,
       'implied=' || round((var_samp(pred)/var_samp(bret))::numeric, 12) ||
       ' stored=0.778109716915  n=' || count(*)
from j;

insert into _t
select 'control sample is exactly n=168', count(*) = 168, 'n=' || count(*)
from (
  select 1 from (
    select (ts at time zone 'America/New_York')::date d, equity, data_quality,
           lag(equity)       over (order by (ts at time zone 'America/New_York')::date) pe,
           lag(data_quality) over (order by (ts at time zone 'America/New_York')::date) pq
    from public.portfolio_equity_curve) c
  where c.pe is not null and c.data_quality='settled' and c.pq='settled'
    and c.d between date '2025-12-26' and date '2026-09-04'
) s;

-- ------------------------------------------------------- 2. function shape
insert into _t
select 'every axis returns 1 unconditional + 4 buckets',
       bool_and(n = 5), string_agg(ax || '=' || n, ' ')
from (
  select 'cyclical' ax, count(*) n from public.atlas_regime_cvar('cyclical')
  union all select 'concentration', count(*) from public.atlas_regime_cvar('concentration')
  union all select 'dollar', count(*) from public.atlas_regime_cvar('dollar')
) q;

insert into _t
select 'bucket 0 ratio is exactly 1', bool_and(vol_ratio_vs_unconditional = 1),
       string_agg(axis_key || '=' || vol_ratio_vs_unconditional, ' ')
from (
  select * from public.atlas_regime_cvar('cyclical') where bucket = 0
  union all select * from public.atlas_regime_cvar('concentration') where bucket = 0
  union all select * from public.atlas_regime_cvar('dollar') where bucket = 0
) q;

insert into _t
select 'shrinkage intensity is a proportion in [0,1]',
       bool_and(lw_delta >= 0 and lw_delta <= 1),
       'max=' || max(lw_delta) || ' min=' || min(lw_delta)
from (
  select lw_delta from public.atlas_regime_cvar('cyclical')
  union all select lw_delta from public.atlas_regime_cvar('concentration')
  union all select lw_delta from public.atlas_regime_cvar('dollar')
) q;

insert into _t
select 'every bucket clears the 250-session floor', bool_and(n_obs >= 250),
       'min=' || min(n_obs)
from (
  select n_obs from public.atlas_regime_cvar('cyclical')
  union all select n_obs from public.atlas_regime_cvar('concentration')
  union all select n_obs from public.atlas_regime_cvar('dollar')
) q;

insert into _t
select 'CVaR exceeds VaR on every row', bool_and(cvar_daily > var_daily), ''
from (
  select cvar_daily, var_daily from public.atlas_regime_cvar('cyclical')
  union all select cvar_daily, var_daily from public.atlas_regime_cvar('concentration')
  union all select cvar_daily, var_daily from public.atlas_regime_cvar('dollar')
) q;

-- An unlisted confidence must return NOTHING rather than resolve to a neighbour.
insert into _t
select 'an unsupported confidence returns no rows', count(*) = 0, 'rows=' || count(*)
from public.atlas_regime_cvar('cyclical', 4, 0.975);

-- Bucketing on a DIFFERENT axis must change the answer, or the bucketing is
-- not doing anything. A test that only checks "it returns numbers" would pass
-- on a function that ignored its argument entirely.
insert into _t
select 'bucketing axis actually changes the result',
       (select vol_daily from public.atlas_regime_cvar('cyclical') where bucket = 1)
       <> (select vol_daily from public.atlas_regime_cvar('dollar') where bucket = 1),
       '';

-- ------------------------------------------------------- 3. table constraints
-- Each probe carries its own bucket number so a primary-key collision can never
-- masquerade as a CHECK refusal.
create function pg_temp._probe(tag text, b int, n int, d numeric,
                                 vd numeric, vr numeric, cv numeric, cf numeric)
returns boolean language plpgsql as $p$
begin
  insert into public.book_regime_cvar
    (as_of, logic_version, axis_key, bucket, bucket_label, n_obs, lw_delta,
     betas_estimated_at, conf, vol_daily, vol_annual, var_daily, cvar_daily,
     vol_ratio_vs_unconditional, vol_daily_unshrunk)
  values (date '1999-01-04', '_test', 'cyclical', b, tag, n, d,
          now(), cf, vd, vd*15.87, vr, cv, case when b=0 then 1 else 1.1 end, vd);
  return false;  -- insert succeeded, so the constraint did not fire
exception when check_violation then return true;
end;
$p$;

insert into _t values
  ('CHECK refuses a bucket under 250 sessions',
   pg_temp._probe('under floor', 91, 249, 0.05, 0.01, 0.016, 0.02, 0.95), ''),
  ('CHECK refuses a shrinkage intensity above 1',
   pg_temp._probe('delta>1', 92, 800, 1.5, 0.01, 0.016, 0.02, 0.95), ''),
  ('CHECK refuses CVaR at or below VaR',
   pg_temp._probe('cvar<=var', 93, 800, 0.05, 0.01, 0.02, 0.02, 0.95), ''),
  ('CHECK refuses an unsupported confidence',
   pg_temp._probe('bad conf', 94, 800, 0.05, 0.01, 0.016, 0.02, 0.975), '');

-- bucket 0 with a ratio other than 1 is the mislabelled-baseline case.
insert into _t
select 'CHECK refuses bucket 0 with a ratio other than 1', true, ''
where not exists (
  select 1 from (
    select 1 from public.book_regime_cvar where false
  ) x
);
do $$
begin
  insert into public.book_regime_cvar
    (as_of, logic_version, axis_key, bucket, bucket_label, n_obs, lw_delta,
     betas_estimated_at, conf, vol_daily, vol_annual, var_daily, cvar_daily,
     vol_ratio_vs_unconditional, vol_daily_unshrunk)
  values (date '1999-01-05','_test','cyclical',0,'fake baseline',800,0.05,
          now(),0.95,0.01,0.1587,0.016,0.02, 1.4, 0.01);
  update _t set ok = false, detail = 'insert was ACCEPTED'
   where name = 'CHECK refuses bucket 0 with a ratio other than 1';
exception when check_violation then null;
end $$;

-- ------------------------------------------------------- 4. happy path
-- A wall of refusals that also rejects legitimate data is worse than none.
do $$
begin
  insert into public.book_regime_cvar
    (as_of, logic_version, axis_key, bucket, bucket_label, n_obs, z_lo, z_hi,
     lw_delta, betas_estimated_at, conf, vol_daily, vol_annual, var_daily,
     cvar_daily, vol_ratio_vs_unconditional, vol_daily_unshrunk)
  values (date '1999-01-06','_test','cyclical',0,'unconditional',3369,-7.23,4.68,
          0.0145, now(), 0.95, 0.012022, 0.190845, 0.019776, 0.024798, 1, 0.012040);
  insert into _t values ('a well-formed row is ACCEPTED', true, '');
exception when others then
  insert into _t values ('a well-formed row is ACCEPTED', false, sqlerrm);
end $$;

-- ------------------------------------------------------- 5. append-only
do $$
begin
  update public.book_regime_cvar set vol_daily = 0.99
   where logic_version = '_test' and as_of = date '1999-01-06';
  insert into _t values ('UPDATE is refused', false, 'update succeeded');
exception when others then insert into _t values ('UPDATE is refused', true, '');
end $$;

do $$
begin
  delete from public.book_regime_cvar
   where logic_version = '_test' and as_of = date '1999-01-06';
  insert into _t values ('DELETE is refused', false, 'delete succeeded');
exception when others then insert into _t values ('DELETE is refused', true, '');
end $$;

select name, case when ok then 'PASS' else 'FAIL' end as result, detail
from _t order by name;

select count(*) filter (where ok) || '/' || count(*) || ' passed' as summary,
       count(*) filter (where not ok) as failures
from _t;

rollback;
