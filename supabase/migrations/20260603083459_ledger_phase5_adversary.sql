create table if not exists ledger_alerts (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  alert_type   text not null,
  severity     text not null,
  horizon_days int,
  detail       text not null,
  metric_value numeric,
  threshold    numeric,
  alert_key    text unique,
  acknowledged bool not null default false
);
create index if not exists idx_la_created on ledger_alerts(created_at desc);
create index if not exists idx_la_type    on ledger_alerts(alert_type);
alter table ledger_alerts enable row level security;
do $$ begin create policy la_anon_read on ledger_alerts for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin create policy la_service_all on ledger_alerts for all using (auth.role() = 'service_role');
exception when duplicate_object then null; end $$;
do $$ begin create policy la_anon_insert on ledger_alerts for insert with check (true);
exception when duplicate_object then null; end $$;

create or replace function insert_ledger_alerts()
returns integer language plpgsql as $$
declare n int := 0; month_key text := to_char(now(), 'YYYY-MM');
begin
  insert into ledger_alerts (alert_type, severity, detail, metric_value, threshold, alert_key)
  select 'integrity', 'critical',
    'Chain integrity broken: ' || broken_links || ' broken links, ' || tampered_rows || ' tampered rows.',
    broken_links + tampered_rows, 0, 'integrity|' || month_key
  from vw_ledger_integrity where (broken_links + tampered_rows) > 0
  on conflict (alert_key) do nothing;

  insert into ledger_alerts (alert_type, severity, horizon_days, detail, metric_value, threshold, alert_key)
  select 'drift', case when mom_delta > 0.10 then 'critical' else 'warn' end,
    horizon_days,
    'Brier score rose ' || round(mom_delta::numeric,3) || ' MoM at ' || horizon_days || 'd horizon (now ' || round(brier_score::numeric,3) || ')',
    brier_score, brier_score - mom_delta, 'drift|' || horizon_days || '|' || month_key
  from (
    select horizon_days, brier_score,
      brier_score - lag(brier_score) over (partition by horizon_days order by month) as mom_delta
    from vw_brier_trend
  ) x where mom_delta > 0.05
  on conflict (alert_key) do nothing;

  insert into ledger_alerts (alert_type, severity, horizon_days, detail, metric_value, threshold, alert_key)
  select 'overconfidence', case when cnt >= 5 then 'critical' else 'warn' end,
    horizon_days,
    cnt || ' of 10 conviction bins are over-confident at ' || horizon_days || 'd horizon',
    cnt, 3, 'overconfidence|' || horizon_days || '|' || month_key
  from (select horizon_days, count(*) cnt from vw_calibration where calibration_flag='over-confident' group by horizon_days) x
  where cnt > 3
  on conflict (alert_key) do nothing;

  return n;
end $$;

select insert_ledger_alerts();

create or replace view vw_adversary as
with
contrarian as (
  select 'contrarian'::text as lens, d.symbol, d.intent as stated_intent,
    case d.intent when 'add' then 'exit' when 'exit' then 'add' when 'trim' then 'add' else 'trim' end as flipped_intent,
    round(avg(o.alpha)*100::numeric,2) as stated_alpha_pct,
    round(-avg(o.alpha)*100::numeric,2) as flipped_alpha_pct,
    round(avg(d.conviction)::numeric,0) as avg_conviction,
    count(*) as n, null::numeric as alpha_per_conviction_pt
  from decisions d join decision_outcomes o on o.decision_id=d.id
  where o.horizon_days=30 and o.correct is not null and d.conviction is not null
  group by d.symbol, d.intent having count(*) >= 2
),
rfw as (
  select 'right_wrong_reasons'::text as lens, d.symbol, d.intent as stated_intent,
    null::text as flipped_intent,
    round(avg(o.alpha)*100::numeric,2) as stated_alpha_pct,
    null::numeric as flipped_alpha_pct,
    round(avg(d.conviction)::numeric,0) as avg_conviction,
    count(*) as n,
    round((avg(o.alpha)*100/nullif(avg(d.conviction),0))::numeric,4) as alpha_per_conviction_pt
  from decisions d join decision_outcomes o on o.decision_id=d.id
  where o.horizon_days=30 and o.correct=true and d.conviction>=60
  group by d.symbol, d.intent
  having avg(o.alpha) between 0 and 0.03 and count(*) >= 1
)
select * from contrarian
union all
select * from rfw
order by lens, flipped_alpha_pct desc nulls last;
