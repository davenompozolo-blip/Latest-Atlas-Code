-- Keep mv_nexus_holdings fresh.
-- The entire Nexus book read (Flagship holdings + portfolio snapshot, the Theme
-- grid / rotation read / chefbar, etc.) is served from the materialized view
-- mv_nexus_holdings via vw_nexus_holdings. A materialized view is a frozen
-- snapshot — it only updates on REFRESH. The Alpaca price sync refreshes
-- positions every ~5 min but never refreshed the mv, and nothing else did, so
-- the book read could lag a full trading day (today's moves read like
-- yesterday) even though the live source (vw_portfolio_home) was current.
--
-- Schedule a 10-minute refresh via pg_cron so the snapshot tracks the live data.
-- refresh_nexus_holdings() is the project's existing refresh entry point.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'refresh-nexus-holdings') then
    perform cron.unschedule('refresh-nexus-holdings');
  end if;
end $$;

select cron.schedule('refresh-nexus-holdings', '*/10 * * * *', $$select refresh_nexus_holdings();$$);
