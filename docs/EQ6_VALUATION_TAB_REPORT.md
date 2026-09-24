# EQ-6 — the Valuation tab: the SGR gate, source discipline and a verdict that can be false

2026-09-22. Tab 3 of the Equity Research brief.

## 1. What was there

`ValuationTab` in `equity-research-panels.js`: a reverse DCF, a sensitivity
heatmap and a tornado. Three things about it, in increasing order of severity.

**It ran at a hardcoded WACC.** `parseInputs` ends

```js
return { …, wacc: 0.085, termGrowth: 0.025, horizon: 10 };
```

— one discount rate for every symbol in the universe. The reverse DCF, the
grid and the tornado all ran on it, so a panel titled *"Market-Implied
Expectations"* was largely a statement about the constant `0.085`. Measured
against the live engine, the companies' own costs of equity run **6.94%
(AMGN) to 11.05% (GOOGL)** and their WACCs **6.59% to 10.72%** — the fixed
8.5% is above some and below others.

**Its solver never checked its bracket.**

```js
function bisect(fn, target, lo, hi, iters) {
    iters = iters || 64;
    for (var i = 0; i < iters; i++) { … }
    return (lo + hi) / 2;
}
```

With the target enterprise value outside `[lo, hi]` this returns an endpoint.
The endpoint is the solver's own bound, and it was published as the growth
rate the market expects. A price that no sane growth assumption explains is a
finding; `-5%` or `60%` because those were the constants in the call is not.

**It closed with a sentence computed from nothing:**

> "The market isn't asking for heroic growth — it's asking margins to hold at
> the current level for a decade."

Printed for every company in every market since it was written. **A sentence
that cannot be false is not a verdict.** Third instance of this shape in this
codebase after the chrome's hardcoded `RISK-ON` pill and the
conditional-correlation panel that hardcoded the sign of a surge.

## 2. The SGR bug, measured

The brief: *"every time you get a company whose sustainable growth rate is
above the cost of capital, absolute valuation models such as DCF go out the
window."*

Probed through the real `/api/equity` payload and the real engine
(`mapPayload` → `computeMethods` → `buildMethodSnapshots`):

| | β | cost of equity | WACC | raw SGR | engine's clamped `ri.g` | Residual Income |
|---|---:|---:|---:|---:|---:|---|
| GOOGL | 1.209 | 11.05% | 10.72% | **20.32%** | 0.150 | `ri_undefined` |
| AMGN  | 0.462 |  6.94% |  6.59% | **35.72%** | 0.150 | `ri_undefined` |
| TGT   | 0.938 |  9.56% |  8.65% | **10.68%** | 0.107 | `ri_undefined` |
| JPM   | 1.040 | 10.12% |  9.79% |   7.12%    | 0.071 | **valued, 521.03** |

**Three of four probed symbols carry an SGR above their own cost of equity,
and every one of them loses the residual-income model.** The one that clears
values.

**No wrong number is published, and that is not the same as nothing being
wrong.** `mapPayload` clamps `riG` to 0.15, `riCalc`'s own `MIN_TV_SPREAD`
then refuses the terminal value, and the method drops. What reaches the
reader is the reason code **`ri_undefined`** — which names the symptom and
not the cause, gives no number, and offers no way to ask what growth it
*would* take.

### The gate

`sgrGate()` grades the SGR against **both** rates and publishes the worse of
the two verdicts. That matters: 9.0% growth clears an 11% cost of equity with
2pp to spare and does **not** clear a 9.5% WACC, so a gate reading one rate
would call the page available while the FCFF model was undefined. The
dividend and residual-income models discount at the cost of equity; FCFF
discounts at the WACC. They are different rates and a single verdict is wrong
for half the page.

Refusal has two reasons, kept apart:

- `growth_exceeds_discount_rate` — `g >= r`. The perpetuity is undefined at
  `g = r` and **negative** past it.
- `spread_below_terminal_floor` — `0 < r − g < MIN_TV_SPREAD`. Arithmetically
  fine, financially absurd: essentially all of the value lands in the terminal
  term. This is the engine's own 2pp floor, not a second number invented here.

Testing `g >= r` alone would pass a company sitting 10bp under its cost of
capital.

### The override

Pre-loaded with the reported retention and ROE, publishing **nothing** until
one of them moves (`applied: false`). Pre-loading is a convenience, not an
assumption the reader has made. When applied, the figure is labelled
`IMPUTED` everywhere it is used and the reported SGR is carried beside it.

