# EQ-2 — Derived fundamentals, peer medians, and two loader defects

The second unit of the Equity Research rebuild. EQ-1 persisted the three
statements; this turns them into the CFA ratio framework, FCFF/FCFE and a peer
comparison computed from real filings. No UI yet.

## What was built

| object | what it is |
|---|---|
| `vw_company_fundamentals` | ~70 columns of ratios, cash flow and growth per symbol/period |
| `vw_company_fundamental_peers` | long-format peer medians, quartiles and percentile, per metric |
| `vw_company_statement_coverage` | what is actually loaded, per symbol, across the three statements |
| `atlas_fiscal_aligned_year(date)` | the one definition of which economic year a fiscal year-end describes |

`vw_company_fundamentals` is **8.4 ms** symbol-filtered, on the statement
indexes.

## Checked against EQ-1's independently computed TGT figures

EQ-1 computed TGT FY2026 by hand to prove the statement layer worked. Those
figures are a genuine regression test. Three reproduce exactly and four differ:

| | EQ-1 | view |
|---|---|---|
| effective tax rate | 22.28% | **22.28%** |
| dividend coverage of FCF | 72.4% | **72.4%** |
| free cash flow | $2,835.0m | **$2,835.0m** |
| FCFF | $3,197m | 3,180.9m |
| DIO / DSO / DPO | 59.5 / 6.3 / 61.0 | 60.5 / 5.8 / 62.1 |

**Both differences are input choices, not errors, and both were run to ground
rather than waved through.**

*FCFF.* The reported `interest_expense` is $445m. The view takes the CFO-based
definition — `CFO + interest x (1 - t) - capex` — giving
`2835.0 + 445 x 0.7772 = 3,180.9`. EQ-1's figure implies the net-income-based
reconstruction, and the $16m gap is the non-cash items that formulation has to
enumerate and misses. CFO-based is preferred wherever CFO is reported, because
it captures every non-cash item the filer actually disclosed instead of a list
someone chose.

*Days ratios.* EQ-1's 59.5 / 6.3 / 61.0 reproduce **exactly** from ending
balances. The view uses **average** balances, the CFA convention for matching a
flow to a stock. That is why the oldest period of every symbol carries NULL for
them — there is no prior balance to average against, and a half-computed ratio
is worse than an absent one.

## Two defects in the view, found by reading its output

**A financial published figures that are arithmetically correct and
economically meaningless.** JPM FY2025: FCFF **-$70,850m**, interest coverage
**0.74**, current ratio **14.85**, all from a straight reading of the
statements. A bank has no operating cycle, its interest expense is a cost of
revenue rather than a leverage signal, and CFO is not a free-cash-flow base.
**165 of the 913-symbol universe are Financials** — this would have been wrong
for 18% of the intended coverage, on the exact figures a user would most likely
quote.

`statement_profile` nulls those and keeps the ones that do hold: JPM still
publishes ROE 16.13% and D/E 1.38.

**CodeRabbit found the gate was incomplete, and was right.** `cash_conversion`
and `sloan_accrual_ratio` are also CFO-derived and were still published — JPM
was reporting a cash conversion of **−2.59** as an earnings-quality reading.
`gross_margin` and `ebitda_margin` went with them on the same reasoning one step
out: "gross profit" is not a line a bank reports, and the view already nulls
`debt_to_ebitda` and `net_debt_to_ebitda` because EBITDA is meaningless where
interest is operating — so publishing the margin built on that same aggregate
was the identical inconsistency. `asset_turnover`, `operating_margin` and
`net_margin` are kept: a bank's asset turnover is genuinely low (JPM 0.066
against TGT 1.787) rather than undefined.

**Nulling is the honest interim, not the end state.** A financial needs its own
framework — CAMELS for banks, and the separate P&C and life/health frameworks —
which is a unit of its own. See "What this cannot do yet" below. The discriminator is `assets.sector`, **100%
populated across all 913**, a classification the database already owns. An
interest-to-revenue threshold was considered and rejected — JPM separates
cleanly at 35.0% against <=4.3% for every other loaded name, but calibrating a
threshold on six symbols is the mistake this codebase keeps paying for.

