-- The circulation footer (§6.2) sizes freed capital in dollars as well as
-- percentage points, so it needs the NAV the headroom figures are already
-- computed against. Exposing it here keeps one denominator rather than
-- letting the caller reconstruct it by dividing headroom_usd by headroom_pp,
-- which would silently disagree the moment either rounds.
--
-- Dropped rather than replaced: adding a column ahead of `positions` is a
-- column rename as far as create-or-replace is concerned.
drop view if exists public.vw_sleeve_headroom;

create view public.vw_sleeve_headroom as
with nav as (
    select equity from account_snapshots order by as_of desc limit 1
)
select
    h.sector                                                as sleeve,
    round(sum(h.weight_pct), 2)                             as weight_pct,
    30.0                                                    as cap_pct,
    round(30.0 - sum(h.weight_pct), 2)                      as headroom_pp,
    round((30.0 - sum(h.weight_pct)) / 100::numeric * (select nav.equity from nav), 0) as headroom_usd,
    count(*)                                                as positions,
    round((select nav.equity from nav), 0)                  as nav_usd
from vw_nexus_holdings h
group by h.sector
order by round(sum(h.weight_pct), 2) desc;

grant select on public.vw_sleeve_headroom to anon, authenticated;
