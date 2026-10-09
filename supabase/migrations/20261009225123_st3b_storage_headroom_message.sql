-- ST-3b: the storage_headroom message described the quota wrongly (CodeRabbit,
-- PR #866). Past 500 MB a Free Plan PROJECT goes read-only; the HTTP 402 that
-- refused every API request on 2026-10-03 is a separate restriction, decided on
-- the ORGANISATION's average database size over the billing period -- so
-- shrinking the project does not lift it at once. Textual patch, anchor asserted
-- once, refused if already applied.
do $do$
declare
    v_def text;
    v_old text := 'Past %s MB every API request is refused. Largest: %s.';
    v_new text := 'Past %s MB a Free Plan project goes read-only; separately, an HTTP 402 restriction of every API request is decided on the organisation''''s average size over the billing period and does not lift as soon as usage drops. Largest: %s.';
begin
    select pg_get_functiondef(p.oid) into v_def from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'atlas_run_validation';
    if position('goes read-only; separately' in v_def) > 0 then
        raise exception 'ST-3b: already applied';
    end if;
    if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
        raise exception 'ST-3b: message anchor not found exactly once';
    end if;
    execute replace(v_def, v_old, v_new);
end
$do$;
