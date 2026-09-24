-- MP-4a: the Ledger's readers follow the account switch.
--
-- MP-3 made every decision record its portfolio (inside the hash from v3), but
-- left the CONSUMERS reading all of them. With Atlas Secondary trading, the
-- Blotter, the Ledger page, calibration, Brier and the two adversary lenses
-- mixed both accounts' decisions -- a Brier score over two people's calls is a
-- score of neither. Legacy rows carry portfolio_id NULL, which means the
-- default portfolio (they predate a second account).
--
-- 1. THE HASH CHAIN STAYS GLOBAL, and that forces the first change.
--    decisions_hash_chain() was SECURITY INVOKER: it reads "the latest
--    decision" as the inserting role to link the new row to it. Once reads are
--    scoped, a browser insert on Secondary would see only Secondary's rows,
--    link to the wrong predecessor and break the tamper-evident chain for
--    every row after it. It now runs as the owner, with a pinned search_path
--    that includes `extensions` (digest() lives there). vw_ledger_integrity
--    runs as its owner and keeps verifying the WHOLE chain, deliberately:
--    integrity is a property of the chain, not of one account's slice of it.
--
-- 2. Browser reads of decisions / decision_outcomes are scoped by their SELECT
--    policy to the active portfolio. An outcome belongs to its decision's
--    portfolio. service_role and the table owner bypass RLS, so the nightly
--    outcome snapshot and api/trading.js are unaffected.
--
-- 3. The five views over decisions run as their owner and so bypass RLS; each
--    reads vw_active_decisions instead (asserted reference counts).

-- ── 1. The chain trigger runs as the owner ──────────────────────────────────

alter function public.decisions_hash_chain() security definer;
alter function public.decisions_hash_chain() set search_path = public, extensions;

-- ── 2. Scoped reads ─────────────────────────────────────────────────────────

create or replace view public.vw_active_decisions as
  select d.*
    from public.decisions d
   where coalesce(d.portfolio_id, (select public.atlas_default_portfolio()))
         = (select public.atlas_active_portfolio());

-- A single-table view owned by postgres is auto-updatable and would bypass
-- RLS (the MP-0 finding). SELECT only.
revoke all on public.vw_active_decisions from public, anon, authenticated;
grant select on public.vw_active_decisions to anon, authenticated, service_role;

comment on view public.vw_active_decisions is
  'decisions for the active portfolio (x-atlas-portfolio; NULL portfolio_id = '
  'the default). Read this, not decisions, in any view. MP-4a.';

alter policy decisions_anon_read on public.decisions
  using (coalesce(portfolio_id, (select public.atlas_default_portfolio()))
         = (select public.atlas_active_portfolio()));

alter policy outcomes_anon_read on public.decision_outcomes
  using (exists (select 1 from public.decisions d
                  where d.id = decision_outcomes.decision_id
                    and coalesce(d.portfolio_id, (select public.atlas_default_portfolio()))
                        = (select public.atlas_active_portfolio())));

-- ── 3. Views read the scoped relation ───────────────────────────────────────

do $$
declare
  r     record;
  v_old text;
  v_new text;
  v_n   int;
begin
  for r in
    select * from (values
      ('vw_calibration', 1), ('vw_brier_trend', 1), ('vw_adversary', 2),
      ('vw_devil_advocate', 2), ('nexus_holdings', 1)
    ) as x(name, expected)
  loop
    select pg_get_viewdef(c.oid, true) into v_old
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = r.name and c.relkind = 'v'
       and c.reloptions is null;
    if v_old is null then
      raise exception 'MP-4a: view % not found (or carries options this patch does not preserve)', r.name;
    end if;
    if v_old ~ 'vw_active_decisions' then
      raise exception 'MP-4a: view % already reads vw_active_decisions -- refusing to re-patch', r.name;
    end if;
    -- An aliased reference keeps its alias; a bare one is aliased back to
    -- `decisions` so qualified columns (decisions.symbol) still resolve.
    v_new := regexp_replace(v_old, '\m(FROM|JOIN)(\s+)decisions(\s+)(?!(WHERE|ORDER|GROUP|JOIN|LEFT|ON)\M)([a-z_]+)',
                            '\1\2__MP4__\3\4', 'gi');
    v_new := regexp_replace(v_new, '\m(FROM|JOIN)(\s+)decisions\M', '\1\2__MP4__ decisions', 'gi');
    v_n := (length(v_new) - length(replace(v_new, '__MP4__', ''))) / length('__MP4__');
    if v_n <> r.expected then
      raise exception 'MP-4a: view % -- % references scoped, expected %', r.name, v_n, r.expected;
    end if;
    execute format('create or replace view public.%I as %s',
                   r.name, rtrim(replace(v_new, '__MP4__', 'vw_active_decisions'), E'; \n'));
  end loop;
end $$;

-- ── Assertions ──────────────────────────────────────────────────────────────

do $$
begin
  if not (select chain_ok from public.vw_ledger_integrity) then
    raise exception 'MP-4a: the Ledger chain no longer verifies';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('v','m')
       and c.relname not in ('vw_ledger_integrity', 'vw_active_decisions')
       and pg_get_viewdef(c.oid, true) ~* '\m(from|join)\s+decisions\M') then
    raise exception 'MP-4a: a view still reads decisions unscoped';
  end if;
end $$;
