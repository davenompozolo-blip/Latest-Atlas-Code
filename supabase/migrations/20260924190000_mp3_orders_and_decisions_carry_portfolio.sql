-- MP-3: every order and every Ledger decision records the portfolio it was for.
--
-- Multi-portfolio, phase 3 (database half). api/trading.js now routes account
-- actions to the chosen portfolio's own credentials, so from this migration on
-- an order can execute in either account. Both of its records must say which.
--
-- WHY IT SHIPS WITH ROUTING, NOT AFTER. `decisions` is the hash-chained Ledger:
-- append-only (deny_mutation) and tamper-evident (decisions_hash_chain). A row
-- written without its portfolio can NEVER be attributed later -- UPDATE is
-- refused by design. So provenance has to exist before the first trade on a
-- second account, not be retrofitted. Consumers (calibration, Brier, the Ledger
-- page) keep reading every row until MP-4 scopes them; the record is what
-- cannot wait.
--
-- HASH v3. portfolio_id is IN the hash, so a row's account cannot be altered
-- without breaking the chain. v1 and v2 canonical forms are byte-for-byte
-- unchanged, so all 185 existing rows verify exactly as before (asserted
-- below). Legacy rows keep portfolio_id NULL, which means the default
-- portfolio: they predate a second account.
--
-- ATTRIBUTION. The hash trigger fills a missing portfolio_id from
-- atlas_active_portfolio(), which reads the x-atlas-portfolio request header
-- (MP-2). So the browser's own inserts -- deferred and passed decisions --
-- are attributed with no client change. api/trading.js runs as service_role
-- with no header, so it passes portfolio_id explicitly.

-- ── orders ──────────────────────────────────────────────────────────────────

alter table public.orders
  add column if not exists portfolio_id uuid references public.portfolios(id);

-- Every existing order predates a second account; it was the default's.
update public.orders
   set portfolio_id = (select id from public.portfolios where is_default)
 where portfolio_id is null;

create index if not exists orders_portfolio_idx on public.orders (portfolio_id, submitted_at desc);

comment on column public.orders.portfolio_id is
  'The portfolio whose broker account executed the order. MP-3.';

-- ── decisions: column, canonical form v3, trigger ───────────────────────────

alter table public.decisions
  add column if not exists portfolio_id uuid references public.portfolios(id);

comment on column public.decisions.portfolio_id is
  'The portfolio the decision was taken for; inside the hash from hash_version 3. '
  'NULL on rows before MP-3 = the default portfolio. MP-3.';

-- Record the v1/v2 digests BEFORE touching the canonical function, so the
-- rewrite is proven not to change any existing row's hash.
create temp table _mp3_before on commit drop as
  select id, encode(digest(public.decisions_canon(d.*), 'sha256'), 'hex') as h
    from public.decisions d;

create or replace function public.decisions_canon(d decisions)
 returns text
 language sql
 immutable
