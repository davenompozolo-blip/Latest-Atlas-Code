create or replace function public.atlas_refresh_cluster_identity(
    p_as_of    date    default null,
    p_lookback integer default 200,
    p_logic    text    default 'v1:ols:mkt+3axis'
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
    v_as_of      date;
    v_since      date;
    v_log        bigint;
    v_written    integer := 0;
    v_replaced   integer := 0;
    v_measured   integer := 0;
    v_named      integer := 0;
    v_cid        integer;
    v_k          constant integer := 5;   -- intercept + market + three axes
    v_n          integer;
    v_xtx        numeric[];
    v_xty        numeric[];
    v_aug        numeric[];
    v_beta       numeric[];
    v_inv        numeric[];
    v_sse        numeric;
    v_sst        numeric;
    v_s2         numeric;
    v_se         numeric;
    v_t          numeric[];
    v_r2         numeric;
    v_piv        integer;
    v_d          numeric;
    v_f          numeric;
    v_ax         text;
    v_best       numeric;
    v_status     text;
    v_i integer; v_j integer; v_r integer; v_c integer;
begin
    v_as_of := coalesce(p_as_of, (select max(as_of_date) from public.universe_clusters));
    if v_as_of is null then
        return jsonb_build_object('status', 'error', 'reason', 'no universe_clusters rows');
    end if;
    v_since := v_as_of - p_lookback;

    insert into public.sync_log (function_name, source, status, started_at)
    values ('atlas_refresh_cluster_identity', 'pg_cron', 'running', clock_timestamp())
    returning id into v_log;

    -- ON COMMIT DROP alone makes the function uncallable twice in one
    -- transaction, which is exactly the reproducibility check a first run
    -- needs. Drop at entry as well (the A3 lesson).
    drop table if exists _ci_members;
    drop table if exists _ci_panel;
    drop table if exists _ci_reg;

    create temp table _ci_members on commit drop as
    select uc.cluster_id, uc.symbol, uc.cluster_size, uc.avg_intra_rho
    from public.universe_clusters uc
    where uc.as_of_date = v_as_of;

    -- The regressor panel. Market is SPY adj_close log returns -- the series
    -- C3 pinned by reproduction; `close` gives a different market beta and
    -- would silently re-denominate this against the book's own.
    create temp table _ci_reg on commit drop as
    with spy as (
        select "date" d, adj_close::numeric px from public.market_prices
        -- Bounded at BOTH ends. Without the upper bound a row stamped
        -- as_of = D is fitted on bars after D, so a re-run on a night the
        -- clustering did not advance (which has happened -- ts_clusters 504'd
        -- on 2026-09-09) silently re-states the row against a longer sample
        -- while still calling itself D. An append-only history row has to
        -- describe its own date.
        where symbol = 'SPY' and "date" >= v_since and "date" <= v_as_of
          and adj_close is not null
    ),
    mkt as (
        select d, ln(px / lag(px) over (order by d)) ret from spy
    )
    select m.d,
           m.ret                                            as x_market,
           max(s.score) filter (where s.axis_key='cyclical')      ::numeric as x_cyc,
           max(s.score) filter (where s.axis_key='concentration') ::numeric as x_con,
           max(s.score) filter (where s.axis_key='dollar')        ::numeric as x_dol
    from mkt m
    join public.factor_axis_scores s on s."date" = m.d
    where m.ret is not null and m.d <= v_as_of
    group by m.d, m.ret;

    -- Two-sided, because a one-sided bound is NaN-permeable: numeric NaN
    -- sorts ABOVE every finite value, so `x < 'Infinity'` is what refuses it
    -- and `x > '-Infinity'` refuses -Infinity. The y side already does this in
    -- _ci_panel; leaving the REGRESSORS unguarded was the asymmetry -- one NaN
    -- in a SPY bar or an axis score propagates through ln() into X'X and makes
    -- every coefficient of every cluster NaN at once.
    --
    -- That is not a cosmetic loss. `abs('NaN'::numeric) > 2` is TRUE, so a NaN
    -- t-stat CLEARS the significance gate and gets named the primary axis --
    -- the exact shape of the PR #783 finding, in a new place.
    delete from _ci_reg
     where x_market is null or x_cyc is null or x_con is null or x_dol is null
        or not (x_market > '-Infinity'::numeric and x_market < 'Infinity'::numeric)
        or not (x_cyc    > '-Infinity'::numeric and x_cyc    < 'Infinity'::numeric)
        or not (x_con    > '-Infinity'::numeric and x_con    < 'Infinity'::numeric)
        or not (x_dol    > '-Infinity'::numeric and x_dol    < 'Infinity'::numeric);

    -- Equal-weighted cluster return per session. A session is used only when
    -- at least half the cluster priced that day, so a thin tape cannot make
    -- one member stand for the whole bucket.
    create temp table _ci_panel on commit drop as
    with px as (
        select m.cluster_id, m.symbol, ph.price_date d, ph.close::numeric cl
        from _ci_members m
        join public.assets a on a.symbol = m.symbol
        join public.price_history ph on ph.asset_id = a.id
        where ph."interval" = '1d'
          and ph.price_date >= v_since and ph.price_date <= v_as_of
    ),
    ret as (
        select cluster_id, symbol, d,
               ln(cl / lag(cl) over (partition by cluster_id, symbol order by d)) lr
        from px
    ),
    agg as (
        select cluster_id, d, avg(lr) y, count(*) priced
        from ret
        where lr is not null and lr > '-Infinity'::numeric and lr < 'Infinity'::numeric
        group by cluster_id, d
    ),
    sz as (
        select cluster_id, max(cluster_size) sz from _ci_members group by cluster_id
    )
    select a.cluster_id, a.d, a.y, a.priced
    from agg a
    join sz on sz.cluster_id = a.cluster_id
    -- Half the cluster, at least two -- but never more than the cluster HAS.
    -- Without the cap a one-name cluster can never satisfy a floor of two, and
    -- 143 of 206 clusters here are singletons carrying 23 held names: a gate
    -- that can never pass, which this codebase already has three entries about.
    where a.priced >= least(sz.sz, greatest(2, ceil(sz.sz * 0.5)));

    delete from public.cluster_identity
     where as_of_date = v_as_of and logic_version = p_logic;
    get diagnostics v_replaced = row_count;

    for v_cid in select distinct cluster_id from _ci_members order by 1 loop
        v_status := 'measured';
        v_beta := null; v_t := null; v_r2 := null; v_n := null;
        v_ax := null; v_best := null;

        select count(*) into v_n
        from _ci_panel p join _ci_reg g on g.d = p.d
        where p.cluster_id = v_cid;

        if v_n is null or v_n < 60 then
            v_status := 'insufficient_history';
        else
            -- X'X and X'y in one pass. Symmetric, so only the arithmetic for
            -- the full matrix is written; readability beats saving 10 sums.
            v_xtx := array_fill(0::numeric, array[v_k, v_k]);
            v_xty := array_fill(0::numeric, array[v_k]);

            declare
                rec record;
                xv numeric[];
            begin
                for rec in
                    select p.y, g.x_market, g.x_cyc, g.x_con, g.x_dol
                    from _ci_panel p join _ci_reg g on g.d = p.d
                    where p.cluster_id = v_cid
                loop
                    xv := array[1::numeric, rec.x_market, rec.x_cyc, rec.x_con, rec.x_dol];
                    for v_i in 1..v_k loop
                        v_xty[v_i] := v_xty[v_i] + xv[v_i] * rec.y;
                        for v_j in 1..v_k loop
                            v_xtx[v_i][v_j] := v_xtx[v_i][v_j] + xv[v_i] * xv[v_j];
                        end loop;
                    end loop;
                end loop;
            end;

            -- Gauss-Jordan on [X'X | I] -> [I | (X'X)^-1], with partial
            -- pivoting. A singular normal matrix is reported, never solved
            -- past: a cluster whose regressors are collinear has no identity
            -- to publish.
            v_aug := array_fill(0::numeric, array[v_k, 2 * v_k]);
            for v_i in 1..v_k loop
                for v_j in 1..v_k loop
                    v_aug[v_i][v_j] := v_xtx[v_i][v_j];
                end loop;
                v_aug[v_i][v_k + v_i] := 1;
            end loop;

            for v_c in 1..v_k loop
                v_piv := v_c;
                for v_r in v_c + 1..v_k loop
                    if abs(v_aug[v_r][v_c]) > abs(v_aug[v_piv][v_c]) then v_piv := v_r; end if;
                end loop;
                if abs(v_aug[v_piv][v_c]) < 1e-18 then
                    v_status := 'singular';
                    exit;
                end if;
                if v_piv <> v_c then
                    for v_j in 1..2 * v_k loop
                        v_d := v_aug[v_c][v_j]; v_aug[v_c][v_j] := v_aug[v_piv][v_j]; v_aug[v_piv][v_j] := v_d;
                    end loop;
                end if;
                v_d := v_aug[v_c][v_c];
                for v_j in 1..2 * v_k loop v_aug[v_c][v_j] := v_aug[v_c][v_j] / v_d; end loop;
                for v_r in 1..v_k loop
                    if v_r <> v_c then
                        v_f := v_aug[v_r][v_c];
                        if v_f <> 0 then
                            for v_j in 1..2 * v_k loop
                                v_aug[v_r][v_j] := v_aug[v_r][v_j] - v_f * v_aug[v_c][v_j];
                            end loop;
                        end if;
                    end if;
                end loop;
            end loop;
        end if;

        if v_status = 'measured' then
            v_inv := array_fill(0::numeric, array[v_k, v_k]);
            for v_i in 1..v_k loop
                for v_j in 1..v_k loop v_inv[v_i][v_j] := v_aug[v_i][v_k + v_j]; end loop;
            end loop;
            v_beta := array_fill(0::numeric, array[v_k]);
            for v_i in 1..v_k loop
                v_d := 0;
                for v_j in 1..v_k loop v_d := v_d + v_inv[v_i][v_j] * v_xty[v_j]; end loop;
                v_beta[v_i] := v_d;
            end loop;

            with s as (
                select p.y, g.x_market, g.x_cyc, g.x_con, g.x_dol
                from _ci_panel p join _ci_reg g on g.d = p.d
                where p.cluster_id = v_cid
            ), mu as (select avg(y) ybar from s)
            select coalesce(sum(power(s.y - (v_beta[1]
                        + v_beta[2] * s.x_market + v_beta[3] * s.x_cyc
                        + v_beta[4] * s.x_con + v_beta[5] * s.x_dol), 2)), 0),
                   coalesce(sum(power(s.y - mu.ybar, 2)), 0)
              into v_sse, v_sst
            from s cross join mu;

            if v_n > v_k then
                v_s2 := v_sse / (v_n - v_k);
                v_t := array_fill(0::numeric, array[v_k]);
                for v_i in 1..v_k loop
                    v_se := sqrt(greatest(v_s2 * v_inv[v_i][v_i], 0));
                    v_t[v_i] := case when v_se > 0 then v_beta[v_i] / v_se else 0 end;
                end loop;
            end if;
            v_r2 := case when v_sst > 0 then 1 - v_sse / v_sst else null end;

            -- The largest |t| among axes that clear the bar. None clearing
            -- means no axis is named -- absent, not small.
            for v_i in 3..5 loop
                if v_t is not null and abs(v_t[v_i]) > 2
                   and (v_best is null or abs(v_t[v_i]) > v_best) then
                    v_best := abs(v_t[v_i]);
                    v_ax := case v_i when 3 then 'cyclical' when 4 then 'concentration' else 'dollar' end;
                end if;
            end loop;
            v_measured := v_measured + 1;
        end if;

        insert into public.cluster_identity (
            as_of_date, logic_version, cluster_id, cluster_size, held_count,
            avg_intra_rho, composition_label, composition_basis, composition_coverage,
            n_obs, r_squared, beta_market, t_market, beta_cyclical, t_cyclical,
            beta_concentration, t_concentration, beta_dollar, t_dollar,
            primary_axis, primary_axis_sign, fit_status)
        select
            v_as_of, p_logic, v_cid,
            max(m.cluster_size),
            count(*) filter (where h.symbol is not null),
            max(m.avg_intra_rho),
            comp.label, comp.basis, comp.coverage,
            case when v_status = 'measured' then v_n end,
            case when v_status = 'measured' then round(v_r2, 6) end,
            case when v_status = 'measured' then round(v_beta[2], 8) end,
            case when v_status = 'measured' then round(v_t[2], 4) end,
            case when v_status = 'measured' then round(v_beta[3], 8) end,
            case when v_status = 'measured' then round(v_t[3], 4) end,
            case when v_status = 'measured' then round(v_beta[4], 8) end,
            case when v_status = 'measured' then round(v_t[4], 4) end,
            case when v_status = 'measured' then round(v_beta[5], 8) end,
            case when v_status = 'measured' then round(v_t[5], 4) end,
            v_ax,
            case when v_ax is null then null
                 when v_ax = 'cyclical'      then sign(v_beta[3])::smallint
                 when v_ax = 'concentration' then sign(v_beta[4])::smallint
                 else sign(v_beta[5])::smallint end,
            v_status
        from _ci_members m
        left join public.vw_positions_current h
               on h.symbol = m.symbol and h.market_value > 0
        cross join lateral (
            -- Curated first. `assets.sector` is a vendor field that reads
            -- "Other" for half this universe, so it is used only when no
            -- member carries a curated theme, and never when its own modal
            -- value is the null-ish bucket.
            select
                coalesce(ct.theme, vs.sector)                     as label,
                case when ct.theme is not null then 'curated_theme'
                     when vs.sector is not null then 'vendor_sector'
                     else 'unclassified' end                      as basis,
                case when ct.theme is not null then ct.cov
                     when vs.sector is not null then vs.cov end   as coverage
            from (
                select mode() within group (order by pt.theme) theme,
                       (count(pt.theme)::numeric
                          / nullif(count(*)::numeric, 0))         cov
                from _ci_members mm
                left join public.position_themes pt on pt.symbol = mm.symbol
                where mm.cluster_id = v_cid
            ) ct
            cross join (
                select mode() within group (order by a2.sector) sector,
                       (count(a2.sector)::numeric
                          / nullif((select count(*) from _ci_members m3
                                     where m3.cluster_id = v_cid)::numeric, 0)) cov
                from _ci_members mm2
                join public.assets a2 on a2.symbol = mm2.symbol
                where mm2.cluster_id = v_cid
                  and a2.sector is not null and btrim(a2.sector) <> ''
                  and a2.sector not in ('Other', 'ETFs')
            ) vs
        ) comp
        where m.cluster_id = v_cid
        group by comp.label, comp.basis, comp.coverage;

        v_written := v_written + 1;
        if v_ax is not null then v_named := v_named + 1; end if;
    end loop;

    update public.sync_log
       set status = case when v_written > 0 then 'success' else 'error' end,
           finished_at = clock_timestamp(),
           details = jsonb_build_object(
               'as_of', v_as_of, 'logic_version', p_logic,
               'rows_written', v_written, 'rows_replaced', v_replaced,
               'measured', v_measured, 'axis_named', v_named,
               'lookback_days', p_lookback)
     where id = v_log;

    return jsonb_build_object('as_of', v_as_of, 'clusters', v_written,
        'rows_replaced', v_replaced, 'measured', v_measured, 'axis_named', v_named);
end;
$fn$;

revoke execute on function public.atlas_refresh_cluster_identity(date, integer, text)
    from public, anon, authenticated;
