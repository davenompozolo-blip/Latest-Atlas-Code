-- Per-symbol latest reading, not "the latest day".
--
-- The benchmark (SPY) carries a fresher feed than the holdings do, so
-- max(asof) across the table lands on a date only SPY has. A caller reading
-- "the latest day" would get one row and conclude every holding is
-- untriggered — a partial session masquerading as the whole book, which is
-- the exact failure mode this page exists to prevent.
--
-- Each name therefore reports its own most recent session and how stale that
-- reading is, so the caller can decline to fire a trigger on a dead feed
-- rather than treating silence as calm.
create or replace view public.vw_holding_vol_latest as
select distinct on (v.symbol)
    v.symbol,
    v.asof,
    v.ret_1d,
    v.vol_20d,
    v.z_move,
    (current_date - v.asof)                    as days_old,
    -- §4.4 the trigger fires at z >= 2.0, and only where the window is real.
    -- A null z_move is an abstention, never a quiet "no".
    (v.z_move is not null and v.z_move >= 2.0) as vol_trigger,
    case
        when v.z_move is null then 'window under 20 sessions'
        else null
    end                                        as abstain_reason
from public.holding_vol_trailing v
order by v.symbol, v.asof desc;

grant select on public.vw_holding_vol_latest to anon, authenticated;

notify pgrst, 'reload schema';
