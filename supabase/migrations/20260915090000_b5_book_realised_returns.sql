-- B5, step 1. The realised book return series, published once.
--
-- Every consumer so far has re-derived this inline, and each re-derivation is a
-- chance to get the two C1 rules wrong:
--
-- 1. `ts` is timestamptz stamped AFTER the US close (22:00 or 00:00 UTC), so
--    `ts::date` casts in UTC and lands a third of the series on the FOLLOWING
--    calendar day -- 34 of 175 rows onto weekends. Cast to the exchange's date.
--
-- 2. A `stale_snapshot` row carries the prior session's equity, so the return
--    INTO it is fabricated -- and so is the return OUT of it, because the
--    provider computes the next day's change against the carried level. The
--    damage reaches one row further than the flag. Both endpoints must be
--    settled.
--
-- `usable` is published rather than applied, so a consumer can state its
-- denominator instead of silently reporting a shorter series.

create or replace view public.vw_book_realised_returns as
with curve as (
  select (pec.ts at time zone 'America/New_York')::date as session_date,
         pec.equity,
         pec.data_quality
    from public.portfolio_equity_curve pec
   where pec.equity > 0
),
lagged as (
  select c.session_date,
         c.equity,
         c.data_quality,
         lag(c.equity)       over (order by c.session_date) as prev_equity,
         lag(c.data_quality) over (order by c.session_date) as prev_data_quality,
         lag(c.session_date) over (order by c.session_date) as prev_session_date
    from curve c
)
select l.session_date,
       l.prev_session_date,
       l.equity,
       l.prev_equity,
       ln(l.equity / l.prev_equity)                                       as log_return,
       (l.data_quality = 'settled' and l.prev_data_quality = 'settled')   as usable,
       l.data_quality,
       l.prev_data_quality
  from lagged l
 where l.prev_equity is not null;

comment on view public.vw_book_realised_returns is
  'Daily log return of the book from portfolio_equity_curve, dated on the New York session and never on the UTC cast. `usable` is false whenever EITHER endpoint is a stale_snapshot -- the return out of a carried level is as fabricated as the return into it (C1, 2026-09-09).';
comment on column public.vw_book_realised_returns.usable is
  'Both endpoints settled. Filter on this for any return computation; read the false rows to say what was withheld.';
