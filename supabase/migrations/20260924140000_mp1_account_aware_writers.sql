-- MP-1: each broker account names its own credentials and proves its identity.
--
-- Multi-portfolio, phase 1 (schema half; the edge functions are the other half).
-- Behaviour-neutral for the existing book.
--
-- THE DEFECT. sync_alpaca_positions / sync_alpaca_transactions fetched ONE
-- account with ONE global key pair and wrote the result into EVERY Alpaca
-- portfolio row; sync_portfolio_history took `limit 1` of them, an arbitrary
-- one once there are two. Registering a second portfolio would have copied the
-- first account's book into it. The transactions resume watermark was a GLOBAL
-- max(transaction_date), so the quieter account would resume from the busier
-- one's newest fill and skip its own.
--
-- CREDENTIALS BY REFERENCE. credential_prefix is the NAME of a secret pair --
-- '<prefix>_KEY' / '<prefix>_SECRET' in the edge-function environment -- never
-- a value. No secret is ever stored in the database.
--
-- IDENTITY GATE. alpaca_account_number is what /v2/account must report for
-- those credentials. The sync refuses to write when it does not. A mis-set
-- prefix is otherwise the same failure as the defect above, reached by
-- configuration instead of code: one account's book silently written into
-- another's portfolio.

alter table public.broker_accounts
  add column if not exists credential_prefix     text,
  add column if not exists alpaca_account_number text,
  add column if not exists is_paper              boolean not null default true;

alter table public.broker_accounts
  drop constraint if exists broker_accounts_credential_prefix_ck,
  add  constraint broker_accounts_credential_prefix_ck
       check (credential_prefix is null or credential_prefix ~ '^[A-Z][A-Z0-9_]{0,62}$'),
  drop constraint if exists broker_accounts_account_number_ck,
  add  constraint broker_accounts_account_number_ck
       check (alpaca_account_number is null or alpaca_account_number ~ '^[A-Z0-9]{6,32}$'),
  -- CASE, not an OR chain: a CHECK passes on NULL, and an OR chain over a
  -- nullable column can evaluate to NULL (CLAUDE.md, 2026-09-21).
  drop constraint if exists broker_accounts_alpaca_identified_ck,
  add  constraint broker_accounts_alpaca_identified_ck
       check (case when broker = 'alpaca'
                   then credential_prefix is not null and alpaca_account_number is not null
                   else true end) not valid;

create unique index if not exists broker_accounts_credential_prefix_uidx
  on public.broker_accounts (credential_prefix) where credential_prefix is not null;
create unique index if not exists broker_accounts_account_number_uidx
  on public.broker_accounts (alpaca_account_number) where alpaca_account_number is not null;

-- The original account. PA39BDB08Y3X is what its own stored /v2/account
-- payload reports (account_snapshots.raw->>'account_number'), and its Alpaca
-- id matches portfolios.external_id -- verified, not assumed.
update public.broker_accounts
   set credential_prefix     = 'ALPACA_API',
       alpaca_account_number = 'PA39BDB08Y3X'
 where broker = 'alpaca'
   and account_id = 'paper-primary'
   and credential_prefix is null;

alter table public.broker_accounts validate constraint broker_accounts_alpaca_identified_ck;

comment on column public.broker_accounts.credential_prefix is
  'NAME of the edge-function secret pair <prefix>_KEY / <prefix>_SECRET. Never a value. MP-1.';
comment on column public.broker_accounts.alpaca_account_number is
  'What /v2/account must report for these credentials. The syncs refuse to write on a mismatch. MP-1.';

-- Nothing in src/ or api/ reads this table, and it now names secrets and
-- account numbers. RLS already refused anon writes (SELECT policy only); the
-- read goes too. Definer views and the service role are unaffected.
revoke all on public.broker_accounts from anon, authenticated;

-- ── sync_log carries the account a run covered ───────────────────────────────
-- Without it, "success, 37 positions" cannot say WHICH book it synced -- the
-- same reason details.scope exists for the price sync.

alter table public.sync_log
  add column if not exists portfolio_id uuid references public.portfolios(id);

create index if not exists sync_log_portfolio_fn_started_idx
  on public.sync_log (portfolio_id, function_name, started_at desc)
  where portfolio_id is not null;

comment on column public.sync_log.portfolio_id is
  'The portfolio a per-account sync covered. NULL for runs that are not per-account. MP-1.';

-- ── refresh_universe_correlations: latest snapshot PER PORTFOLIO ────────────
-- It pins held names into the correlation matrix, and "held in any account" is
-- the right set. But it took max(as_of_date) over ALL portfolios, so an account
-- whose sync lagged a day would drop out of the matrix entirely.

do $$
declare
  v_old text := pg_get_functiondef('public.refresh_universe_correlations(integer, integer, numeric, integer)'::regprocedure);
  v_anchor constant text :=
    'where p.as_of_date = (select max(as_of_date) from public.positions)';
  v_new_txt constant text :=
    'where (p.portfolio_id, p.as_of_date) in (select portfolio_id, max(as_of_date) from public.positions group by portfolio_id)';
  v_n int;
begin
  if position(v_new_txt in v_old) > 0 then
    raise exception 'MP-1: refresh_universe_correlations already per-portfolio -- refusing to re-patch';
  end if;
  v_n := (length(v_old) - length(replace(v_old, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then
    raise exception 'MP-1: refresh_universe_correlations anchor found % times, expected 1', v_n;
  end if;
  execute replace(v_old, v_anchor, v_new_txt);
end $$;