The panel also states what would have to be true: at the current ROE, the
retention ratio that brings the SGR to `cost of equity − MIN_TV_SPREAD`, and
at the current retention, the ROE that does. `retentionForGrowth` returns
**null** rather than a retention above 1 when the ROE cannot carry the target
at any payout — a `b` of 1.8 reads like an instruction.

The brief's point about consolidated ROE is why the ROE control exists at
all: a group figure spanning segments that earn very different returns can be
exactly what refuses the model.

## 3. Source discipline

The engine hydrates from the vendor snapshot; the statement layer derives the
same quantities from the filings. Eleven inputs, both sources, the gap named,
**nothing substituted**.

The probe found two live divergences worth stating:

- **`engine_b` is 0.400 for all four symbols.** `mapPayload` falls back to
  `b = 0.40` when it has no dividend per share, and it has none here because
  the price it needs to derive `D0` from the yield is stale. So the engine's
  retention ratio is a **default**, against GOOGL's filed 0.924.
- **Engine ROE against filed ROE**: GOOGL 0.508 vs 0.357, AMGN 0.893 vs
  1.061.

Both feed the SGR. The gate therefore reads the **statements'** ROE and
retention where it has them and falls through to the engine only where it
does not — because the engine's ROE defaults to a sector constant (0.145)
when unhydrated, which would make the gate a statement about that constant.
The reconciliation table shows both, so the choice is visible rather than
silent.

A field **neither** source carries gets a row saying so. "The engine has no
FCFF for this company" is exactly the fact a reader chasing a missing DCF
needs; a table that shrinks hides it.

## 4. The verdict

Four clauses — growth, margin, funding, terminal — each derived from a
measurement and **absent** when its inputs are, with the withheld ones named
so the panel states its denominator.

Bands are **absolute and printed**, never quantiles: a quantile rule relabels
a company because the other companies loaded changed, which is a ranking
dressed as a verdict.

The margin clause is the strongest available, because it is a fact about the
company's own filings rather than a forecast: *"the price needs a 44%
operating margin — above the best 34% in 20 periods of filings."* A claim
like that can be false, which is the whole point.

The funding clause is the one the SGR makes possible: implied growth above
the sustainable growth rate cannot come from retained earnings, so it needs a
higher ROE, a lower payout, or outside capital.

## 5. Sensitivity and the sweep, re-centred

Both are kept and both now run on the **solved** growth at the **company's
own** WACC, so the grid's centre cell reproduces the reverse DCF above it
rather than a separate valuation the reader reconciles by eye (asserted, to
1e-9). The old grid was a fixed 7.5–9.5% × 1.5–3.5% for every symbol; a
company at a 13% cost of capital read its fair value off a range it never
occupied.

A cell whose terminal spread falls below the floor renders **`refused`**, not
a low number, and the count is stated. A refused perpetuity is not a cheap
valuation — it is no valuation. Same rule in the tornado: a shock that
crosses the floor reports **`1 side refused`** rather than a zero swing,
because a zero reads as a driver that does not matter, which is the opposite
of what a refused perpetuity means.

## 6. What was proven, and how

- **31 tests**, and they discriminate rather than pass vacuously:
  - restoring the old unbracketed `bisect` fails **1**;
  - replacing the gate with the engine's clamp-and-publish behaviour fails
    **5** — checked by reverting, not assumed.
- **139/139** across the whole suite; `vite build` clean.
- **The new tab ships.** Grepped the built bundle for strings unique to it:
  `ABSOLUTE MODELS REFUSED` ×1, `Impute a hypothetical SGR` ×1,
  `ENGINE vs FILINGS` ×1, `CENTRED ON THIS WACC` ×1. The old hardcoded
  sentence is **×0**. (`SOURCE DISCIPLINE` reads ×0 because the source says
  `Source discipline` and CSS uppercases it — the case-sensitivity trap this
  codebase already records.)
- Every figure in §2 and §3 comes from the live `/api/equity` payload run
  through the real engine, not from a fixture.

## 7. Also in this change

