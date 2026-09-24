-- MP-1: register the second Alpaca paper account, Atlas Secondary.
--
-- Safe only AFTER sync_alpaca_positions v13 / sync_alpaca_transactions v5 /
-- sync_portfolio_history v9 are deployed: before them every Alpaca portfolio
-- received the ORIGINAL account's book. Those versions resolve credentials per
-- portfolio and refuse to write unless /v2/account reports the registered
-- account_number, so a wrong credential_prefix fails loudly rather than
-- writing one book into the other.
--
-- Not the default: every book-scoped reader stays on the original account
-- (atlas_active_portfolio(), MP-0) until the account switcher (MP-2).
--
-- Credentials: edge-function secrets ATLAS_ALPACA_API_KEY / ATLAS_ALPACA_API_SECRET.
-- Idempotent, keyed on the account number.

insert into public.broker_accounts (broker, account_id, credential_prefix, alpaca_account_number, is_paper)
select 'alpaca', 'paper-secondary', 'ATLAS_ALPACA_API', 'PA345SGOX9LY', true
 where not exists (select 1 from public.broker_accounts where alpaca_account_number = 'PA345SGOX9LY');

insert into public.portfolios (name, broker, base_currency, broker_account_id, is_default, metadata)
select 'Atlas Secondary', 'alpaca', 'USD', b.id, false,
       jsonb_build_object('account_number', 'PA345SGOX9LY', 'registered_by', 'mp1')
  from public.broker_accounts b
 where b.alpaca_account_number = 'PA345SGOX9LY'
   and not exists (select 1 from public.portfolios p where p.broker_account_id = b.id);

do $$
begin
  if (select count(*) from public.portfolios where is_default) <> 1 then
    raise exception 'MP-1: registering Atlas Secondary must leave exactly one default portfolio';
  end if;
  if (select count(*) from public.portfolios p
        join public.broker_accounts b on b.id = p.broker_account_id
       where b.alpaca_account_number = 'PA345SGOX9LY') <> 1 then
    raise exception 'MP-1: expected exactly one portfolio for PA345SGOX9LY';
  end if;
end $$;
