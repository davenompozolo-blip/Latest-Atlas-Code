# EQ-4 · The financial-institution layer

Measured against production, 2026-09-23. Probe runs `eq4ins1`
(`sync_log` via `net._http_response` id 50321), plus a direct contract proof
against the live database.

The CFA L2 V3 LM4 frameworks — CAMELS for banks, and separate frameworks for
P&C and life/health insurers — need line items that Alpha Vantage's normalised
schema discards. EQ-3 established that Finnhub's as-reported feed carries the
bank lines. This unit establishes what it carries for insurers, and builds the
substrate.

---

## 1. The P&C and life/health legs had never been exercised

`INSTITUTION_CONCEPTS` shipped in EQ-3 with three groups. Only the CAMELS group
had ever met a filer. Eight insurers were probed: TRV, PGR and CB (P&C), MET,
PRU and AFL (life), UNH and HUM (health).

| symbol | periods | distinct concepts | institution fields matched |
|---|---:|---:|---:|
| CB  | 19 | 392 | 8 / 21 |
| PRU | 16 | 385 | 6 / 21 |
| AFL | 16 | 276 | 5 / 21 |
| MET | 16 | 472 | 5 / 21 |
| HUM | 16 | 263 | 5 / 21 |
| PGR | 16 | 288 | 4 / 21 |
| TRV | 16 | 251 | 4 / 21 |
| UNH | 16 | 264 | 4 / 21 |

Every one returns 16–19 annual 10-K periods with dense payloads. CB is Swiss-
domiciled and still files a 10-K, so it is covered; the 20-F cliff EQ-3 found is
about foreign **private issuers**, not about domicile.

### Per-field

| field | hits | note |
|---|---:|---|
| `premiums_earned_net` | 8/8 | |
| `losses_and_lae_incurred` | 8/8 | |
| `future_policy_benefits` | 6/8 | absent on PGR, TRV |
| `loss_reserves` | 5/8 | absent on AFL, MET, PRU |
| `underwriting_expense` | 5/8 | **matched to the wrong measure — see §3** |
| `loans_and_leases` | 3/8 | |
| `separate_account_assets` | 3/8 | |
| `deposits` | 1/8 | |
| `premiums_written_net` | 1/8 | |
| `provision_for_credit_losses` | 1/8 | |
| `policyholder_benefits` | 0/8 | |
| `net_interest_income`, `noninterest_income`, `noninterest_expense` | 0/8 | bank lines, correctly absent |
| `tier_one_capital`, `risk_weighted_assets`, `total_risk_based_capital`, `common_equity_tier_one` | 0/8 | CAMELS · C, absent on every filer probed |
| `allowance_for_credit_losses`, `nonaccrual_loans`, `net_charge_offs` | 0/8 | bank lines |

---

## 2. The framework discriminator comes out of the filing

`loss_reserves` misses exactly the three life names. `future_policy_benefits`
misses exactly the two pure P&C names. That is not a coverage gap — it is the
two business models reporting different liabilities, which is what the CFA
frameworks separate them on in the first place. A P&C filer carries claim and
claim-adjustment reserves; a life filer carries future policy benefits; a bank
carries deposits and net interest income and neither of the above.

**This matters because `assets.sector` cannot do the job.** Measured:

- `Other` covers **6,879 of 7,921** active rows in `assets`. The field is only
  meaningful inside the `equity_cache` cohort (942 symbols: 165 Financials,
  4 `Other`, 21 null).
- Inside the cohort, `Financials` mixes banks, insurers, asset managers and
  exchanges — 10 of the probe's insurer list carry it, alongside every bank.
- Health insurers sit under `Healthcare` (UNH, ELV, CI, HUM), correctly by
  GICS and uselessly for this purpose.

So the sector decides **who is worth fetching**. The filing decides **which
framework applies**. EQ-2 chose `assets.sector` for its `statement_profile`
gate, which asks a coarser question — *what kind of filer is this* — and the
field answers that reliably enough inside the cohort. This is a finer question
and needs a finer source.

---

## 3. Three fields are wrong or unavailable, and the combined ratio waits

