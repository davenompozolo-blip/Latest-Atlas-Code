# EQ-3 — what Finnhub's as-reported feed actually serves

Measured 2026-09-23 against **production** (`latest-atlas-code-o19a.vercel.app`),
runs `eq3f` and `eq3f2`, `sync_log` #50595 and its successor. Both carry
`details.base` and `details.run_tag`, which is how this run is known to be the
handler under test rather than a login page — see §5.

**The headline: Finnhub is not a replacement for Alpha Vantage. It is a
complement, and the split is not where the earlier reasoning assumed.**

---

## 1. The sparse-payload hypothesis is dead

EQ-3d added `periods_with_concepts` and `concepts_per_period` to separate three
candidate causes of the original MISS. The payload is **dense**:

| symbol | 10-K periods | periods carrying concepts | distinct concepts | concepts per period |
|---|---:|---:|---:|---|
| TGT | 16 | **16** | 261 | 64–96 |
| JPM | 15 | **15** | 307 | 108–118 |
| AAPL | 16 | **16** | 139 | — |

Every period carries concepts. Nothing is sparse.

**The cause was the namespace after all.** Every field resolves to the
`us-gaap_` underscore spelling — `us-gaap_Assets`, `us-gaap_NetIncomeLoss` —
and the original candidate lists were written in the bare local-name form. The
EQ-3b normalisation is what unlocked this; the EQ-3c correction (that the
namespace hypothesis was *untested*, not disproven) was right to reopen it.

A handful of tags come back **already stripped** (`CommonStockSharesOutstanding`,
`LongTermDebt`), so all three spellings genuinely occur and all three are
needed.

---

## 2. THE COVERAGE CLIFF: foreign filers get nothing

| symbol | filer | 10-K periods | concepts |
|---|---|---:|---:|
| TGT | US | 16 | 261 |
| JPM | US | 15 | 307 |
| AAPL | US | 16 | 139 |
| **ASML** | Netherlands | **0** | **0** |
| **TSM** | Taiwan | **0** | **0** |
| **SONY** | Japan | **0** | **0** |
| **ABEV** | Brazil | **0** | **0** |

**4 of 4 foreign filers return zero periods; 3 of 3 US filers return 15–16.**
`financials-reported` is a **SEC 10-K feed**. A foreign private issuer files a
20-F and is simply absent — not thin, absent. `forms` comes back `[]`, so the
vendor returned no rows at all rather than rows this probe's `10-K` filter
rejected.

This is not an edge case for this book:

| symbol | weight |
|---|---:|
| TSM | 3.82% |
| ASML | 3.00% |
| ABEV | 1.93% |
| ATAT | 1.93% |
| SONY | 1.89% |
| PBR | 1.47% |
| **total** | **14.04%** |

**14.04% of the book is foreign operating companies Finnhub cannot serve.**
(A further 5.75% — EWY, IXC, DFEV — are ETFs, which have no statements from any
vendor and are not a gap.)

Alpha Vantage *does* serve them: ASML returns 20 annual periods in EUR. So the
throughput problem and the coverage problem pull in opposite directions, and
neither vendor alone closes both.

---

## 3. Per-field coverage is uneven, and that rules out a drop-in swap

As-reported XBRL carries only what the filer tagged on the face of *that*
filing, and tagging practice changes over the years. TGT, 24 of 30 fields
matched, but:

| field | periods covered |
|---|---:|
| revenue, COGS, assets, equity, CFO, capex, SG&A, inventory, payables | **16/16** |
| `interest_expense` | 14/16 |
| `cashflow_from_investment` / `_financing` | 13/16 |
| `property_plant_equipment` | 11/16 |
| `operating_income` | 8/16 |
| **`net_income`** | **5/16** |
| `gross_profit` | 3/16 |
| `common_stock_shares_outstanding` | 2/16 |

**Net income present in 5 of 16 years is disqualifying on its own** for the
ratio layer: Piotroski, ROE, every margin and the whole return-on-capital
family rest on it. AV's normalised statements carry it in all 20.

`MISS` entirely for TGT: R&D (a retailer has none — correct), total liabilities,
cash, receivables, goodwill, long-term debt.

**So EQ-2's `vw_company_fundamentals` must stay on Alpha Vantage.** Re-pointing
it at Finnhub would trade a throughput problem for a coverage problem and lose
14% of the book as well.

---