**A company that pays no dividend had no sustainable growth rate at all.** AMD
pays none, Alpha Vantage omits the line, so `dividends_paid` was NULL,
`retention_ratio` was NULL and SGR was NULL — precisely the names where SGR is
wanted, and precisely the input the valuation module's SGR-above-WACC problem
needs.

I first fixed this by inferring zero: a parsed cash-flow row carrying no
dividend line was treated as a measurement of zero. **CodeRabbit challenged it
on PR #804 and was right; it is reverted.** The objection was that
`operating_cashflow is not null` proves one field parsed, not that the dividend
fields were complete. The data proves it twice over:

| | |
|---|---|
| GOOGL, no dividend 2013–2023 | explicit `0` for 2014–2017 and 2022–2023, **NULL for 2018–2021** |
| AMD, never paid a common dividend | **6,000,000 / 85,000,000 / 104,000,000** for 2019–2021, NULL for 2022–2025 |

The field is unreliable in **both** directions — NULL where zero is true, and
non-zero where no common dividend was paid — so absence cannot carry a claim
about what the company paid. The justification I originally gave ("AMD pays no
dividend") is contradicted by AMD's own rows.

The cost is accepted and stated: a genuine non-payer now has no retention ratio
and no SGR. An absent number beats a fabricated one, and SGR feeds valuation.
A reliable dividend source is its own unit. `dividend_line_reported` stays, and
now reports what the **vendor** did rather than asserting anything about the
company.

## Two defects in the EQ-1 loader, found by the join

**SNDK had an income statement and no balance sheet and no cash flow.** The
loader wrote each statement as it fetched, so the Alpha Vantage throttle broke
the run *between* calls and left the symbol half-written. EQ-1's own PR said a
run is terminal on a throttle "so a half-loaded symbol never exists". That was
false. It now fetches all three and writes afterwards, so a symbol is atomic
with respect to the interruption that actually happens.

**And the half-loaded symbol was sticky.** The loader's freshness check read
`company_income_statement` **alone**, so SNDK counted as loaded and would have
been skipped for the whole 30-day refresh window — permanently incomplete.
`vw_company_statement_coverage.is_complete` is now the single definition of
"loaded", read by the loader itself.

**The symbol was invisible, not merely wrong.** `vw_company_fundamentals`
inner-joins the three statements, so SNDK did not report itself incomplete — it
simply was not there. An absent symbol and an incomplete one are different
facts and the coverage view keeps them apart.

Both are asserted by source scanners in `src/lib/syncFinancials.test.mjs`, and
both were checked by reverting the fix and watching them fail (8 pass / 2 fail
on the pre-fix loader).

## The peer median is real, and says so when it is thin

Computed only from statements actually loaded. No default, no vendor composite,
no fallback.

- **The company is excluded from its own peer group.** A median containing the
  subject is not a benchmark, and with a small cohort the subject can *be* the
  median.
- **`peer_count` counts peers with a MEASURED value for that metric**, never the
  size of the sector cohort. A peer whose own figure is NULL is not evidence
  about where this company sits.
- **Grouped on `aligned_year`, not `fiscal_year`.** A retailer closing
  2026-01-31 and a tech filer closing 2025-12-31 describe the same economic
  year; grouping on fiscal year would compare them a full year apart. Verified:
  WMT (Jan-2026) and COST (May-2026) both land on 2025 and compare correctly.
- **Grouped on `statement_profile`**, so a bank is never medianed against an
  operating company whose ratios are not even defined the same way.
- **`peer_percentile` is NULL when the company has no measurement of its own.**
  A company that cannot be measured does not sit at the bottom of its peer
  group.

Working today on the loaded set: WMT against COST gives gross margin 24.93% vs
12.84%, ROE 22.97% vs 30.69%, CCC 3.22 vs 2.07 days — the genuine
Walmart/Costco relationship, off their own filings. TGT and JPM report
`peer_count = 0` rather than inventing a benchmark.

**`percentile_cont` has no numeric overload.** It coerced to double precision,
so the medians were published as float8 beside exact-numeric values. Not
cosmetic: float8 carries NaN and Infinity, and float NaN does *not* equal itself
while numeric NaN does — the asymmetry that let a sentinel walk through fifteen
CHECKs in the VaR-backtest work. The results are cast back, so every published
figure in this layer is numeric.

**A percentile over one peer is degenerate** — it can only be 0 or 1. The view
publishes `peer_count` beside it and the surface must state it; no threshold is
baked in, because the right floor is a display decision and depends on the
metric.

## Coverage bounds the peer quality, and that is a decision

The production Alpha Vantage key is **free tier, measured**: a run fired from
Postgres over pg_net stopped mid-batch on the vendor's own *"25 requests per
day"* message. Three calls per symbol means **~8 symbols/day, ~114 days** for
913.

Ten symbols are loaded (nine complete). The peer layer is correct and honest at
that size — it reports 0 peers rather than inventing one — but it is thin, and
it stays thin until either the key is upgraded or the Finnhub path is measured.
**Finnhub's year-depth remains the one load-bearing assumption unmeasured.**
Note that `compute_ticker_derived` asks Finnhub for 2 annual periods, which is a
choice in that function and not a statement about what Finnhub serves.

## Verification

- 487 tests pass across 62 files; `vite build` clean.
- All five EQ-2 migrations hash-verified against
  `supabase_migrations.schema_migrations`, normalised for comments and
  whitespace — the equivalence class Postgres's view parser works in.

## What this cannot do yet — the financial-institution framework

Nulling a bank's undefined ratios stops the module lying. It does not make the
module useful for the 165 Financials in the universe.

CFA Level II Volume 3, Learning Module 4 (*Analysis of Financial Institutions*)
sets out three frameworks, not one:

- **Banks — CAMELS**: Capital adequacy (CET1 / Tier 1 / total capital over
  risk-weighted assets), Asset quality, Management, Earnings, Liquidity,
  Sensitivity to market risk.
- **P&C insurers**: loss and loss-adjustment expense ratio (losses / net
  premiums **earned**), underwriting expense ratio (underwriting expense / net
  premiums **written** — note the denominators genuinely differ), combined
  ratio as their sum, combined ratio after policyholder dividends, and loss
  reserve development.
- **Life and health insurers**: their own profile, earnings, investment-return,
  liquidity and capitalisation measures.

**None of those inputs exist in the persisted statements.** Alpha Vantage's
normalised schema has no Tier 1 capital, no risk-weighted assets, no
non-performing loans, no allowance for loan losses, no net premiums earned or
written, and no loss reserves — normalisation is what makes a retailer and a
bank comparable in one schema, and it is also what discards every line item
these frameworks are built on.

Finnhub's `/stock/financials-reported` returns **as-reported XBRL**, where those
concepts survive. That is the same endpoint already wired in `api/equity.js`
(which fetches the full history and keeps `annuals[0]`), so the fallback source
and the financial-institution framework are the same piece of work, not two.
**Unmeasured and load-bearing:** Finnhub's year-depth, and whether its concept
coverage is consistent enough across filers to compute CAMELS without
per-filer concept mapping.

## Flagged, not fixed

- `vw_company_fundamental_peers` computes its peer cohort with a correlated
  lateral over the long form. At ten symbols this is trivial; at 913 symbols x
  31 metrics x 20 years it is a self-join over ~500k rows and will need
  materialising. **This has not been measured at scale and cannot be until
  coverage grows** — it is a growth-linked node, the shape this codebase calls a
  clock rather than a constant.
- Peer groups are sector-wide. Size, geography and business-model peers would be
  better and need a real peer source; Finnhub's `/stock/peers` is already
  fetched by `api/equity.js` and is not persisted.