**`underwriting_expense` is mapped to the wrong measure.** Its only candidate is
`DeferredPolicyAcquisitionCostAmortizationExpense` — amortisation of deferred
acquisition costs. The CFA definition (§13676) is *underwriting expenses,
including sales commissions and related employee expenses*. DAC amortisation is
a component of that, not the thing. Publishing an "underwriting expense ratio"
from it would be the `fwd_pe` defect again: **the label asserts a measure the
field does not carry.**

**`premiums_written_net` hits 1 of 8.** The CFA expense ratio's denominator is
net premiums *written*; the text notes (§13561, footnote 32) that Travelers
itself reports the ratio on net earned premiums, consistent with US GAAP. So
earned is the available denominator and the view must say which it used.

**`policyholder_benefits` hits 0 of 8.** The single candidate
(`PolicyholderBenefitsAndClaimsIncurredLifeAndAnnuity`) is not what these filers
tag.

**Consequence: the loss and LAE ratio is computable today and the combined ratio
is not.** Both terms of the loss ratio hit 8/8. The expense ratio has no sound
numerator yet, and combined ratio = loss ratio + expense ratio. An absent number
beats a fabricated one, so the P&C leg publishes the loss ratio and withholds
the combined ratio with a reason, until the tags are measured rather than
guessed.

**CAMELS · C is not computable from this source at all.** Tier 1 capital and
risk-weighted assets live in the regulatory capital tables, not the face
statements, and are absent on every filer probed — banks in EQ-3 and insurers
here. A, E and L largely are computable.

---

## 4. `conceptSearch` — why the mapping could not be fixed by reading

`sample_concepts` returns the first 40 tags in an arbitrary order. These filers
report 251–472 distinct concepts, so the line a framework needs is almost never
in that slice, and a candidate list written without seeing the rest is a guess.

`conceptSearch(reports, needle, limit)` returns every concept whose **tag or
label** carries a needle, with the number of periods it appears on, ranked by
coverage. Searching the **label** is the load-bearing half: the label is what a
human wrote in the filing, and the CFA framework names its lines the way a human
would, so a label search can find a tag that was never guessed. Searching the
tag alone can only find what you already thought of.

`periods` is on each hit for the same reason `periods_covered` is on a field
result: a tag used in one filing of sixteen is not a series, and defining a
ratio on a line the filer stopped reporting is how a chart goes flat without
anything looking wrong.

Exposed as `&concept_like=` on the probe, which still writes nothing.

---

## 5. `company_reported_lines` — long form, deliberately

The mapping from tag to field is exactly what is not yet known (§3). A wide
table has to decide at write time; a long table does not.

- A corrected mapping is a `CREATE OR REPLACE VIEW`. A mapped column would be a
  backfill. Same argument as `ratio_pairs`, where no ratio is stored and the
  legs are evaluated at query time so a pair can be re-specified.
- It removes a round trip that is otherwise structural: *"which tag does this
  filer use for claims incurred"* becomes a SQL query against this table rather
  than a code change, a deploy and a vendor call.

Volume is not a reason to filter at write time: 165 Financials × ~16 periods ×
~300 concepts ≈ 790k rows, against `price_history`'s ~500k. Filtering to an
allowlist of substrings would be a silent-wrongness risk for no real saving.

`taxonomy` is **NULL exactly when the concept is us-gaap in any of its three
spellings**, so `taxonomy is not null` is the foreign-filer test in one
predicate. Storing the raw prefix instead would give `'us-gaap'` for
`us-gaap:Assets` and NULL for the bare `Assets` the vendor sometimes already
strips, and then `taxonomy is distinct from 'us-gaap'` counts every bare tag as
foreign.

`unit` is stored. ASML files in EUR; a number without its unit compares a euro
to a dollar. Absent is NULL, never a defaulted `usd`.

---

## 6. The P0 found on the way: the statement upsert has never written a row

`atlas_upsert_company_statements` shipped in EQ-2 and threw on every call.

```
select atlas_upsert_company_statements(p_income := '[{...}]')
ERROR 23502: null value in column "loaded_at" ... violates not-null constraint
CONTEXT: insert into public.company_income_statement
         select * from jsonb_populate_recordset(...)
```

`insert into T select * from jsonb_populate_recordset(null::T, payload)` fills
**every** column of `T` from the payload, and a key the payload omits comes back
NULL rather than absent. `loaded_at` is `not null default now()` and `rowsFor()`
has never set it.

