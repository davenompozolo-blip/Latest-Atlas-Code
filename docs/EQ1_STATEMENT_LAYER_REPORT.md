# EQ-1 · The persisted multi-year statement layer

**2026-09-22.** The Equity Research module's forensics, capital-allocation and
ratio panels were not broken in five places. They were broken in one: **the
platform held no multi-year financial statements at all.** This unit builds
that layer and proves every dead panel becomes computable from it.

---

## 1. The diagnosis

| measured | result |
|---|---|
| symbols in `equity_cache` | 913 |
| with any `financials` key | **19** |
| with a non-empty `yearly` array | **0** (`max_years = 0`) |
| what `financials.quarterly` actually held | EPS surprise `{actual, estimate, quarter}` |

`equity_fundamentals_derived` — the table those panels read — holds **38 rows,
last written 2026-08-11**, and **nothing in the repository writes it**. Grepped
across `api/`, `src/`, `scripts/`, `supabase/`: readers and the original
migration only. Inside it: `beneish 0/38`, `ccc_days 0/38`, `reinvest_rate
0/38`, `div_coverage 0/38`, `altman_model='full' 0/38`.

That is every blank cell in the screenshots, from one cause. Piotroski scored
0/9 because eight of its nine tests are year-over-year comparisons and there
was no prior year.

**No new vendor was needed.** `api/equity.js:584` already calls Finnhub
`/stock/financials-reported?freq=annual` — the full XBRL 10-K — and then:

```js
annuals.sort(...); var latest = annuals[0];   // every prior year discarded
```

## 2. Source, chosen on measurement

Alpha Vantage's normalised statements, because GAAP/IFRS-mapped fields make a
CFA-style ratio framework computable without per-filer concept matching (the
Finnhub path needs a fuzzy `concept(items, tags)` matcher for exactly that
reason). Measured on TGT: **20 annual periods, FY2007–FY2026, and 81 quarters
on all three statements.**

Field reliability was **measured across all 20 annual periods**, not assumed,
because it decides what can be published — 16 of 26 income-statement fields and
13 of 30 cash-flow fields are complete on all 20.

Two traps that shaped the schema:

1. **`researchAndDevelopment` is 0/20 — and that is correct.** A retailer has
   no R&D line. NULL means *not reported*, never zero.
2. **`paymentsForRepurchaseOfCommonStock` is 0/20 while
   `proceedsFromRepurchaseOfEquity` is 20/20.** The buybacks are there, under
   the field whose name reads like the opposite. Reading the obvious column
   would report no buyback programme for a company that has run one for
   twenty years.

The dead cash-flow working-capital fields (`changeInOperatingAssets` /
`changeInOperatingLiabilities` at 0/20) are why FCFF takes ΔWC from **balance
sheet deltas**. That is the better derivation anyway; here it is also the only
available one.

## 3. Proof — every dead panel, computed from the layer

TGT FY2026, from the loaded data:

| | on screen before | computed now |
|---|---|---|
| Piotroski F | **0 / 9**, eight rows blank | **6 / 9**, all nine tests resolving |
| Altman Z | "20.0 — partial estimate, X3+X4 only" | **3.24**, full five components |
| Beneish M | "N/A — multi-year income statement required" | inputs present |
| Cash conversion cycle | "available after sync_fundamentals" | **4.8 days** (DIO 59.5 / DSO 6.3 / DPO 61.0) |
| FCFF | absent | **$3.197bn** at a 22.28% effective tax rate |
| FCF (CFO − capex) | absent | **$2.835bn** |
| Dividend coverage | em dash | **72.4% of FCF** |
| Buyback yield | 2.8%, unsourced | **0.57%** measured |

**The CCC is the tell that this is real arithmetic and not a fetched number.**
A big-box retailer turning inventory in 59.5 days while paying suppliers in
61.0 means working capital is almost exactly self-funding — textbook Target,
and it falls out of the data rather than being asserted.

The Piotroski failures are correct too: ROA fell (net income 4,091 → 3,705),
gross margin slipped (28.2% → 27.9%), asset turnover fell. A 6 is the right
answer, which is the point — the old 0 was an artefact of missing history.

## 4. What shipped

- **Three typed tables** keyed `(symbol, fiscal_date_ending, period, source)`.
  Every component comes from the filing, so the key survives recomputation —
  the test this codebase applies before reusing an upsert key. `source` is in
  the key so a second vendor can coexist and be **reconciled** rather than
  silently overwrite, the way `atlas_check_feed_reconciliation` already treats
  two price providers.
- **`api/sync-financials.js`** — the loader, with `sync_log` from row one.
- **8 tests**, run against the real vendor payloads.

### The rate-limit shape is the dangerous one

Alpha Vantage signals a throttle with **HTTP 200** and a `Note` /
`Information` key. A loader that only looks for `annualReports` parses
nothing, writes nothing, and closes `success` — the *no-op answers 200* defect
this codebase has recorded three times, and indistinguishable from a company
with no filings. It is detected explicitly, is terminal for the run, and is
recorded as `details.rate_limited`. A bad symbol (`Error Message`) is
deliberately **not** treated as a throttle, so one bad ticker cannot abandon
the run.

## 5. Two defects caught by trying rather than reading

**`sync_log` has no `rows_upserted` column.** It carries
`positions_/transactions_/prices_upserted` and nothing generic. Inventing a
column name makes PostgREST reject the **entire** PATCH exactly as
`duration_ms` does — which is how 41 rows sat open in `running` for three
months. Caught against `information_schema` *before* the first run; the count
lives in `details`.

**Postgres truncated a column name and `CREATE TABLE` still succeeded.**
`proceeds_from_issuance_of_long_term_debt_and_capital_securities_net` is 67
characters against a 63-character limit. The server cut it, emitted a NOTICE,
and created the table. The file said one thing, the database held another, and
**both were internally consistent** — the divergence was invisible from either
artefact. It surfaced only when the first INSERT named the column the file
declares and got `42703`. Fixed by rename (`20260922061709`).

*Check identifier length before applying. Over-length names do not error.*

## 6. State and what is next

`company_*` tables hold **TGT, 20 annual periods, all three statements** —
loaded to prove the stack end-to-end. All three migration files hash-identical
to `supabase_migrations.schema_migrations`.

**The schema was applied twice** (`20260922055502`, `20260922055734`); the
second is a no-op under `IF NOT EXISTS`. Both ledger rows are kept with
matching files rather than rewriting history — a clean replay converges
correctly (create → no-op → rename).

### Open, and needing a decision

**Throughput is unresolved and it bounds coverage.** Alpha Vantage free tier is
25 requests/day against 3 requests per symbol — roughly 8 symbols/day, or ~114
days for the 913-symbol universe. The production key's tier is unverified from
this container (no key in env; `CLAUDE.md` records `HISTORICAL_OPTIONS`
returning "This is a premium endpoint", which implies free). The loader is
built to survive either: it paces, budgets, skips inside `refresh_days`, and
stops cleanly when told to.

Paths, in preference order: confirm the key's tier; if free, either upgrade
(AV premium is 75 req/min, making a full pass ~37 minutes) or make Finnhub the
breadth writer — it is 60/min with no daily cap and is already wired — with AV
reserved for the held book and searched names. **Finnhub's year-depth is the
one load-bearing assumption still unmeasured**, and it needs a key to settle.

Not yet built: the nightly `cron.job` entry, deliberately. Scheduling a loader
before its throughput is known would burn the daily cap on the same head of
the list every night.
