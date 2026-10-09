-- ONB-5: tell the administrators when someone is waiting for approval.
--
-- api/account-notify.js sends one email naming everyone pending whose details
-- are complete and who has not been announced, then stamps
-- atlas_accounts.admin_notified_at. This job dispatches it every 5 minutes,
-- but ONLY when such a person exists -- an ordinary five minutes makes no
-- request and writes no sync_log row. A failed run (no RESEND_API_KEY on the
-- deployment, Resend refusing) is retried at most hourly rather than every
-- tick, so a missing key costs one error row an hour, not 288 a day.

create or replace function public.atlas_notify_admins_waiting()
returns bigint
language plpgsql
security definer
set search_path = ''
as $fn$
begin
    if not exists (
        select 1 from public.atlas_accounts
         where status = 'pending'
           and details_completed_at is not null
           and admin_notified_at is null
    ) then
        return null;
    end if;
    if exists (
        select 1 from public.sync_log
         where function_name = 'notify_admins_waiting'
           and source = 'pg_cron_chain'
           and started_at > now() - interval '55 minutes'
           and status is distinct from 'success'
    ) then
        return null;
    end if;
    return public.atlas_chain_dispatch('notify_admins_waiting', '/api/account-notify', false, 30000);
end
$fn$;

revoke execute on function public.atlas_notify_admins_waiting() from public, anon, authenticated;

do $do$
begin
    if has_function_privilege('anon', 'public.atlas_notify_admins_waiting()', 'execute')
       or has_function_privilege('authenticated', 'public.atlas_notify_admins_waiting()', 'execute') then
        raise exception 'atlas_notify_admins_waiting is executable by a browser role';
    end if;
end
$do$;

select cron.unschedule(jobid) from cron.job where jobname = 'notify_admins_waiting';
select cron.schedule('notify_admins_waiting', '*/5 * * * *', $$select public.atlas_notify_admins_waiting();$$);
