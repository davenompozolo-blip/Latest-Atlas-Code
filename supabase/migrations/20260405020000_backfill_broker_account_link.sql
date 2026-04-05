-- ATLAS: backfill broker_account link for the primary Alpaca portfolio.
--
-- Context: the tenancy migration (commit 324c27b) added
-- public.portfolios.broker_account_id + public.broker_accounts, but did
-- not seed any rows. The legacy portfolios.broker text column still
-- held 'alpaca' for the one existing portfolio. As a result the
-- sync_alpaca_positions Edge Function's portfolio query returned zero
-- rows and every invocation was a no-op (positions_seen=0).
--
-- This migration is idempotent: re-running it does nothing once the
-- link is in place.

do $$
declare
  v_ba_id uuid;
begin
  if exists (
    select 1 from public.portfolios
    where broker = 'alpaca' and broker_account_id is null
  ) then
    select id into v_ba_id from public.broker_accounts where broker = 'alpaca' limit 1;
    if v_ba_id is null then
      insert into public.broker_accounts (broker, account_id)
      values ('alpaca', 'paper-primary')
      returning id into v_ba_id;
    end if;

    update public.portfolios
       set broker_account_id = v_ba_id
     where broker = 'alpaca' and broker_account_id is null;
  end if;
end $$;