## 4. WHAT FINNHUB UNIQUELY GIVES: the financial-institution concepts

This is the real prize, and it is the thing EQ-2 recorded as impossible.

EQ-2 concluded: *"none of their inputs exist in the persisted statements — no
Tier 1 capital, no risk-weighted assets, no NPLs, no allowance for loan
losses, no net premiums earned."* That is true of AV's **normalised** schema.
It is not true of Finnhub's as-reported payload. JPM, 7 of 21 institution
concepts, and six of them on **every period**:

| concept | tag | periods |
|---|---|---:|
| `net_interest_income` | `us-gaap_InterestIncomeExpenseNet` | **15/15** |
| `noninterest_income` | `us-gaap_NoninterestIncome` | **15/15** |
| `noninterest_expense` | `us-gaap_NoninterestExpense` | **15/15** |
| `deposits` | `us-gaap_Deposits` | **15/15** |
| `allowance_for_credit_losses` | `us-gaap_FinancingReceivableAllowanceForCreditLossExcludingAccruedInterest` | **15/15** |
| `provision_for_credit_losses` | `us-gaap_ProvisionForLoanLeaseAndOtherLosses` | 14/15 |
| `loans_and_leases` | `us-gaap_NotesReceivableNet` | 7/15 |

Still absent: **Tier 1 capital and risk-weighted assets**, which live in the
regulatory capital tables rather than the face statements. So CAMELS' **C** leg
is still not computable from this source; earnings quality (E), asset quality
(A) and liquidity (L) largely are.

**JPM's GAAP misses corroborate EQ-2's `statement_profile` from the vendor
side**: no cost of revenue, no gross profit, no inventory, no current
assets/liabilities — a bank does not report an operating cycle, exactly as the
ratio gate assumes. That gate was reasoned from the CFA framework; this is the
independent confirmation.

---

## 5. The instrument was nearly wrong, and that is part of the finding

Two things had to be fixed before this measurement could be trusted, and both
were found by review rather than by me:

1. **`details.base` / `run_tag`** (EQ-3c). Two earlier runs returned `200` with
   Vercel's deployment-protection **login page** and no `sync_log` row, so
   `ORDER BY id DESC` served the *previous* run's row and I reported it as a
   measurement. Both fields are asserted in this run: `base` is the production
   host, `run_tag` matches on both the response and the log row.

2. **The namespace collapse** (Codex, PR #808 → fixed in #809). `localName`
   dropped *any* prefix, so `ifrs-full:Assets` counted as the US-GAAP
   candidate. **ASML is an IFRS filer and is in this very sample.** As it
   happens ASML returns no rows at all, so no figure above is affected — but
   that is luck, not design, and the fix landed before the conclusions were
   drawn rather than after.

**A probe that cannot say which server answered it is not a measurement**, and
a matcher that launders one taxonomy into another reports coverage that does
not exist.

---

## 6. The answer

| | Alpha Vantage | Finnhub `financials-reported` |
|---|---|---|
| shape | normalised GAAP/IFRS | as-reported XBRL |
| depth | 20 annual / 81 quarterly | 15–16 annual |
| throughput | **25 req/day** (free tier, measured on two independent keys) | 60/min, no daily cap |
| foreign filers | **yes** (ASML: 20 periods, EUR) | **no — zero rows** |
| per-field consistency | complete across periods | uneven (TGT net income 5/16) |
| bank concepts | absent by normalisation | **present, 15/15** |

- **The ratio layer stays on Alpha Vantage.** Finnhub cannot feed it: uneven
  per-field coverage and no foreign filers.
- **EQ-4's financial-institution layer should be built on Finnhub**, which is
  the only source here carrying deposits, net interest income and the credit-loss
  allowance — and 165 of the 913-symbol universe are Financials, essentially all
  US-listed banks, which is exactly where Finnhub's coverage is strongest.
- **The throughput ceiling is unresolved and is a spend decision**, not an
  engineering one: both AV keys measured are free tier at 25 req/day ≈ 8
  symbols/day. Finnhub does not rescue it, because it cannot serve the ratio
  layer at all.

## 7. Not measured

- Whether a different Finnhub endpoint (`/stock/financials`, the normalised
  one) covers foreign filers. Only `financials-reported` was tested.
- Tier 1 / RWA from any source.
- Insurance concepts: `institution` matched 7 of 21 on a bank; the P&C and
  life/health legs of the list were not exercised, because no insurer was
  probed.
