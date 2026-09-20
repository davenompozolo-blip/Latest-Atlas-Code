-- cluster_identity: the stored coefficients must be finite.
--
-- Every case is forced in a transaction that ROLLS BACK, because
-- cluster_identity is written nightly and a scratch row left behind would be
-- indistinguishable from a real measurement.
--
-- The three sentinels are tested SEPARATELY on purpose. A guard written as
-- `x IS DISTINCT FROM 'NaN'::numeric` passes the NaN case and admits both
-- infinities -- that exact mistake shipped on PR #783 and was corrected four
-- hours later. A test that only tries NaN cannot tell the two guards apart.
--
-- The happy path is included because a wall of CHECKs that also rejects
-- legitimate data is worse than no CHECKs.
--
-- RUN THIS THROUGH psql, NOT THROUGH THE SUPABASE MCP. The MCP commits each
-- call, so the `rollback` below never reaches the two ACCEPTED cases and they
-- land in the table for real -- which happened on the first run of this file,
-- leaving two rows at as_of 1900-01-01 that had to be deleted by hand. The
-- far-past as_of and the sentinel logic_version are what made them findable.
begin;

create temp table _t(name text, ok boolean) on commit drop;

do $$
declare
    v_as_of date := '1900-01-01';           -- far outside any real night
    v_logic text := 'test:finite-contract';
