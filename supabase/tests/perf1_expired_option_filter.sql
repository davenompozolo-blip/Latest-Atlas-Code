-- PERF-1: vw_performance_suite must drop an expired contract whatever its
-- stored class. `assets` carries contracts as both 'option' and 'us_option';
-- the old filter tested equality with 'option' and let a 'us_option' through.
--
-- Forces the case the filter exists for: an expired us_option contract
-- (GDX260320P00098000, expired 2026-03-20) placed in the original account's
-- current snapshot. Before PERF-1 it appeared in the view; after, it must not.
--
-- Run as ONE batch (psql -1, or the management API's database/query, which
-- runs the whole text in one transaction). A client that commits per
-- statement would leave the inserted position row behind.

begin;
select set_config('request.headers',
    json_build_object('x-atlas-portfolio', 'e11b0e63-8edf-48b4-a57f-583f24c0a1c8')::text, true);

insert into positions (portfolio_id, asset_id, quantity, average_cost, market_value, as_of_date, side)
select 'e11b0e63-8edf-48b4-a57f-583f24c0a1c8', a.id, -1, 5, -50,
       (select max(as_of_date) from positions
         where portfolio_id = 'e11b0e63-8edf-48b4-a57f-583f24c0a1c8'), 'short'
  from assets a where a.symbol = 'GDX260320P00098000' and a.asset_class = 'us_option';

select check_name, ok from (values
  ('fixture present: the forced row exists (a vacuous test passes trivially)',
     exists (select 1 from positions p join assets a on a.id = p.asset_id
              where a.symbol = 'GDX260320P00098000'
                and p.as_of_date = (select max(as_of_date) from positions
                                     where portfolio_id = 'e11b0e63-8edf-48b4-a57f-583f24c0a1c8'))),
  ('an expired us_option contract is excluded',
     not exists (select 1 from vw_performance_suite where symbol = 'GDX260320P00098000')),
  ('the rest of the book still publishes',
     (select count(*) from vw_performance_suite) > 0)
) t(check_name, ok);

rollback;
