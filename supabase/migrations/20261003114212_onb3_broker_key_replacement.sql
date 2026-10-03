-- ONB-3: an owner can see their broker accounts and replace an account's keys.
--
-- Keys are replaced, never re-registered: the account keeps its portfolio,
-- history and owner. The new pair must belong to the SAME broker account --
-- the route reads the account number from the broker's /v2/account answer and
-- this function refuses it unless it matches the registered number, the same
-- identity gate every sync and order runs. A key pair for a different account
-- is refused here rather than discovered by the next sync as IDENTITY MISMATCH.

create or replace function public.atlas_my_broker_accounts()
returns table (
    portfolio_id     uuid,
    portfolio_name   text,
    broker           text,
    is_paper         boolean,
    account_last4    text,
    connected_at     timestamptz,
    keys_held        text,          -- 'vault' | 'environment' | 'none'
    last_sync_at     timestamptz,
    last_sync_status text
)
language sql
stable
security definer
set search_path = ''
as $$
    -- Owned accounts only. No caller (pg_cron, psql) has no auth.uid() and
    -- gets no rows. Never returns a key, a secret name or a full account number.
    select p.id, p.name, b.broker, b.is_paper,
           right(b.alpaca_account_number, 4),
           b.created_at,
           case
               when exists (select 1 from vault.secrets s
                             where s.name = 'broker_credentials:' || b.id::text) then 'vault'
               when b.credential_prefix is not null then 'environment'
               else 'none'
           end,
           ls.started_at, ls.status
      from public.portfolio_members m
      join public.portfolios p        on p.id = m.portfolio_id
      join public.broker_accounts b   on b.id = p.broker_account_id
      left join lateral (
            select l.started_at, l.status
              from public.sync_log l
             where l.portfolio_id = p.id
               and l.function_name = 'sync_alpaca_positions'
             order by l.started_at desc
             limit 1) ls on true
     where m.user_id = auth.uid()
       and m.role = 'owner'
     order by p.created_at, p.id;
$$;

revoke all on function public.atlas_my_broker_accounts() from public, anon;
grant execute on function public.atlas_my_broker_accounts() to authenticated;

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
    v_ba public.broker_accounts%rowtype;
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

    perform public.atlas_store_broker_credentials(v_ba.id, p_key_id, p_secret_key);

    -- A key change is worth a line in the log the platform already reads; no
    -- key material, only who and which account.
    insert into public.sync_log (function_name, source, status, started_at, finished_at, portfolio_id, details)
    values ('broker_keys_replaced', 'api_onboarding', 'success', clock_timestamp(), clock_timestamp(),
            p_portfolio_id, jsonb_build_object('by_user', p_user_id, 'previously_held',
                case when v_ba.credential_prefix is not null then 'environment_or_vault' else 'vault' end));

    return right(v_ba.alpaca_account_number, 4);
end
$$;

revoke all on function public.atlas_replace_broker_credentials(uuid, uuid, text, text, text)
    from public, anon, authenticated;
grant execute on function public.atlas_replace_broker_credentials(uuid, uuid, text, text, text) to service_role;

do $$
begin
    if has_function_privilege('authenticated', 'public.atlas_replace_broker_credentials(uuid,uuid,text,text,text)', 'execute')
       or has_function_privilege('anon', 'public.atlas_replace_broker_credentials(uuid,uuid,text,text,text)', 'execute')
       or has_function_privilege('anon', 'public.atlas_my_broker_accounts()', 'execute') then
        raise exception 'ONB-3: a browser role can execute a credential function it must not';
    end if;
    if not has_function_privilege('authenticated', 'public.atlas_my_broker_accounts()', 'execute') then
        raise exception 'ONB-3: authenticated cannot list its own broker accounts';
    end if;
end $$;
