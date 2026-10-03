-- ONB-1b: two holes in ONB-1, raised by CodeRabbit on PR #861 and confirmed
-- against the live functions before changing anything.
--
-- 1. The broker gate never saw the real connect path.
--    atlas_connect_broker_account() calls atlas_register_broker_account(),
--    which INSERTs the broker row with user_id NULL, and then UPDATEs user_id.
--    Both broker triggers fired on INSERT only, so the approval gate passed a
--    NULL owner and the broker_connected_at stamp never ran for an ONB-1 era
--    connect. They now fire on an UPDATE that actually changes user_id too.
--    The gate is a no-op when user_id does not change, so a later full-row
--    update of an existing account (a revoked owner's, say) is not refused.
--
-- 2. The self-heal path in atlas_my_onboarding() always wrote 'pending'.
--    An allowlisted or Auth-invited user whose sign-up trigger failed would
--    then sit at awaiting_approval. One function, atlas_ensure_account(uid),
--    now holds the approval rule, and both the auth.users trigger and the
--    self-heal call it, so the two cannot drift.

-- -----------------------------------------------------------------------------
-- 1. The one place a missing account row is created.
-- -----------------------------------------------------------------------------
create or replace function public.atlas_ensure_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user    auth.users%rowtype;
    v_email   text;
    v_allow   public.atlas_allowlist%rowtype;
    v_invited boolean;
begin
    select * into v_user from auth.users u where u.id = p_user_id;
    if not found then
        return;
    end if;
    v_email := lower(btrim(coalesce(v_user.email, '')));

    select * into v_allow
      from public.atlas_allowlist a
     where a.email = v_email and a.revoked_at is null;
    -- An unrevoked allowlist row, or an account created by Auth's invite
    -- endpoint (invited_at, ON-1 / RA-2), is approved by that act.
    v_invited := found or v_user.invited_at is not null;

    -- Names: allowlist first (an administrator typed them), then sign-up
    -- metadata. Metadata is client-controlled: display only, never status.
    insert into public.atlas_accounts
        (user_id, email, first_name, surname, status, source,
         requested_at, first_signin_at, approved_at, approved_by)
    values
        (v_user.id, v_email,
         nullif(btrim(coalesce(v_allow.first_name, v_user.raw_user_meta_data ->> 'first_name')), ''),
         nullif(btrim(coalesce(v_allow.surname,    v_user.raw_user_meta_data ->> 'surname')),    ''),
         case when v_invited then 'approved' else 'pending' end,
         case when v_invited then 'invite'   else 'self_signup' end,
         coalesce(v_user.created_at, now()),
         v_user.last_sign_in_at,
         case when v_invited then now() end,
         case when v_invited then v_allow.invited_by end)
    on conflict (user_id) do nothing;

    if v_invited then
        update public.atlas_allowlist
           set claimed_by = v_user.id, claimed_at = now()
         where email = v_email and claimed_at is null;
    end if;
end
$$;

revoke all on function public.atlas_ensure_account(uuid) from public, anon, authenticated;

-- The sign-up trigger keeps swallowing its own errors (a bug here must never
-- block sign-in); atlas_my_onboarding() heals a missing row through the same
-- function.
create or replace function public.atlas_on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    begin
        perform public.atlas_ensure_account(new.id);
    exception when others then
        raise warning 'atlas_on_auth_user_created(%): %', new.id, sqlerrm;
    end;
    return new;
end
$$;

-- Self-heal in atlas_my_onboarding(): textual patch against the live body,
-- anchored on the old insert, refused if the anchor is absent.
do $$
declare
    v_def text := pg_get_functiondef('public.atlas_my_onboarding()'::regprocedure);
    v_old text := $o$        insert into public.atlas_accounts (user_id, email, status, source, requested_at, first_signin_at)
        select u.id, lower(u.email), 'pending', 'self_signup', u.created_at, u.last_sign_in_at
          from auth.users u where u.id = v_uid
        on conflict (user_id) do nothing;$o$;
    v_new text := $n$        perform public.atlas_ensure_account(v_uid);$n$;
begin
    if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
        raise exception 'ONB-1b: self-heal anchor not found exactly once in atlas_my_onboarding';
    end if;
    execute replace(v_def, v_old, v_new);
end $$;

-- -----------------------------------------------------------------------------
-- 2. Broker triggers: insert, and an update that sets or changes the owner.
-- -----------------------------------------------------------------------------
create or replace function public.atlas_on_broker_account_inserted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_op = 'UPDATE' and new.user_id is not distinct from old.user_id then
        return new;
    end if;
    if new.user_id is not null
       and not exists (select 1 from public.atlas_admins x where x.user_id = new.user_id)
       and not exists (select 1 from public.atlas_accounts a
                        where a.user_id = new.user_id and a.status = 'approved') then
        raise exception 'account % is not approved to connect a broker', new.user_id
              using errcode = '42501';
    end if;
    return new;
end
$$;

drop trigger if exists atlas_broker_requires_approval on public.broker_accounts;
create trigger atlas_broker_requires_approval
    before insert or update of user_id on public.broker_accounts
    for each row execute function public.atlas_on_broker_account_inserted();

-- The stamp function already no-ops once broker_connected_at is set, and it
-- catches its own errors, so firing it on an unchanged owner is harmless.
drop trigger if exists atlas_broker_stamp_connected on public.broker_accounts;
create trigger atlas_broker_stamp_connected
    after insert or update of user_id on public.broker_accounts
    for each row when (new.user_id is not null)
    execute function public.atlas_after_broker_account_inserted();

-- -----------------------------------------------------------------------------
-- 3. Assertions.
-- -----------------------------------------------------------------------------
do $$
begin
    if pg_get_functiondef('public.atlas_my_onboarding()'::regprocedure) !~ 'atlas_ensure_account\(v_uid\)' then
        raise exception 'ONB-1b: atlas_my_onboarding does not self-heal through atlas_ensure_account';
    end if;
    if pg_get_triggerdef((select oid from pg_trigger where tgname = 'atlas_broker_requires_approval'
                           and tgrelid = 'public.broker_accounts'::regclass)) !~ 'UPDATE OF user_id' then
        raise exception 'ONB-1b: the broker approval gate does not fire on an owner update';
    end if;
    if has_function_privilege('authenticated', 'public.atlas_ensure_account(uuid)', 'execute')
       or has_function_privilege('anon', 'public.atlas_ensure_account(uuid)', 'execute') then
        raise exception 'ONB-1b: atlas_ensure_account is executable by a browser role';
    end if;
end $$;
