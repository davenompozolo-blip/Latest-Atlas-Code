-- ONB-3b: atlas_replace_broker_credentials logged where the keys were held
-- before the replacement as 'environment_or_vault' / 'vault', which was wrong
-- for an account with a prefix AND a Vault secret, and could never say 'none'.
-- It now reads vault.secrets before the store, with the same precedence as
-- atlas_my_broker_accounts and every credential reader. Body otherwise
-- unchanged; grants are untouched by CREATE OR REPLACE and re-asserted below.

create or replace function public.atlas_replace_broker_credentials(
    p_user_id        uuid,
    p_portfolio_id   uuid,
    p_account_number text,
    p_key_id         text,
    p_secret_key     text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_ba   public.broker_accounts%rowtype;
    v_prev text;
begin
    select b.* into v_ba
      from public.portfolios p
      join public.broker_accounts b on b.id = p.broker_account_id
     where p.id = p_portfolio_id
       for update of b;
    if not found then
        raise exception 'no broker account for portfolio %', p_portfolio_id using errcode = 'no_data_found';
    end if;

    if p_user_id is null or not exists (
        select 1 from public.portfolio_members m
         where m.portfolio_id = p_portfolio_id and m.user_id = p_user_id and m.role = 'owner') then
        raise exception 'only the account''s owner can replace its keys' using errcode = '42501';
    end if;

    if v_ba.alpaca_account_number is null
       or v_ba.alpaca_account_number is distinct from btrim(coalesce(p_account_number, '')) then
        raise exception 'these keys belong to a different broker account' using errcode = '22023';
    end if;

    -- Where the keys were held BEFORE this write, by the same precedence the
    -- readers use (Vault first, then the env pair). Read before the store,
    -- because after it the answer is always 'vault'.
    v_prev := case
        when exists (select 1 from vault.secrets s
                      where s.name = 'broker_credentials:' || v_ba.id::text) then 'vault'
        when v_ba.credential_prefix is not null then 'environment'
        else 'none'
    end;

    perform public.atlas_store_broker_credentials(v_ba.id, p_key_id, p_secret_key);

    -- A key change is worth a line in the log the platform already reads; no
    -- key material, only who and which account.
    insert into public.sync_log (function_name, source, status, started_at, finished_at, portfolio_id, details)
    values ('broker_keys_replaced', 'api_onboarding', 'success', clock_timestamp(), clock_timestamp(),
            p_portfolio_id, jsonb_build_object('by_user', p_user_id, 'previously_held', v_prev));

    return right(v_ba.alpaca_account_number, 4);
end
$$;

revoke all on function public.atlas_replace_broker_credentials(uuid, uuid, text, text, text)
    from public, anon, authenticated;
grant execute on function public.atlas_replace_broker_credentials(uuid, uuid, text, text, text) to service_role;

do $$
begin
    if has_function_privilege('authenticated', 'public.atlas_replace_broker_credentials(uuid,uuid,text,text,text)', 'execute')
       or has_function_privilege('anon', 'public.atlas_replace_broker_credentials(uuid,uuid,text,text,text)', 'execute') then
        raise exception 'ONB-3b: a browser role can execute the key writer';
    end if;
end $$;
