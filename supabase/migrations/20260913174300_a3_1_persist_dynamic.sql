-- EXECUTE rather than a static statement: _states_out is created fresh by every
-- atlas_evaluate_themes call and dropped at commit, so a cached plan holding
-- the previous incarnation's OID fails on the second call in a new transaction
-- with "relation does not exist". Dynamic SQL re-plans each time.

create or replace function public.atlas_persist_theme_run(p_logic_version text)
returns table(states_written int, transitions_written int)
language plpgsql
set search_path to 'public', 'pg_temp'
as $fn$
declare v_s int; v_t int;
begin
  execute $q$
    insert into public.regime_theme_states
      (theme_key, as_of, logic_version, state, strength, evidence)
    select o.o_theme, o.as_of, $1, o.state, o.strength, o.evidence
      from _states_out o
    on conflict on constraint regime_theme_states_pkey do nothing
  $q$ using p_logic_version;
  get diagnostics v_s = row_count;

  execute $q$
    insert into public.regime_theme_transitions
      (theme_key, as_of, logic_version, from_state, to_state, triggered_by)
    select o.o_theme, o.as_of, $1, o.from_state, o.to_state, o.triggered_by
      from _trans_out o
    on conflict on constraint regime_theme_transitions_pkey do nothing
  $q$ using p_logic_version;
  get diagnostics v_t = row_count;

  return query select v_s, v_t;
end;
$fn$;

revoke execute on function public.atlas_persist_theme_run(text)
  from public, anon, authenticated;