**`Max` was capped at 20 periods** (CodeRabbit, PR #806). `buildColumns`
sliced to a limit that the `Columns` toggle mapped `Max` to 20, so a
quarterly load carrying 81 periods could never show more than a quarter of
them — and the cap read as the data's own depth. A null limit is now
unbounded and `Max` passes null.

## 8. Not done

- **`compute_ticker_derived` still publishes an X3+X4 partial Altman score**
  (CodeRabbit, PR #806). `useStatementDerived`'s `mergeDerived` lets the
  statements win per key, so a loaded symbol gets the full Z″; an unloaded
  one can still be handed the partial score under normal Z″ zones. That is
  the edge-function's contract and its own unit.
- The reverse DCF's terminal growth still comes from the engine's **sector**
  default (`SECTORS[key].gL`). It is a real per-sector number rather than one
  constant, and re-deriving it per company is a decision about the statistic.

---

# Addendum — Tab 4's condition, measured, and two partial Altman scores

2026-09-22, same branch.

The brief keeps Quality & Forensics **"only on condition all metrics actually
come through and display"**. That is a measurement, so it was measured:
`derivedFromStatements` run over the live `vw_company_fundamentals` rows for
every loaded symbol.

| symbol | periods | Piotroski | determinable | Altman Z″ | CCC | ROIC | reinvest | div cover |
|---|---:|---|---:|---:|---|---:|---:|---:|
| TGT   | 20 | 6/9 | **9** | 1.355 | 5 pts | 0.114 | 0.146 | 1.381 |
| GOOGL | 20 | 7/9 | **9** | 7.136 | 5 pts | 0.322 | 0.530 | 7.291 |
| AMD   | 20 | 8/9 | **9** | 6.898 | 5 pts | 0.067 | −0.466 | — |
| PFE   | 20 | 7/9 | **9** | 3.058 | 5 pts | 0.066 | −0.223 | 0.929 |
| ADBE  | 20 | 7/9 | **9** | 7.737 | 5 pts | 0.382 | −0.087 | — |
| WMT   | 20 | 6/9 | **9** | 2.027 | 5 pts | 0.153 | 0.510 | 1.988 |
| COST  | 20 | 8/9 | **9** | 2.661 | 5 pts | 0.225 | 0.374 | 3.590 |
| AMGN  | 20 | 7/9 | **9** | 0.336 | 5 pts | 0.156 | −0.328 | 1.581 |
| JPM   | 20 | 3/9 | **7** | — | — | — | −0.155 | — |

**Eight of nine resolve completely** — against the screenshotted `0/9 with
eight rows blank`, `partial estimate X3+X4 only` and `N/A`. The dividend
coverage absent on AMD and ADBE is correct: neither pays one.

**JPM is the exception and it is the gate working.** EQ-2's
`statement_profile` nulls a bank's working capital, CCC, ROIC and cash
conversion, so `crRising` and `gmRising` cannot be scored and X1 cannot be
formed. That is CAMELS-shaped work (EQ-4), not a data failure.

## Two partial Altman scores, one of them fabricated

CodeRabbit found the first on PR #806: `compute_ticker_derived/index.ts:271`
publishes

```ts
altman_z = 6.72 * x3 + 1.05 * x4
```

when it cannot form x1 and x2 — and `mergeDerived`'s rule that "a null from
the statements must not erase a real figure" let that partial survive
wherever the statements refused. **JPM is the live case.**

The second was in the panel and is worse:

```js
totalLiab = inp.mktCap / (inp.pb || 5) - bookEq;   // not a liability figure
approxTA  = bookEq + inp.totalDebt;                 // not total assets
azApprox  = 6.72 * x3 + 1.05 * x4;                  // X3+X4 only
```

Total liabilities algebraically inverted out of a market multiple, total
assets from book equity plus debt, and the result fed **straight into the
full Z″ bands and needle**. So a refused score for a bank was rendered as a
zone, in colour, from a balance sheet that does not exist.

And a third fault underneath both: `azZone` read

```js
azDisplay > 2.60 ? 'SAFE' : azDisplay > 1.10 ? 'GREY' : 'DISTRESS'
```

`null > 2.60` is **false**, so a score that could not be formed fell through
to **DISTRESS, in red, with a needle**. The worst reading on the card was the
default for having no reading at all.

Three fixes:

- `altmanZDoublePrime` already returned `partial: true`; `derivedFromStatements`
  now publishes it as **`altman_refused`**, and `mergeDerived` **deletes**
  `altman_z` and `altman_components` rather than nulling them — a renderer
  cannot print a number it was never handed. Scoped: every other key the table
  carries survives, and a healthy symbol keeps its score.
- The fabricated approximation is **gone**. `az` is the only path.
- An unformed score has **no zone, no pill and no needle**, and the card states
  the reason — "WITHHELD, not missing" with the CAMELS note for a financial,
  the missing-component note otherwise.

The footnote also referenced `azApprox`, which the removal deleted — a
**ReferenceError at render** that `vite build` reported clean, the
"build is not a scope audit" lesson for the third time.

Four tests; **2 of 4 fail** against the pre-fix code, checked by reverting.