begin
    -- A well-formed row, used as the base for every mutation below.
    create temp table _base on commit drop as
    select v_as_of  as as_of_date, v_logic as logic_version, 999999 as cluster_id,
           3 as cluster_size, 1 as held_count,
           0.71::numeric as avg_intra_rho,
           'Test theme'::text as composition_label, 'curated_theme'::text as composition_basis,
           0.5::numeric as composition_coverage,
           139 as n_obs, 0.5::numeric as r_squared,
           0.8::numeric as beta_market, 3.2::numeric as t_market,
           0.001::numeric as beta_cyclical, 1.1::numeric as t_cyclical,
           0.002::numeric as beta_concentration, 4.0::numeric as t_concentration,
           (-0.003)::numeric as beta_dollar, (-6.4)::numeric as t_dollar,
           'concentration'::text as primary_axis, 1::smallint as primary_axis_sign,
           'measured'::text as fit_status;

    -- 1..3  the three sentinels, on a t-stat.
    --       NaN matters most: abs('NaN') > 2 is TRUE, so an unguarded NaN
    --       t-stat CLEARS the significance gate and is named the primary axis.
    -- NaN
    begin
        insert into public.cluster_identity (as_of_date, logic_version, cluster_id,
            cluster_size, held_count, avg_intra_rho, composition_label,
            composition_basis, composition_coverage, n_obs, r_squared,
            beta_market, t_market, beta_cyclical, t_cyclical,
            beta_concentration, t_concentration, beta_dollar, t_dollar,
            primary_axis, primary_axis_sign, fit_status)
        select as_of_date, logic_version, cluster_id, cluster_size, held_count,
               avg_intra_rho, composition_label, composition_basis,
               composition_coverage, n_obs, r_squared, beta_market,
               'NaN'::numeric, beta_cyclical, t_cyclical, beta_concentration,
               t_concentration, beta_dollar, t_dollar, primary_axis,
               primary_axis_sign, fit_status
        from _base;
        insert into _t values ('NaN t_market is REFUSED', false);
    exception when check_violation then
        insert into _t values ('NaN t_market is REFUSED', true);
    end;

    -- +Infinity -- the case `IS DISTINCT FROM ''NaN''` would have let through
    begin
        insert into public.cluster_identity (as_of_date, logic_version, cluster_id,
            cluster_size, held_count, avg_intra_rho, composition_label,
            composition_basis, composition_coverage, n_obs, r_squared,
            beta_market, t_market, beta_cyclical, t_cyclical,
            beta_concentration, t_concentration, beta_dollar, t_dollar,
            primary_axis, primary_axis_sign, fit_status)
        select as_of_date, logic_version, cluster_id, cluster_size, held_count,
               avg_intra_rho, composition_label, composition_basis,
               composition_coverage, n_obs, r_squared, beta_market,
               'Infinity'::numeric, beta_cyclical, t_cyclical, beta_concentration,
               t_concentration, beta_dollar, t_dollar, primary_axis,
               primary_axis_sign, fit_status
        from _base;
        insert into _t values ('+Infinity t_market is REFUSED', false);
    exception when check_violation then
        insert into _t values ('+Infinity t_market is REFUSED', true);
    end;

    -- -Infinity
    begin
        insert into public.cluster_identity (as_of_date, logic_version, cluster_id,
            cluster_size, held_count, avg_intra_rho, composition_label,
            composition_basis, composition_coverage, n_obs, r_squared,
            beta_market, t_market, beta_cyclical, t_cyclical,
            beta_concentration, t_concentration, beta_dollar, t_dollar,
            primary_axis, primary_axis_sign, fit_status)
        select as_of_date, logic_version, cluster_id, cluster_size, held_count,
               avg_intra_rho, composition_label, composition_basis,
               composition_coverage, n_obs, r_squared, '-Infinity'::numeric,
               t_market, beta_cyclical, t_cyclical, beta_concentration,
               t_concentration, beta_dollar, t_dollar, primary_axis,
               primary_axis_sign, fit_status
        from _base;
        insert into _t values ('-Infinity beta_market is REFUSED', false);
    exception when check_violation then
        insert into _t values ('-Infinity beta_market is REFUSED', true);
    end;

    -- 4  a NaN on an axis the row does NOT name is still refused: the guard
    --    covers every coefficient, not only the published one.
    begin
        insert into public.cluster_identity (as_of_date, logic_version, cluster_id,
            cluster_size, held_count, avg_intra_rho, composition_label,
            composition_basis, composition_coverage, n_obs, r_squared,
            beta_market, t_market, beta_cyclical, t_cyclical,
            beta_concentration, t_concentration, beta_dollar, t_dollar,
            primary_axis, primary_axis_sign, fit_status)
        select as_of_date, logic_version, cluster_id, cluster_size, held_count,
               avg_intra_rho, composition_label, composition_basis,
               composition_coverage, n_obs, r_squared, beta_market, t_market,
               beta_cyclical, 'NaN'::numeric, beta_concentration,
               t_concentration, beta_dollar, t_dollar, primary_axis,
               primary_axis_sign, fit_status
        from _base;
        insert into _t values ('NaN on an UNNAMED axis is REFUSED', false);
    exception when check_violation then
        insert into _t values ('NaN on an UNNAMED axis is REFUSED', true);
    end;

    -- 5  avg_intra_rho is guarded too
    begin
        insert into public.cluster_identity (as_of_date, logic_version, cluster_id,
            cluster_size, held_count, avg_intra_rho, composition_label,
            composition_basis, composition_coverage, n_obs, r_squared,
            beta_market, t_market, beta_cyclical, t_cyclical,
            beta_concentration, t_concentration, beta_dollar, t_dollar,
            primary_axis, primary_axis_sign, fit_status)
        select as_of_date, logic_version, cluster_id, cluster_size, held_count,
               'NaN'::numeric, composition_label, composition_basis,
               composition_coverage, n_obs, r_squared, beta_market, t_market,
               beta_cyclical, t_cyclical, beta_concentration, t_concentration,
               beta_dollar, t_dollar, primary_axis, primary_axis_sign, fit_status
        from _base;
        insert into _t values ('NaN avg_intra_rho is REFUSED', false);
    exception when check_violation then
        insert into _t values ('NaN avg_intra_rho is REFUSED', true);
    end;

    -- 6  NULL coefficients are UNTOUCHED. A NULL comparison yields NULL and a
    --    CHECK passes, which is what keeps an unmeasurable cluster writable.
    begin
        insert into public.cluster_identity (as_of_date, logic_version, cluster_id,
            cluster_size, held_count, avg_intra_rho, composition_label,
            composition_basis, composition_coverage, n_obs, r_squared,
            beta_market, t_market, beta_cyclical, t_cyclical,
            beta_concentration, t_concentration, beta_dollar, t_dollar,
            primary_axis, primary_axis_sign, fit_status)
        values (v_as_of, v_logic, 999997, 1, 0, null, 'Test theme',
                'curated_theme', 1.0, null, null, null, null, null, null,
                null, null, null, null, null, null, 'insufficient_history');
        insert into _t values ('an unmeasurable cluster (all NULL) is ACCEPTED', true);
    exception when others then
        insert into _t values ('an unmeasurable cluster (all NULL) is ACCEPTED', false);
    end;

    -- 7  the happy path
    begin
        insert into public.cluster_identity (as_of_date, logic_version, cluster_id,
            cluster_size, held_count, avg_intra_rho, composition_label,
            composition_basis, composition_coverage, n_obs, r_squared,
            beta_market, t_market, beta_cyclical, t_cyclical,
            beta_concentration, t_concentration, beta_dollar, t_dollar,
            primary_axis, primary_axis_sign, fit_status)
        select * from _base;
        insert into _t values ('a well-formed measured row is ACCEPTED', true);
    exception when others then
        insert into _t values ('a well-formed measured row is ACCEPTED', false);
    end;
end $$;

select case when ok then '  pass  ' else '  FAIL  ' end || name from _t order by ctid;
select count(*) filter (where ok) || '/' || count(*) || ' passed' as result from _t;

rollback;
