-- Geographic surface: invariants for the disclosure layer and the resolver.
--
-- The block ALWAYS ends by raising, so nothing it writes can ever commit --
-- including under a client that commits every statement (the Supabase MCP
-- does; see CLAUDE.md, "Running a rolled-back test through the Supabase MCP
-- commits it"). Read the verdict from the error message:
--
--   GEO_TESTS 17/17 passed
--
-- Any FAIL line names the case. The fixture disclosure on TSM is invented and
-- carries an example.invalid URL; it exists only inside this block.
do $test$
declare
    v_out   text[] := '{}';
    v_pass  int := 0;
    v_total int := 0;
    v_tsm   uuid;
    v_w     numeric;
    v_x     numeric;
    v_n     int;
    v_ok    boolean;
    s       record;
begin
    select id into v_tsm from public.assets where symbol = 'TSM';

    -- ── T1/T2: weights are shares of the whole book, on both bases ────────
    v_total := v_total + 1;
    select abs(sum(weight) - 1) < 1e-12 into v_ok from public.resolve_geo_exposure(null, current_date, 'domicile');
    if v_ok then v_pass := v_pass + 1; else v_out := v_out || 'FAIL T1 domicile weights do not sum to 1'; end if;

    v_total := v_total + 1;
    select abs(sum(weight) - 1) < 1e-12 into v_ok from public.resolve_geo_exposure(null, current_date, 'revenue');
    if v_ok then v_pass := v_pass + 1; else v_out := v_out || 'FAIL T2 revenue weights do not sum to 1'; end if;

    -- ── T3: domicile basis reconciles to the cent against an independent sum
    v_total := v_total + 1;
    with bk as (
        select p.asset_id, p.market_value::numeric mv
          from public.vw_positions_current p join public.assets a on a.id = p.asset_id
         where coalesce(a.asset_class,'') not ilike '%option%'
           and a.symbol !~ '^[A-Z]{1,6}[0-9]{6}[CP][0-9]{8}$' and p.market_value is not null
    ), ind as (
        select coalesce(d.iso2, 'XX') iso2, sum(bk.mv) usd
          from bk left join public.security_domicile d on d.security_id = bk.asset_id group by 1
    ), res as (
        select r.iso2, r.weight * (select sum(mv) from bk) usd
          from public.resolve_geo_exposure(null, current_date, 'domicile') r
    )
    select coalesce(max(abs(coalesce(ind.usd,0) - coalesce(res.usd,0))), 0) < 0.005
      into v_ok from ind full join res on res.iso2 = ind.iso2;
    if v_ok then v_pass := v_pass + 1; else v_out := v_out || 'FAIL T3 domicile basis does not reconcile to the cent'; end if;

    -- ── T4: a fund never lands on its wrapper's domicile on the revenue basis
    v_total := v_total + 1;
    select count(*) into v_n from public.geo_exposure_detail(null, current_date, 'revenue')
     where instrument_kind = 'fund' and resolution <> 'disclosed' and iso2 <> 'XX';
    if v_n = 0 then v_pass := v_pass + 1; else v_out := v_out || format('FAIL T4 %s fund rows placed on a country', v_n); end if;

    -- ── T5: the summary's gap counts partition the book ──────────────────
    v_total := v_total + 1;
    select * into s from public.geo_exposure_summary(null, current_date, 'revenue');
    if s.disclosed_count + s.domicile_fallback_count + s.fund_unresolved_count + s.no_domicile_count = s.n_positions
       and abs(s.book_coverage + s.domicile_fallback_weight + s.fund_unresolved_weight + s.no_domicile_weight - 1) < 1e-12
    then v_pass := v_pass + 1; else v_out := v_out || 'FAIL T5 summary gap counts do not partition the book'; end if;

    -- ── T6: active basis refuses rather than returning an empty map ──────
    v_total := v_total + 1;
    begin
        perform * from public.resolve_geo_exposure(null, current_date, 'active');
        v_out := v_out || 'FAIL T6 active basis returned rows';
    exception when invalid_parameter_value then v_pass := v_pass + 1;
    end;

    -- ── T7-T11: the disclosure layer refuses what it should ──────────────
    v_total := v_total + 1;
    begin
        insert into public.security_geo_revenue values
            (v_tsm, '2025-12-31', 'TW', 0.6000, 'disclosed', 'https://example.invalid/t', null, 0.9000),
            (v_tsm, '2025-12-31', 'US', 0.3000, 'disclosed', 'https://example.invalid/t', null, 0.9000);
        set constraints public.security_geo_revenue_set_ck immediate;
        v_out := v_out || 'FAIL T7 a set summing to 0.9 was accepted';
    exception when check_violation then v_pass := v_pass + 1;
    end;
    set constraints public.security_geo_revenue_set_ck deferred;

    v_total := v_total + 1;
    begin
        insert into public.security_geo_revenue values
            (v_tsm, '2025-12-31', 'TW', 0.8000, 'disclosed', 'https://example.invalid/t', null, 1.0000),
            (v_tsm, '2025-12-31', 'XX', 0.2000, 'disclosed', 'https://example.invalid/t', null, 1.0000);
        set constraints public.security_geo_revenue_set_ck immediate;
        v_out := v_out || 'FAIL T8 coverage disagreeing with the XX share was accepted';
    exception when check_violation then v_pass := v_pass + 1;
    end;
    set constraints public.security_geo_revenue_set_ck deferred;

    v_total := v_total + 1;
    begin
        insert into public.security_geo_revenue values
            (v_tsm, '2025-12-31', 'TW', 1.0000, 'disclosed', 'not a url', null, 1.0000);
        v_out := v_out || 'FAIL T9 a row with no URL was accepted';
    exception when check_violation then v_pass := v_pass + 1;
    end;

    v_total := v_total + 1;
    begin
        insert into public.security_geo_revenue values
            (v_tsm, '2025-12-31', 'TW', 'NaN', 'disclosed', 'https://example.invalid/t', null, 1.0000);
        v_out := v_out || 'FAIL T10 a NaN share was accepted';
    exception when check_violation then v_pass := v_pass + 1;
    end;

    v_total := v_total + 1;
    begin
        insert into public.security_geo_revenue values
            (v_tsm, '2025-12-31', 'TW', 1.0000, 'estimated', 'https://example.invalid/t', null, 1.0000);
        v_out := v_out || 'FAIL T11 an estimate with no method note was accepted';
    exception when check_violation then v_pass := v_pass + 1;
    end;

    -- ── T12-T16: the happy path, and what the resolver makes of it ───────
    v_total := v_total + 1;
    begin
        insert into public.security_geo_revenue values
            (v_tsm, '2025-12-31', 'TW', 0.6000, 'disclosed', 'https://example.invalid/t', null, 0.8500),
            (v_tsm, '2025-12-31', 'US', 0.1500, 'disclosed', 'https://example.invalid/t', null, 0.8500),
            (v_tsm, '2025-12-31', 'CN', 0.1000, 'disclosed', 'https://example.invalid/t', null, 0.8500),
            (v_tsm, '2025-12-31', 'XX', 0.1500, 'disclosed', 'https://example.invalid/t', null, 0.8500),
            -- a LATER period, after as_of below: must not be used
            (v_tsm, '2099-12-31', 'JP', 1.0000, 'disclosed', 'https://example.invalid/t', null, 1.0000);
        set constraints public.security_geo_revenue_set_ck immediate;
        v_pass := v_pass + 1;
    exception when others then
        v_out := v_out || ('FAIL T12 a well-formed set was refused: ' || sqlerrm);
    end;
    set constraints public.security_geo_revenue_set_ck deferred;

    select position_weight into v_w from public.geo_exposure_detail(null, '2026-06-30', 'revenue')
     where asset_id = v_tsm limit 1;

    v_total := v_total + 1;
    select weight into v_x from public.geo_exposure_detail(null, '2026-06-30', 'revenue')
     where asset_id = v_tsm and iso2 = 'TW';
    if abs(v_x - v_w * 0.6) < 1e-12 then v_pass := v_pass + 1;
    else v_out := v_out || format('FAIL T13 TSM TW weight %s, expected %s', v_x, v_w * 0.6); end if;

    v_total := v_total + 1;
    select count(*) into v_n from public.geo_exposure_detail(null, '2026-06-30', 'revenue')
     where asset_id = v_tsm and iso2 = 'JP';
    if v_n = 0 then v_pass := v_pass + 1; else v_out := v_out || 'FAIL T14 a period after as_of was used'; end if;

    v_total := v_total + 1;
    select * into s from public.geo_exposure_summary(null, '2026-06-30', 'revenue');
    if abs(s.book_coverage - v_w * 0.85) < 1e-12 and s.disclosed_count = 1 then v_pass := v_pass + 1;
    else v_out := v_out || format('FAIL T15 book coverage %s, expected %s', s.book_coverage, v_w * 0.85); end if;

    v_total := v_total + 1;
    select abs(sum(weight) - 1) < 1e-12 into v_ok from public.resolve_geo_exposure(null, '2026-06-30', 'revenue');
    if v_ok then v_pass := v_pass + 1; else v_out := v_out || 'FAIL T16 weights stop summing to 1 once a disclosure exists'; end if;

    -- ── T17: a set deleted in full is legitimate ─────────────────────────
    v_total := v_total + 1;
    begin
        delete from public.security_geo_revenue where security_id = v_tsm and period_end = '2025-12-31';
        set constraints public.security_geo_revenue_set_ck immediate;
        v_pass := v_pass + 1;
    exception when others then
        v_out := v_out || ('FAIL T17 deleting a whole set was refused: ' || sqlerrm);
    end;

    raise exception 'GEO_TESTS %/% passed%', v_pass, v_total,
        case when array_length(v_out, 1) > 0 then E'\n' || array_to_string(v_out, E'\n') else '' end;
end
$test$;