**The default is the trap.** A column with a default reads as optional; under
`select *` it is mandatory and unstated. The same payload succeeds through a
plain PostgREST POST, which applies the default for a key it is not sent, and
fails through the RPC — so the transactional wrapper added to make a symbol
atomic is the thing that broke it. EQ-3 recorded a backfill that "wrote nothing,
and that was the design working": the atomicity guard was real, and this would
have refused the write regardless.

The layer is frozen at what the earlier direct-POST path wrote — 845 / 828 / 828
rows across 10 symbols.

Fixed by stamping `loaded_at` inside the function rather than naming the other
24/36/28 columns, which keeps the property the original was written for. It is
also the more correct reading of the field — when the *database* received the
row — and it removes a caller's ability to backdate it.

`atlas_upsert_reported_lines` carries the same guard, applied before it shipped.

**Proof:** `supabase/tests/company_reported_lines_contract.sql`, 9/9 against
production in a rolled-back transaction. Case 1 is the exact payload shape
`rowsFor()` produces, observed throwing before the repair and passing after.
Both migrations hash identical to the live function bodies (`md5(prosrc)`
`27bafa2b` / `5008770f`).

---

## 7. The first real load, and the three things only it could show

Eleven symbols loaded on 2026-09-23 — AFL, BAC, C, HUM, JPM, MET, PGR, PRU,
TRV, UNH, WFC — **19,727 lines, 2010–2025**, 15–16 annual periods each. CB
failed on a duplicate-year conflict and its fix (`pickOnePerYear`, EQ-4g) is
committed; it is not yet re-run. Chubb returns 19 filings all tagged `10-K`
with 2011, 2012 and 2013 each appearing twice, from the two predecessor
registrants of the merged Chubb/ACE entity.

The figures corroborate against published reality. Efficiency ratios FY2024:
JPM **0.517**, BAC **0.656**, WFC **0.663**, C **0.665**. Short-duration loss
ratios FY2024: TRV **0.645**, PGR **0.693**, UNH **0.855** — which *is* UNH's
published 85.5% medical care ratio — and HUM **0.898** against ~89.8%.

And three things were wrong that no single-filer probe could have shown.

### 7.1 `pc_insurer` named a property the filers do not have

UNH and HUM were classified `pc_insurer`. They write no property and no
casualty business at all. What the view actually tests is **ASC 944's
short-duration vs long-duration contract distinction** — and a health insurer
files short-duration contract liabilities exactly as a P&C insurer does, which
is why the *measurement* was right and the *label* was false. The `fwd_pe`
defect, in a framework name.

`short_duration_insurer` / `long_duration_insurer`, with `pc_applicable` and
`lh_applicable` kept as aliases of the duration flags so no consumer breaks,
and a test asserting they still track.

### 7.2 The tag lists knew one spelling and the filings use several

| symbol | classified before | after | cause |
|---|---:|---:|---|
| PRU | 3 of 16 years | **15** | combined FPB tag, 2010–2022 |
| MET | 12 of 16 | **16** | after-reinsurance FPB tag, 2019–2022 |
| UNH + HUM loss ratio | 4 filer-years | **32** | health-specific losses tag to 2023 |

One liability, three tags, split across LDTI (ASU 2018-12) adoption — all three
labelled *"Future policy benefits"* by the filers themselves:

```
LiabilityForFuturePolicyBenefits                              AFL 2012-25, MET 2010-18 + 2023-25, PRU 2023-25
LiabilityForFuturePolicyBenefitAfterReinsurance               MET 2019-2022
LiabilityForFuturePolicyBenefitsAndUnpaidClaims...Expense     PRU 2010-2022
```

And the health insurers tag losses `PolicyholderBenefitsAndClaimsIncurred`**`HealthCare`**
through 2023, generically from 2024 — measured mutually exclusive across all
32 UNH and HUM filer-years, so the preference order can never double count.

**Every alias was verified by reading the filer's own `label`**, which is what
`company_reported_lines` storing the long form buys. Two candidates were
**rejected** on that reading: AFL's `LiabilityForUnpaidClaimsAndClaimsAdjustmentExpenseNet`
is labelled `[Roll Forward]` — a reconciliation header, not a closing balance —
and PRU's combined tag is accepted to *classify* and refused as a *measurement*
(see 7.4).

Unclassified is now **6 filer-years of 176**: AFL 2010–11 and PGR 2010–12 carry
no such liability tag at all, and PRU 2014 carries no premiums line.

