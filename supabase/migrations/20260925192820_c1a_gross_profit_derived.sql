-- C-1a: gross profit derived from revenue - cost of revenue when the filer
-- reports both but no GrossProfit line.
--
-- EDGAR filers such as PG, AMZN, ABBV, BMY and GILD tag revenue and cost of
-- revenue but not GrossProfit, so gross_profit and gross_margin were NULL on
-- 158 operating rows. That blanked gross margin in Equity Research and removed
-- one of the nine Piotroski tests, so no complete F-Score could form.
--
-- Measured before applying: where a filer reports all three, revenue - cost
-- agrees with the reported line on 1,072 of 1,076 rows within 0.5%. The four
-- misses are BKR 2016-17 (cost of goods tagged apart from cost of services),
-- one JPM year (a bank, gated below) and NKE 2011.
--
-- A reported figure always wins. Financials are never derived: a bank has no
-- cost of goods and gross_margin is already NULL for them.
-- `gross_profit_reported` is appended so a consumer can tell a reported figure
-- from a derived one.
--
-- Text patch against the live definition; each anchor must match exactly once
-- and a re-run is refused.
do $$
declare
  v_def text := pg_get_viewdef('public.vw_company_fundamentals'::regclass, true);
  v_pairs text[][] := array[
    array[E'            i.gross_profit,\n            i.operating_income,',
          E'            COALESCE(i.gross_profit,\n                CASE\n                    WHEN COALESCE(s.sector, ''''::text) !~~* ''%financ%''::text THEN i.total_revenue - COALESCE(i.cost_of_revenue, i.cost_of_goods_and_services_sold)\n                    ELSE NULL::numeric\n                END) AS gross_profit,\n            i.gross_profit IS NOT NULL AS gross_profit_reported,\n            i.operating_income,'],
    array[E'            base.gross_profit,\n            base.operating_income,',
          E'            base.gross_profit,\n            base.gross_profit_reported,\n            base.operating_income,'],
    array[E'            lagged.gross_profit,\n            lagged.operating_income,',
          E'            lagged.gross_profit,\n            lagged.gross_profit_reported,\n            lagged.operating_income,'],
    array[E'    pr_gross_profit,\n    pr_cogs\n   FROM calc;',
          E'    pr_gross_profit,\n    pr_cogs,\n    gross_profit_reported\n   FROM calc;']
  ];
  i int;
  v_n int;
begin
  if position('gross_profit_reported' in v_def) > 0 then
    raise exception 'C-1a already applied: vw_company_fundamentals carries gross_profit_reported';
  end if;
  for i in 1 .. array_length(v_pairs, 1) loop
    v_n := (length(v_def) - length(replace(v_def, v_pairs[i][1], ''))) / length(v_pairs[i][1]);
    if v_n <> 1 then
      raise exception 'C-1a anchor % matched % times, expected 1', i, v_n;
    end if;
    v_def := replace(v_def, v_pairs[i][1], v_pairs[i][2]);
  end loop;
  execute 'create or replace view public.vw_company_fundamentals as ' || v_def;
end
$$;
