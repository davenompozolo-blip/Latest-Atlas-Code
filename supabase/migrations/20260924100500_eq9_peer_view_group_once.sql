-- EQ-9b · The peer cohort is grouped ONCE, not re-scanned per output row.
--
-- `vw_company_fundamental_peers` measured **6,938 ms symbol-filtered** against
-- anon's 3,000 ms cap, so it failed on EVERY browser call. It is read in the
-- same `Promise.all` as the statements, so it took the whole Equity Research
-- statement layer down with it and the page reported "Statements for AAPL are
-- not loaded" and "The statement feed did not answer" — a 57014 cancellation
-- rendering as a statement about the data, for the fifth time in this codebase.
--
-- CLAUDE.md flagged this view in EQ-2 as "trivial at ten symbols ... has not
-- been measured at scale". EQ-8a took the statement layer from 10 symbols to
-- 62 and it crossed the cap. A growth-linked node is a clock, not a constant.
--
-- THE COST IS NOT THE COHORT, IT IS RE-DERIVING IT PER ROW. `long` holds the
-- whole universe (46,159 rows: every symbol x 31 metrics x every year) because
-- a peer median needs the cohort, and the symbol filter can only be applied
-- after it. The per-row LATERAL then scanned that entire CTE once for each of
-- AAPL's 589 output rows — 27.2M rows filtered, `temp read=286,356` blocks
-- spilling to disk — to select the ~9 cohort members each time.
--
-- Grouping the cohort once and carrying it as ordered arrays makes the lateral
-- unnest ~9 elements instead of scanning 46,159 rows. Same lesson as the
-- exclusion identity in `mv_book_ex_index`: computing "the set without member
-- i" for every i costs one pass, not n.
--
-- SEMANTICS ARE UNCHANGED AND PROVEN SO BY `EXCEPT ALL` BOTH WAYS:
--   * the company is still EXCLUDED from its own peer group (`u.s <> l.symbol`),
--   * `peer_count` still counts only peers with a MEASURED value for that
--     metric (the array is built `WHERE value IS NOT NULL`), never cohort size,
--   * `n_below` is still strictly-below-and-excluding-subject, the form that
--     replaced the `RANGE ... 1 PRECEDING` value offset,
--   * NULL sector still forms its own cohort (`IS NOT DISTINCT FROM`).
do $mig$
declare
    v_def  text;
    v_head text;
    v_cut  int;
begin
    v_def := pg_get_viewdef('public.vw_company_fundamental_peers'::regclass, true);

    -- Keep the `f` and `long` CTEs verbatim; replace only the final SELECT.
    v_cut := position('
 SELECT l.symbol,' in v_def);
    if v_cut < 1 then
        raise exception 'EQ-9b: could not find the final SELECT of the peer view';
    end if;
    -- THE ANCHOR MUST DISTINGUISH PATCHED FROM UNPATCHED. A first version
    -- asserted `position('LEFT JOIN LATERAL' in v_def) >= 1`, which the
    -- REPLACEMENT text also satisfies -- so the guard could never fire, and a
    -- re-run was stopped only by Postgres rejecting the duplicate `grp` CTE
    -- name. Luck, not design: this file's own recurring "gate that can never
    -- pass", inverted into a gate that can never fire. Assert on what only the
    -- OLD body contains, and refuse outright if the new one is already there.
    if position('FROM long o' in v_def) < 1 then
        raise exception 'EQ-9b: expected the per-row LATERAL over `long` that this migration replaces';
    end if;
    if position(', grp AS (' in v_def) > 0 then
        raise exception 'EQ-9b: the grp CTE is already present -- this migration has been applied';
    end if;
    v_head := substr(v_def, 1, v_cut - 1);

    execute 'create or replace view public.vw_company_fundamental_peers as '
        || v_head || ', grp AS (
         SELECT long.metric,
            long.period,
            long.aligned_year,
            long.statement_profile,
            long.sector,
            array_agg(long.value ORDER BY long.value) AS vals,
            array_agg(long.symbol ORDER BY long.value) AS syms
           FROM long
          WHERE long.value IS NOT NULL
          GROUP BY long.metric, long.period, long.aligned_year, long.statement_profile, long.sector
        )
 SELECT l.symbol,
    l.period,
    l.fiscal_date_ending,
    l.fiscal_year,
    l.aligned_year,
    l.sector,
    l.statement_profile,
    l.metric,
    l.value,
    ''sector:''::text || COALESCE(l.sector, ''unknown''::text) AS peer_group,
    p.peer_median,
    p.peer_p25,
    p.peer_p75,
    p.peer_min,
    p.peer_max,
    p.peer_count,
    p.peer_symbols,
        CASE
            WHEN l.value IS NOT NULL AND p.peer_count > 0 THEN p.n_below::numeric / p.peer_count::numeric
            ELSE NULL::numeric
        END AS peer_percentile,
        CASE
            WHEN l.value IS NOT NULL AND p.peer_median IS NOT NULL THEN l.value - p.peer_median
            ELSE NULL::numeric
        END AS vs_peer_median
   FROM long l
     LEFT JOIN grp g ON g.metric = l.metric AND g.period = l.period AND g.aligned_year = l.aligned_year
                    AND g.statement_profile = l.statement_profile
                    AND NOT g.sector IS DISTINCT FROM l.sector
     LEFT JOIN LATERAL ( SELECT percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (u.v::double precision))::numeric AS peer_median,
            percentile_cont(0.25::double precision) WITHIN GROUP (ORDER BY (u.v::double precision))::numeric AS peer_p25,
            percentile_cont(0.75::double precision) WITHIN GROUP (ORDER BY (u.v::double precision))::numeric AS peer_p75,
            min(u.v) AS peer_min,
            max(u.v) AS peer_max,
            count(*) AS peer_count,
            array_agg(u.s ORDER BY u.s) AS peer_symbols,
            count(*) FILTER (WHERE u.v < l.value) AS n_below
           FROM unnest(g.vals, g.syms) u(v, s)
          WHERE u.s <> l.symbol) p ON true;';
end
$mig$;
