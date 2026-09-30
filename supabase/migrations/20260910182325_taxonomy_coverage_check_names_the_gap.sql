DO $patch$
DECLARE
    v_src   text;
    v_new   text;
    v_anchor text := E'\n\n    insert into atlas_validation_log (check_name, status, severity, message, details)';
    v_block text;
    v_hits  int;
BEGIN
    SELECT pg_get_functiondef(p.oid) INTO v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'atlas_run_validation';

    IF v_src IS NULL THEN
        RAISE EXCEPTION 'atlas_run_validation() not found';
    END IF;

    IF position('taxonomy_coverage' in v_src) > 0 THEN
        RAISE NOTICE 'taxonomy_coverage already present - nothing to do';
        RETURN;
    END IF;

    v_hits := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    IF v_hits <> 1 THEN
        RAISE EXCEPTION 'anchor matched % times, expected exactly 1', v_hits;
    END IF;

    v_block := E'\n\n    -- taxonomy_coverage: every held position must carry a sector AND a theme.\n'
        || E'    -- Scoped to the OPEN book on purpose: a closed position''s missing theme\n'
        || E'    -- cannot distort a current attribution, and including it would keep the\n'
        || E'    -- check permanently amber on names nobody can act on.\n'
        || E'    declare\n'
        || E'        v_no_sector text;\n'
        || E'        v_no_theme  text;\n'
        || E'        v_n_sector  int;\n'
        || E'        v_n_theme   int;\n'
        || E'        v_tax_msg   text;\n'
        || E'    begin\n'
        || E'        select count(*), string_agg(h.symbol, '' '' order by h.symbol)\n'
        || E'          into v_n_sector, v_no_sector\n'
        || E'          from vw_nexus_holdings h\n'
        || E'         where nullif(nullif(h.sector, ''Other''), ''ETFs'') is null;\n'
        || E'\n'
        || E'        select count(*), string_agg(h.symbol, '' '' order by h.symbol)\n'
        || E'          into v_n_theme, v_no_theme\n'
        || E'          from vw_nexus_holdings h\n'
        || E'         where h.theme is null;\n'
        || E'\n'
        || E'        if v_n_sector = 0 and v_n_theme = 0 then\n'
        || E'            v_results := v_results || jsonb_build_object(\n'
        || E'                ''check_name'', ''taxonomy_coverage'', ''status'', ''passed'', ''severity'', ''info'',\n'
        || E'                ''message'', ''Every held position carries a sector and a theme.'',\n'
        || E'                ''details'', jsonb_build_object(''missing_sector'', 0, ''missing_theme'', 0));\n'
        || E'        else\n'
        || E'            v_tax_msg := trim(both '' '' from\n'
        || E'                coalesce(case when v_n_sector > 0\n'
        || E'                    then format(''%s held position(s) with no sector: %s.'', v_n_sector, v_no_sector)\n'
        || E'                    end, '''')\n'
        || E'                || '' '' ||\n'
        || E'                coalesce(case when v_n_theme > 0\n'
        || E'                    then format(''%s held position(s) with no theme: %s.'', v_n_theme, v_no_theme)\n'
        || E'                    end, ''''));\n'
        || E'            v_results := v_results || jsonb_build_object(\n'
        || E'                ''check_name'', ''taxonomy_coverage'', ''status'', ''warning'', ''severity'', ''warning'',\n'
        || E'                ''message'', v_tax_msg\n'
        || E'                    || '' Attribution and risk segment on these, so they distort every cut until mapped.'',\n'
        || E'                ''details'', jsonb_build_object(\n'
        || E'                    ''missing_sector'', v_n_sector, ''missing_sector_symbols'', coalesce(v_no_sector, ''''),\n'
        || E'                    ''missing_theme'',  v_n_theme,  ''missing_theme_symbols'',  coalesce(v_no_theme, '''')));\n'
        || E'        end if;\n'
        || E'    end;';

    v_new := replace(v_src, v_anchor, v_block || v_anchor);
    EXECUTE v_new;
END $patch$;
