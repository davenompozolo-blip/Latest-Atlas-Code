-- ONB-3: an owner lists their broker accounts and replaces an account's keys.
-- Runs inside one block that always raises, so nothing it writes survives --
-- including the Vault updates and the prefix set in case 9. Expect ONB3_ALL_PASSED.
do $$
declare
    v_owner uuid;
    v_other uuid;
    v_pf    uuid;
    v_num   text;
    v_ba    uuid;
    v_n     int;
    v_held  text;
    v_last4 text;
    v_ok    boolean;
    v_secret text;
begin
    -- An owned, Vault-held account and an owner; and a second person who does
    -- not own it.
    select m.user_id, p.id, b.alpaca_account_number, b.id
      into v_owner, v_pf, v_num, v_ba
      from public.portfolio_members m
      join public.portfolios p on p.id = m.portfolio_id
      join public.broker_accounts b on b.id = p.broker_account_id
     where m.role = 'owner'
       and exists (select 1 from vault.secrets s where s.name = 'broker_credentials:' || b.id::text)
     order by p.created_at desc limit 1;
    if v_owner is null then raise exception 'setup: no owned Vault-held account'; end if;
    select u.id into v_other from auth.users u
     where u.id <> v_owner
       and not exists (select 1 from public.portfolio_members m where m.portfolio_id = v_pf and m.user_id = u.id)
     limit 1;
    if v_other is null then raise exception 'setup: need a second user'; end if;

    -- 1. The owner sees the account: last four only, keys held in Vault.
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    select count(*) filter (where portfolio_id = v_pf), max(keys_held) filter (where portfolio_id = v_pf),
           max(account_last4) filter (where portfolio_id = v_pf)
      into v_n, v_held, v_last4 from public.atlas_my_broker_accounts();
    if v_n <> 1 or v_held is distinct from 'vault' or v_last4 is distinct from right(v_num, 4) then
        raise exception 'case 1: owner listing wrong (n=%, held=%, last4=%)', v_n, v_held, v_last4;
    end if;

    -- 2. Someone else does not see it.
    perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
    select count(*) into v_n from public.atlas_my_broker_accounts() where portfolio_id = v_pf;
    if v_n <> 0 then raise exception 'case 2: a non-owner sees another person''s account'; end if;

    -- 3. No caller at all: no rows.
    perform set_config('request.jwt.claims', '', true);
    select count(*) into v_n from public.atlas_my_broker_accounts();
    if v_n <> 0 then raise exception 'case 3: a caller with no identity listed % accounts', v_n; end if;

    -- 4. A non-owner cannot replace the keys.
    v_ok := false;
    begin
        perform public.atlas_replace_broker_credentials(v_other, v_pf, v_num, 'PKTEST', 'secret-test');
    exception when insufficient_privilege then v_ok := true;
    end;
    if not v_ok then raise exception 'case 4: a non-owner replaced the keys'; end if;

    -- 5. Keys for a different broker account are refused.
    v_ok := false;
    begin
        perform public.atlas_replace_broker_credentials(v_owner, v_pf, v_num || 'X', 'PKTEST', 'secret-test');
    exception when invalid_parameter_value then v_ok := true;
    end;
    if not v_ok then raise exception 'case 5: keys for another account were accepted'; end if;

    -- 6. Blank keys are refused.
    v_ok := false;
    begin
        perform public.atlas_replace_broker_credentials(v_owner, v_pf, v_num, '  ', 'secret-test');
    exception when raise_exception then
        if sqlerrm like '%key id and the secret key are required%' then v_ok := true; else raise; end if;
    end;
    if not v_ok then raise exception 'case 6: a blank key id was stored'; end if;

    -- 7. Happy path: the owner, the same account number. One secret, updated
    --    in place, and a log line naming no key.
    v_last4 := public.atlas_replace_broker_credentials(v_owner, v_pf, v_num, 'PKTESTREPLACED', 'secret-replaced');
    if v_last4 is distinct from right(v_num, 4) then raise exception 'case 7: wrong last4 returned'; end if;
    select count(*) into v_n from vault.secrets where name = 'broker_credentials:' || v_ba::text;
    if v_n <> 1 then raise exception 'case 7: % secrets for one account', v_n; end if;
    select (decrypted_secret::jsonb ->> 'key_id') into v_secret
      from vault.decrypted_secrets where name = 'broker_credentials:' || v_ba::text;
    if v_secret is distinct from 'PKTESTREPLACED' then raise exception 'case 7: secret not updated'; end if;
    select count(*) into v_n from public.sync_log
     where function_name = 'broker_keys_replaced' and portfolio_id = v_pf
       and details::text not like '%secret-replaced%' and details::text not like '%PKTESTREPLACED%'
       and started_at > now() - interval '1 minute';
    if v_n <> 1 then raise exception 'case 7: expected one clean log row, got %', v_n; end if;
    -- The account was Vault-held before the write, so the log says so.
    select count(*) into v_n from public.sync_log
     where function_name = 'broker_keys_replaced' and portfolio_id = v_pf
       and details ->> 'previously_held' = 'vault'
       and started_at > now() - interval '1 minute';
    if v_n <> 1 then raise exception 'case 7: previously_held should read vault'; end if;

    -- 9. An account carrying BOTH an env prefix and a Vault secret reads the
    --    Vault first, so the log says 'vault', never the env pair.
    update public.broker_accounts set credential_prefix = 'ONB3_TEST_PREFIX' where id = v_ba;
    perform public.atlas_replace_broker_credentials(v_owner, v_pf, v_num, 'PKTESTAGAIN', 'secret-again');
    select count(*) into v_n from public.sync_log
     where function_name = 'broker_keys_replaced' and portfolio_id = v_pf
       and details ->> 'previously_held' = 'vault'
       and started_at > now() - interval '1 minute';
    if v_n <> 2 then raise exception 'case 9: a Vault-held account with a prefix was logged as %',
        (select details ->> 'previously_held' from public.sync_log
          where function_name = 'broker_keys_replaced' and portfolio_id = v_pf
          order by id desc limit 1); end if;

    -- 8. The browser cannot call the writer at all.
    if has_function_privilege('authenticated', 'public.atlas_replace_broker_credentials(uuid,uuid,text,text,text)', 'execute') then
        raise exception 'case 8: authenticated can execute the key writer';
    end if;

    raise exception 'ONB3_ALL_PASSED';
end $$;