as $function$
  select case
  when coalesce(d.hash_version, 1) >= 2 then
    coalesce(d.symbol,'')                || '|' ||
    coalesce(d.decided_at::text,'')      || '|' ||
    coalesce(d.decision_type,'')         || '|' ||
    coalesce(d.intent,'')                || '|' ||
    coalesce(d.conviction::text,'')      || '|' ||
    coalesce(d.signal_snapshot::text,'') || '|' ||
    coalesce(d.rationale,'')             || '|' ||
    'v'  || d.hash_version::text         || '|' ||
    coalesce(d.sizing_method,'')         || '|' ||
    coalesce(d.pct_of_equity::text,'')   || '|' ||
    coalesce(d.pct_of_gross::text,'')    || '|' ||
    coalesce(d.risk_budget_bps::text,'') || '|' ||
    coalesce(d.model_qty::text,'')       || '|' ||
    coalesce(d.submitted_qty::text,'')   || '|' ||
    coalesce(d.is_override::text,'')     || '|' ||
    coalesce(d.override_reason,'')       || '|' ||
    coalesce(d.book_impact::text,'')     || '|' ||
    coalesce(d.universe_context::text,'')|| '|' ||
    coalesce(d.coherence_net::text,'')   || '|' ||
    coalesce(d.coherence_alignment::text,'')  || '|' ||
    coalesce(d.coherence_dispersion::text,'') || '|' ||
    coalesce(d.size_multiplier::text,'') || '|' ||
    coalesce(d.multiplier_applied::text,'')   || '|' ||
    coalesce(d.claim_id::text,'')        || '|' ||
    coalesce(d.prev_hash,'')
    -- v3 appends the portfolio. v2 rows take no suffix, so their canonical
    -- string -- and hash -- is exactly what it was.
    || case when coalesce(d.hash_version, 1) >= 3
            then '|' || coalesce(d.portfolio_id::text, '') else '' end
  else
    coalesce(d.symbol,'')                || '|' ||
    coalesce(d.decided_at::text,'')      || '|' ||
    coalesce(d.decision_type,'')         || '|' ||
    coalesce(d.intent,'')                || '|' ||
    coalesce(d.conviction::text,'')      || '|' ||
    coalesce(d.signal_snapshot::text,'') || '|' ||
    coalesce(d.rationale,'')             || '|' ||
    coalesce(d.prev_hash,'')
  end
$function$;

do $$
declare v_changed int;
begin
  select count(*) into v_changed
    from _mp3_before b join public.decisions d on d.id = b.id
   where b.h is distinct from encode(digest(public.decisions_canon(d.*), 'sha256'), 'hex');
  if v_changed <> 0 then
    raise exception 'MP-3: canonical rewrite changed % existing hashes', v_changed;
  end if;
end $$;

create or replace function public.decisions_hash_chain()
 returns trigger
 language plpgsql
as $function$
declare
  last_hash text;
begin
  new.created_at := clock_timestamp();
  -- MP-3: a decision records its portfolio. A browser insert carries the
  -- chosen one in x-atlas-portfolio; anything else resolves to the default.
  new.portfolio_id := coalesce(new.portfolio_id, public.atlas_active_portfolio());
  perform pg_advisory_xact_lock(hashtext('atlas_decisions_chain'));
  select content_hash into last_hash from decisions order by seq desc limit 1;
  new.prev_hash    := coalesce(last_hash, '');
  new.hash_version := 3;
  new.content_hash := encode(digest(public.decisions_canon(new), 'sha256'), 'hex');
  return new;
end
$function$;

-- The integrity view counts versions; give v3 its own count (appended column,
-- so CREATE OR REPLACE can keep every existing column in place).
create or replace view public.vw_ledger_integrity as
 WITH ordered AS (
         SELECT d.id,
            d.created_at,
            d.content_hash,
            d.prev_hash,
            COALESCE(d.hash_version, 1) AS hash_version,
            lag(d.content_hash) OVER (ORDER BY d.seq) AS expected_prev,
            encode(digest(decisions_canon(d.*), 'sha256'::text), 'hex'::text) AS recomputed_hash
           FROM decisions d
        )
 SELECT count(*) AS total,
    count(*) FILTER (WHERE prev_hash IS DISTINCT FROM COALESCE(expected_prev, ''::text)) AS broken_links,
    count(*) FILTER (WHERE content_hash IS DISTINCT FROM recomputed_hash) AS tampered_rows,
    count(*) FILTER (WHERE prev_hash IS DISTINCT FROM COALESCE(expected_prev, ''::text)) = 0 AND count(*) FILTER (WHERE content_hash IS DISTINCT FROM recomputed_hash) = 0 AS chain_ok,
    count(*) FILTER (WHERE hash_version = 1) AS v1_rows,
    count(*) FILTER (WHERE hash_version = 2) AS v2_rows,
    max(created_at) AS last_decision_at,
    count(*) FILTER (WHERE hash_version = 3) AS v3_rows
   FROM ordered;

do $$
begin
  if not (select chain_ok from public.vw_ledger_integrity) then
    raise exception 'MP-3: the Ledger chain no longer verifies';
  end if;
end $$;