### 7.3 CAMELS A is per row, not refusable as a class

EQ-4f withheld it for every bank on the grounds that no loan-book denominator
was measured. It is measured — on **48 of 62 bank filer-years**, under a legacy
tag pair through 2019–2021 and the ASC 326 (CECL) pair from 2020–2022.

The ratios corroborate rather than merely computing:

| | loans / assets | allowance / loans |
|---|---:|---:|
| JPM | 0.28–0.34 | 0.0397 (2011) → 0.0165 (2015) → 0.0176 (2025) |
| C | 0.28–0.35 | 0.0669 (2010) → 0.0186 (2019) → 0.0262 (2025) |
| BAC | 0.33–0.42 | 0.0466 (2010) → 0.0097 (2019) → 0.0113 (2025) |
| WFC | 0.45–0.58 | 0.0314 (2010) → 0.0100 (2019) |

WFC is the loan-heavy bank of the four and JPM the most markets-weighted, which
is what the loans/assets column says; and every allowance series traces the
post-GFC credit normalisation down to a 2018–19 trough and back up after CECL.

The **14 refusals** are exactly the years each filer straddles the tag change —
BAC 2020–21, C 2020–22, JPM 2016–2020, WFC 2022–25 — and every one carries
`camels_a_withheld` with NULL on both ratios. **No row carries the flag with an
absent ratio**, checked rather than assumed.

One correction of my own: the EQ-4h migration comment says *"41 of 62"*. That
number came from a probe query written before the view existed, reading a
narrower allowance list than the view ships. EQ-4i corrects the stored comments
rather than editing EQ-4h, because EQ-4h is what the database ran and a file
edited after the fact is the file/database divergence this codebase has now
found five times. **A comment stating a coverage figure is a claim about the
data, and it has to be measured against the object that carries it.**

### 7.4 Good enough to classify is not good enough to measure

PRU's `...AndUnpaidClaimsAndClaimsAdjustmentExpense` pools both contract
durations. It establishes that the filer writes long-duration business — that
much is true of a combined line — and it is deliberately **not** accepted as
the numerator of `reserves_to_premiums`, which would publish a reserve adequacy
figure over a book it does not describe. Asserted as its own test case, not
left to a comment.

### 7.5 `benefits_to_premiums` reads like a loss ratio and is not one

FY2024: PRU **1.098**, MET **0.995**, AFL **0.554**; the mean across all 62
long-duration filer-years is 0.889. A long-duration insurer earns most of its
revenue as net investment income and policy fees, so premiums are a minority
denominator and the figure says nothing about underwriting.
`benefits_ratio_caveat` travels on the row — present on **62 of 62**, zero
uncaveated — so the figure cannot be rendered without it. Same construction as
`dispersion_basis` and `vol_basis`.

### Proofs

`supabase/tests/company_institution_profile_proof.sql` **12/12** and
`company_institution_ratios_proof.sql` **12/12** against production, both
rolling back, both including their happy paths. Cases 8–12 in each are EQ-4h
and every one of them fails against the EQ-4e views. Ratio case 11 is the
sharpest: the same bank, the same numbers, the two tag eras, asserted to agree
*exactly* — if they disagreed the ratio would be a statement about XBRL
practice rather than about the bank.

---

## 8. What is not done


- **CB is not loaded.** `pickOnePerYear` is committed and untested against the
  live duplicate-year payload that produced it.
- **The wider cohort is not loaded** — 11 symbols of ~165 Financials. Finnhub
  is 60/min with no daily cap, so that is about three minutes of calls; the
  Alpha Vantage throughput ceiling does not apply to this layer.
- **`underwriting_expense`, `premiums_written_net` and `policyholder_benefits`
  are still unmapped**, so the combined ratio stays refused. The live lines now
  make this a SQL label search rather than a vendor round trip: the search over
  the loaded 19,727 rows returned only `OtherUnderwritingExpense` (PGR, 16
  years — "other" in its own name) and DAC amortisation, which are components
  and not the measure.
- **CAMELS · C stays refused.** Tier 1 and RWA are in the regulatory capital
  tables, not the face statements — absent on all four banks across 62
  filer-years.
- **No cron entry and no surface.** The schedule waits until the layer has a
  consumer.
