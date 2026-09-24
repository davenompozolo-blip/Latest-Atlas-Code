-- EQ-9a · Compute the source precedence ONCE per (symbol, period), not once per row.
--
-- EQ-8a's `20260924063000` resolved the EDGAR/Alpha Vantage duplicate by
-- putting a correlated scalar subquery in `base`'s WHERE clause. That is
-- correct and it is evaluated PER ROW: on a symbol-filtered read of
-- `vw_company_fundamentals` it ran 19 times for 19 rows, which is invisible
-- (4.7 ms). On `vw_company_fundamental_peers`, whose `long` CTE materialises
-- the WHOLE universe before the symbol filter is applied, it ran **1,615
-- times and cost 157,545 of the query's 163,745 buffers**.
--
-- This is the lesson this file already records twice, arriving a third time:
-- `atlas_counterfactual_frozen` re-derived one date per LATERAL invocation,
-- `vw_position_nav_daily` evaluated a scalar subquery once per REFERENCE, and
-- here it is once per ROW. Compute it once and hand it down.
--
-- The rewrite is a textual patch against the live definition with the anchor
-- asserted to match exactly once, the idiom this view family already uses
-- (20260811150000, 20260906083659, 20260921*). Re-dumping a body is what
-- produced the two file/database divergences recorded in CLAUDE.md; a patch
-- fails loudly against a different base instead of quietly replacing it.
do $mig$
declare
    v_def   text;
    v_old   text;
    v_new   text;
    v_hits  int;
begin
    v_def := pg_get_viewdef('public.vw_company_fundamentals'::regclass, true);

    v_old := 'LEFT JOIN sect s ON s.symbol = i.symbol
          WHERE i.source = (( SELECT p.source';
    select count(*) into v_hits from (select regexp_matches(v_def, regexp_replace(v_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), 'g')) z;
    if v_hits <> 1 then
        raise exception 'EQ-9a: expected exactly 1 precedence anchor, found %', v_hits;
    end if;

    -- Everything from the anchor to the end of the correlated subquery is
    -- replaced by an ordinary join to a grouped CTE. `src` picks the same
    -- source by the same ordering: deepest COMPLETE history (counted over the
    -- three-way join, never the income statement alone), EDGAR breaking ties.
    v_new := 'JOIN src ON src.symbol = i.symbol AND src.period = i.period AND src.source = i.source
             LEFT JOIN sect s ON s.symbol = i.symbol
          WHERE true';

    v_def := replace(
        v_def,
        v_old || '
                   FROM company_income_statement p
                     JOIN company_balance_sheet pb ON pb.symbol = p.symbol AND pb.fiscal_date_ending = p.fiscal_date_ending AND pb.period = p.period AND pb.source = p.source
                     JOIN company_cash_flow pc ON pc.symbol = p.symbol AND pc.fiscal_date_ending = p.fiscal_date_ending AND pc.period = p.period AND pc.source = p.source
                  WHERE p.symbol = i.symbol AND p.period = i.period
                  GROUP BY p.source
                  ORDER BY (count(*)) DESC, (
                        CASE p.source
                            WHEN ''edgar''::text THEN 0
                            WHEN ''alphavantage''::text THEN 1
                            WHEN ''finnhub''::text THEN 2
                            ELSE 3
                        END), p.source
                 LIMIT 1))',
        v_new);

    if position('WHERE i.source = ((' in v_def) > 0 then
        raise exception 'EQ-9a: the correlated precedence subquery survived the patch';
    end if;

    -- Prepend the CTE. `sect` is the first CTE in the live definition.
    v_hits := position(' WITH sect AS (' in v_def);
    if v_hits <> 1 then
        raise exception 'EQ-9a: expected the definition to open with the sect CTE';
    end if;

    v_def := ' WITH src AS (
         SELECT s.symbol, s.period, s.source
           FROM ( SELECT p.symbol, p.period, p.source,
                    row_number() OVER (
                        PARTITION BY p.symbol, p.period
                        ORDER BY count(*) DESC,
                                 CASE p.source
                                     WHEN ''edgar''::text THEN 0
                                     WHEN ''alphavantage''::text THEN 1
                                     WHEN ''finnhub''::text THEN 2
                                     ELSE 3
                                 END, p.source) AS rn
                   FROM company_income_statement p
                     JOIN company_balance_sheet pb ON pb.symbol = p.symbol AND pb.fiscal_date_ending = p.fiscal_date_ending AND pb.period = p.period AND pb.source = p.source
                     JOIN company_cash_flow pc ON pc.symbol = p.symbol AND pc.fiscal_date_ending = p.fiscal_date_ending AND pc.period = p.period AND pc.source = p.source
                  GROUP BY p.symbol, p.period, p.source) s
          WHERE s.rn = 1
        ), sect AS (' || substr(v_def, length(' WITH sect AS (') + 1);

    execute 'create or replace view public.vw_company_fundamentals as ' || v_def;
end
$mig$;
