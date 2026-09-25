# Generator for supabase/migrations/20260925114040_mp5_per_account_verdict_engine.sql.
# Kept for provenance: it read the LIVE definitions on 2026-09-25 and cannot be
# re-run against a database that has already been converted.
import sys
D='/tmp/claude-0/-home-user-Latest-Atlas-Code/9d3d073f-9d61-5e53-9aad-852e5c8e1200/scratchpad/mp5/'
def edit(s, old, new, n):
    c=s.count(old); assert c==n, (old[:60], c, n); return s.replace(old,new)
V=open(D+'atlas_write_verdicts.sql').read().replace('\r\n','\n')
V=edit(V,"CREATE OR REPLACE FUNCTION public.atlas_write_verdicts(p_as_of date DEFAULT NULL::date, p_logic_version text DEFAULT 'v1:rho0.75:n5:mwr'::text, p_refresh boolean DEFAULT true)",
         "CREATE OR REPLACE FUNCTION public.atlas_write_verdicts_active(p_as_of date DEFAULT NULL::date, p_logic_version text DEFAULT 'v1:rho0.75:n5:mwr'::text, p_refresh boolean DEFAULT true)",1)
V=edit(V,"    v_existing     int;\nBEGIN\n",
         "    v_existing     int;\n    -- MP-5: every row this function reads or writes belongs to the ACTIVE\n    -- account. The public atlas_write_verdicts() sets the header per account.\n    v_pid          uuid := public.atlas_active_portfolio();\nBEGIN\n",1)
V=edit(V,"        PERFORM public.atlas_refresh_verdict_inputs();",
         "        PERFORM public.atlas_rematerialise(ARRAY['mv_book_daily_weights','mv_book_ex_index',\n                                                 'mv_position_returns','mv_position_tier2',\n                                                 'mv_position_tier1']);",1)
V=edit(V,"    INSERT INTO public.sync_log (source, function_name, status, started_at, details)\n    VALUES ('atlas_write_verdicts', 'atlas_write_verdicts', 'running', now(),",
         "    INSERT INTO public.sync_log (source, function_name, status, portfolio_id, started_at, details)\n    VALUES ('atlas_write_verdicts', 'atlas_write_verdicts', 'running', v_pid, now(),",1)
V=edit(V,"        RAISE EXCEPTION 'refusing to write verdicts - preflight failed: %', v_failed;",
         "        -- Refuse by RETURNING, not RAISE: a RAISE rolls back the log row that\n        -- records the refusal, and the wrapper runs every account in its own\n        -- subtransaction.\n        RETURN QUERY SELECT v_as_of, p_logic_version, 0, 'preflight failed: ' || v_failed;\n        RETURN;",1)
V=edit(V,"    INSERT INTO public.position_verdicts (\n        as_of,","    INSERT INTO public.position_verdicts (\n        portfolio_id, as_of,",1)
V=edit(V,"    SELECT v_as_of, p_logic_version, l.asset_id,","    SELECT v_pid, v_as_of, p_logic_version, l.asset_id,",1)
V=edit(V,"    ON CONFLICT (as_of, asset_id, logic_version) DO NOTHING;","    ON CONFLICT (portfolio_id, as_of, asset_id, logic_version) DO NOTHING;",1)
V=edit(V,"pv.as_of = v_as_of","pv.portfolio_id = v_pid AND pv.as_of = v_as_of",7)
V=edit(V,"WHERE as_of = v_as_of AND logic_version = p_logic_version","WHERE portfolio_id = v_pid AND as_of = v_as_of AND logic_version = p_logic_version",3)
V=edit(V,"    INSERT INTO public.book_risk_daily (\n        as_of,","    INSERT INTO public.book_risk_daily (\n        portfolio_id, as_of,",1)
V=edit(V,"    SELECT v_as_of, p_logic_version,\n","    SELECT v_pid, v_as_of, p_logic_version,\n",1)
S=open(D+'atlas_write_segment_verdicts.sql').read().replace('\r\n','\n')
S=edit(S,"CREATE OR REPLACE FUNCTION public.atlas_write_segment_verdicts(","CREATE OR REPLACE FUNCTION public.atlas_write_segment_verdicts_active(",1)
S=edit(S,"    v_failed   text;\nBEGIN\n","    v_failed   text;\n    -- MP-5: the ACTIVE account; see atlas_write_verdicts_active.\n    v_pid      uuid := public.atlas_active_portfolio();\nBEGIN\n",1)
S=edit(S,"    INSERT INTO public.sync_log (source, function_name, status, started_at, details)\n    VALUES ('atlas_write_segment_verdicts', 'atlas_write_segment_verdicts', 'running', now(),",
         "    INSERT INTO public.sync_log (source, function_name, status, portfolio_id, started_at, details)\n    VALUES ('atlas_write_segment_verdicts', 'atlas_write_segment_verdicts', 'running', v_pid, now(),",1)
S=edit(S,"        RAISE EXCEPTION 'refusing to write segment verdicts - preflight failed: %', v_failed;",
         "        RETURN QUERY SELECT v_as_of, NULL::text, 0, 'preflight failed: ' || v_failed;\n        RETURN;",1)
S=edit(S,"    REFRESH MATERIALIZED VIEW public.mv_segment_ex_index;","    PERFORM public.atlas_rematerialise(ARRAY['mv_segment_ex_index']);",1)
S=edit(S,"WHERE as_of = v_as_of AND logic_version = p_logic_version","WHERE portfolio_id = v_pid AND as_of = v_as_of AND logic_version = p_logic_version",3)
S=edit(S,"                   AND pv.as_of = v_as_of\n","                   AND pv.portfolio_id = v_pid\n                   AND pv.as_of = v_as_of\n",1)
S=edit(S,"    INSERT INTO public.segment_verdicts (\n        as_of,","    INSERT INTO public.segment_verdicts (\n        portfolio_id, as_of,",1)
S=edit(S,"    SELECT v_as_of, p_logic_version, e.grouping,","    SELECT v_pid, v_as_of, p_logic_version, e.grouping,",1)
S=edit(S,"    ON CONFLICT (as_of, logic_version, grouping, segment_id) DO NOTHING;","    ON CONFLICT (portfolio_id, as_of, logic_version, grouping, segment_id) DO NOTHING;",1)
S=edit(S,"     WHERE sv.as_of = v_as_of","     WHERE sv.portfolio_id = v_pid AND sv.as_of = v_as_of",1)
open(D+'fn_verdicts_active.sql','w').write(V.rstrip()+';\n')
open(D+'fn_segments_active.sql','w').write(S.rstrip()+';\n')
print('ok')
