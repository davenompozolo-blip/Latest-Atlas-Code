-- A2's dispersion state now reads score_20d_z, so p_quiet is genuinely a sigma
-- level. The constant does not move -- 0.5 was always the intended threshold;
-- it was being compared against a rolling 20-session SUM, which is why "quiet"
-- fired on 22 of 4,116 sessions instead of on the tenth or so the reading was
-- written to describe.
--
-- Nothing calling this changes: the signature, the default and the four return
-- values are identical, and the E1.3 grant of EXECUTE to anon/authenticated
-- survives CREATE OR REPLACE.

create or replace function public.atlas_axis_dispersion_state(p_date date, p_quiet numeric default 0.5)
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
    with inc as (
        select s.axis_key, s.score_20d_z
          from public.factor_axis_scores s
          join public.factor_axes a on a.axis_key = s.axis_key
         where s.date = p_date and a.marginal is not true and s.score_20d_z is not null
    )
    select case
        when (select count(*) from inc) < 2                                then 'insufficient_axes'
        when (select bool_and(abs(score_20d_z) < p_quiet) from inc)        then 'quiet'
        when (select count(distinct sign(score_20d_z)) from inc) = 1
         and (select bool_or(abs(score_20d_z) >= p_quiet) from inc)        then 'aligned'
        else 'contested'
    end;
$function$;
