-- ============================================================
-- `fwd_pe` was a TRAILING P/E under a forward label
-- ------------------------------------------------------------
-- The `fwd_pe` audit, resolved. The column was never computed from estimates
-- and never came from a forward-earnings engine — it was a direct pull of the
-- wrong field.
--
-- Chain as found:
--
--   Nexus "Fwd P/E" column
--     └─ vw_nexus_holdings.fwd_pe
--         └─ mv_nexus_holdings:  round(f.pe_ratio, 1) AS fwd_pe
--             └─ equity_cache.payload->'overview'->>'PERatio'
--
-- `PERatio` in Alpha Vantage's OVERVIEW is the TRAILING twelve-month P/E. AV
-- exposes `ForwardPE` as a separate field, but the cached overview payload is
-- trimmed to 9 keys and never carried it, so the correct figure was not even
-- available on that path.
--
-- The thing it was measured against, however, is real:
--
--   vw_nexus_holdings.market_fwd_pe
--     └─ median(equity_screener_universe.forward_pe)
--         └─ payload->'metric'->>'forwardPE'        (Finnhub)
--
-- So `fwd_pe_premium_pct = fwd_pe / market_fwd_pe - 1` divided a trailing P/E
-- by a forward median, ACROSS TWO VENDORS. Forward sits structurally below
-- trailing, so the premium was inflated by construction — on the same
-- universe the trailing median is 22.07 against a forward median of 15.83.
--
-- ## What it did to the book
--
-- Average published premium **+186.5%** against a like-for-like **+37.9%**.
-- Four names were not merely exaggerated but INVERTED — reported as expensive
-- against the market while actually cheap on forward earnings:
--
--   | symbol | shown (trailing) | forward | old premium | new premium |
--   |--------|-----------------:|--------:|------------:|------------:|
--   | MU     |            127.3 |     5.9 |     +704.4% |      −62.7% |
--   | SNDK   |             19.8 |     6.5 |      +25.1% |      −58.9% |
--   | HAL    |             24.5 |    12.0 |      +54.8% |      −24.2% |
--   | PFE    |             21.0 |     8.6 |      +32.7% |      −45.7% |
--
-- TSLA (+2136% → +822%), AMD (+985% → +177%), NVDA (+186% → +14%) and ABBV
-- (+591% → +6%) keep their sign and lose most of their magnitude.
--
-- ## Why the fix lands on the view and not the matview
--
-- `vw_nexus_holdings` is the ONLY object in the database that references
-- `fwd_pe`. Checked against `pg_depend` rather than assumed: the five other
-- dependants of `mv_nexus_holdings` — `vw_bench_contribution`,
-- `vw_bench_docket`, `vw_nexus_price_freshness`, `vw_sleeve_headroom`,
-- `vw_unclassified_holdings` — none of them read it. So `CREATE OR REPLACE
-- VIEW` reaches every consumer, and a `DROP MATERIALIZED VIEW ... CASCADE`
-- rebuild of six objects is avoided.
--
-- `mv_nexus_holdings.fwd_pe` therefore KEEPS its misnomer, now read by
-- nothing. Renaming it requires that cascade; this migration deliberately
-- does not, and CLAUDE.md records it so the next reader does not consume it
-- believing it forward.
--
-- ## How it was proven before applying
--
-- Patched textually against `pg_get_viewdef` so the remaining ~4.2k
-- characters of the definition stay byte-identical, with both anchors
-- asserted to match exactly once. Built as a shadow view first:
--
--   * column names, order and types identical — zero mismatches over the
--     whole column list (`CREATE OR REPLACE VIEW` cannot reorder or retype,
--     so this had to hold before applying, not after)
--   * 61 rows in, 61 rows out; the same 39 rows carry a P/E
--   * `equity_screener_universe` has no duplicate symbols, so the new join
--     cannot multiply rows — checked, not assumed
--   * read cost 40 ms → 51 ms against `anon`'s 3,000 ms cap
--
-- Guarded on the definition not already carrying `esu.forward_pe`, so a
-- re-run is a no-op rather than a double patch.
-- ============================================================

DO $patch$
DECLARE
  src text; out_s text;
  a_old text := E'            m.fwd_pe,\n';
  a_new text := E'            round(esu.forward_pe, 1) AS fwd_pe,\n';
  b_old text := E'             LEFT JOIN vol v ON v.symbol = m.symbol\n';
  b_new text := E'             LEFT JOIN vol v ON v.symbol = m.symbol\n             LEFT JOIN equity_screener_universe esu ON esu.symbol = m.symbol\n';
BEGIN
  src := pg_get_viewdef('public.vw_nexus_holdings'::regclass, true);

  IF position('esu.forward_pe' in src) > 0 THEN
      RAISE NOTICE 'vw_nexus_holdings already reads the forward P/E; nothing to patch';
      RETURN;
  END IF;

  IF (length(src)-length(replace(src,a_old,'')))/length(a_old) <> 1 THEN
      RAISE EXCEPTION 'anchor A (m.fwd_pe in w CTE) matched % times, expected 1',
            (length(src)-length(replace(src,a_old,'')))/length(a_old); END IF;
  IF (length(src)-length(replace(src,b_old,'')))/length(b_old) <> 1 THEN
      RAISE EXCEPTION 'anchor B (vol join) matched % times, expected 1',
            (length(src)-length(replace(src,b_old,'')))/length(b_old); END IF;

  out_s := replace(replace(src, a_old, a_new), b_old, b_new);
  IF out_s = src THEN RAISE EXCEPTION 'patch produced no change'; END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.vw_nexus_holdings AS ' || out_s;
END
$patch$;

DROP VIEW IF EXISTS public.zz_fwdfix_shadow;

COMMENT ON VIEW public.vw_nexus_holdings IS
    'Nexus holdings feed. NOTE: fwd_pe is a genuine FORWARD P/E, read from '
    'equity_screener_universe.forward_pe (Finnhub metric.forwardPE) -- the same '
    'source as the market_fwd_pe median it is compared against, so the premium '
    'is like-for-like. It is deliberately NOT mv_nexus_holdings.fwd_pe, which '
    'is Alpha Vantage OVERVIEW.PERatio (trailing) under a forward name and is '
    'read by nothing.';
