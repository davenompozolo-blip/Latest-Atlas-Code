-- VC-1: broker credentials live in Vault, keyed to the broker account.
--
-- Until now an account's Alpaca key pair was an ENVIRONMENT variable pair,
-- <credential_prefix>_KEY / _SECRET, set by hand in BOTH Supabase function
-- secrets (syncs) and Vercel (trading), followed by a Vercel redeploy. That is
-- fine for three accounts and cannot be how a new user joins: it is manual,
-- it needs a deploy, and every account's keys sit in every deployment's
-- environment.
--
-- Now each pair is ONE Vault secret, named broker_credentials:<broker_account_id>,
-- holding {"key_id": ..., "secret_key": ...}. One secret, not two, so a pair
-- can never be half-written.
--
--   atlas_broker_credentials(id)        read  -- service_role / postgres only
--   atlas_store_broker_credentials(...)  write -- service_role / postgres only
--   atlas_register_broker_account(...)   broker_accounts + portfolios + Vault,
--                                        in one transaction
--
-- Readers try Vault first and fall back to the env pair named by
-- credential_prefix, so the three existing accounts keep working until their
-- keys are adopted into Vault (api/broker-accounts.js?action=adopt_env).
--
-- The account number is still the identity gate. Registration takes it from
-- the broker's own /v2/account answer (the API route verifies before calling
-- this), never from what a user typed.

-- A Vault-held account has no env prefix, so the prefix can no longer be
-- required. The account number still is: it is what every sync and order
-- verifies the credentials against.
alter table public.broker_accounts
  drop constraint broker_accounts_alpaca_identified_ck;
alter table public.broker_accounts
  add constraint broker_accounts_alpaca_identified_ck check (
    case when broker = 'alpaca' then alpaca_account_number is not null
         else true end);

create or replace function public.atlas_broker_credentials(p_broker_account_id uuid)
returns table (key_id text, secret_key text)
language sql
stable
security definer
set search_path = ''
as $fn$
  select s.decrypted_secret::jsonb ->> 'key_id',
         s.decrypted_secret::jsonb ->> 'secret_key'
    from vault.decrypted_secrets s
   where s.name = 'broker_credentials:' || p_broker_account_id::text
$fn$;

comment on function public.atlas_broker_credentials(uuid) is
  'VC-1. The Alpaca key pair for a broker account, from Vault. No rows = not in Vault '
  '(callers fall back to the env pair named by credential_prefix). service_role only.';

create or replace function public.atlas_store_broker_credentials(
  p_broker_account_id uuid, p_key_id text, p_secret_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_name    text := 'broker_credentials:' || p_broker_account_id::text;
  v_payload text;
  v_id      uuid;
begin
  if not exists (select 1 from public.broker_accounts where id = p_broker_account_id) then
    raise exception 'no broker account %', p_broker_account_id;
  end if;
  if coalesce(btrim(p_key_id), '') = '' or coalesce(btrim(p_secret_key), '') = '' then
    raise exception 'both the key id and the secret key are required';
  end if;

  v_payload := jsonb_build_object('key_id', btrim(p_key_id),
                                  'secret_key', btrim(p_secret_key))::text;

  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(v_payload, v_name,
      'Alpaca API key pair for broker account ' || p_broker_account_id::text);
  else
    perform vault.update_secret(v_id, v_payload);
  end if;
end
$fn$;

comment on function public.atlas_store_broker_credentials(uuid, text, text) is
  'VC-1. Create or replace the Vault-held Alpaca key pair for a broker account. '
  'Callers must have verified the pair against the account number first. service_role only.';

create or replace function public.atlas_register_broker_account(
  p_name text, p_account_number text, p_is_paper boolean,
  p_key_id text, p_secret_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_broker    uuid;
  v_portfolio uuid;
begin
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'a display name is required';
  end if;
  if exists (select 1 from public.broker_accounts
              where alpaca_account_number = p_account_number) then
    raise exception 'account % is already registered', p_account_number
      using errcode = 'unique_violation';
  end if;

  insert into public.broker_accounts
    (broker, account_id, alpaca_account_number, is_paper)
  values
    ('alpaca', 'alpaca-' || lower(p_account_number), p_account_number, p_is_paper)
  returning id into v_broker;

  insert into public.portfolios (name, broker, broker_account_id, metadata)
  values (btrim(p_name), 'alpaca', v_broker,
          jsonb_build_object('registered_by', 'vc1', 'account_number', p_account_number))
  returning id into v_portfolio;

  perform public.atlas_store_broker_credentials(v_broker, p_key_id, p_secret_key);
  return v_portfolio;
end
$fn$;

comment on function public.atlas_register_broker_account(text, text, boolean, text, text) is
  'VC-1. Register an Alpaca account: broker_accounts + portfolios rows and its Vault key '
  'pair, atomically. The account number must come from the broker''s own /v2/account '
  'answer for these keys (api/broker-accounts.js verifies first). service_role only.';

-- Every new function is executable by PUBLIC by default, and anon /
-- authenticated inherit it from there -- revoke PUBLIC too, or the grant stays.
revoke execute on function public.atlas_broker_credentials(uuid)
  from public, anon, authenticated;
revoke execute on function public.atlas_store_broker_credentials(uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.atlas_register_broker_account(text, text, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.atlas_broker_credentials(uuid) to service_role;
grant execute on function public.atlas_store_broker_credentials(uuid, text, text) to service_role;
grant execute on function public.atlas_register_broker_account(text, text, boolean, text, text) to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.atlas_broker_credentials(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.atlas_broker_credentials(uuid)', 'execute')
     or has_function_privilege('anon', 'public.atlas_store_broker_credentials(uuid, text, text)', 'execute')
     or has_function_privilege('anon', 'public.atlas_register_broker_account(text, text, boolean, text, text)', 'execute')
  then
    raise exception 'VC-1: a credential function is executable by a browser role';
  end if;
end $$;
