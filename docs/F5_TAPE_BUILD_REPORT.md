# F-5 — The tape

Built against **F2 §3** and **F3 §2.1**, on the source report in
`docs/F5_TAPE_SOURCE_REPORT.md`. Every figure below is from the live database,
measured 2026-09-16.

**Owner's decision applied (2026-09-16):** Sprint 2 runs **sector + index**.
EEM sits inside the index frame **labelled as itself**. There is no regional
label anywhere on the tape.

---

## 1 · Acceptance

**F2 §5 clause 6** — *three sprints, loops, pauses on hover and focus, honours
`prefers-reduced-motion`, skips an empty sprint rather than padding it.*

| Clause | Measured | Result |
|---|---|---|
| Three sprints | NAMES, GROUPS, SIGNALS — 10, 12 and 12 items | ✅ |
| Loops seamlessly | two copies of the sequence, `translate3d(0)` → `translate3d(-50%)` | ✅ |
| Constant velocity | `linear`, 6,156 px sequence → **111.9 s** = 55 px/s | ✅ |
| CSS transform only | `animation-name: nft-scroll`; no layout property animated, no per-frame JS | ✅ |
| Pause on hover | `animationPlayState` hover **paused** → unhover **running** | ✅ |
| Pause on focus | focus **paused** → blur **running** | ✅ |
| Keyboard reachable | tab order from a cold page: **NAMES → GROUPS → SIGNALS →** out | ✅ |
| `prefers-reduced-motion` | `animationName: none`, paged static list, pager **◀ 1 / 3 ▶** | ✅ |
| Empty sprint skipped | holdings emptied → `["GROUPS","SIGNALS"]`; instruments emptied → `["NAMES","SIGNALS"]` | ✅ |

The play-state and tab-order figures are **read off the live DOM**, not off the
source. The first tab probe reported the order starting at GROUPS; that was an
artefact of the probe focusing a sprint before tabbing, and re-running from a
cold page gives the order above.

**F2 §5 clause 7** — *Sprint 3 and the pair explorer read the same source.
Prove they cannot diverge.*

Proven **structurally**, not by comparison. `nexusTapeCompute.js` imports
`alignedWindow` and `buildSeries` from `nexusPairsCompute.js` and contains no
ratio arithmetic of its own — the only division of a numerator by a denominator
in the repository is `const raw = num.map(...)` in `nexusPairsCompute.js`:

```
$ grep -rln "const raw = num.map" src/
src/pages/nexus/nexusPairsCompute.js
```

Sharing a *data source* while running a second implementation of the arithmetic
is the failure F2 §3 names, and it is what a "both read `market_prices`" answer
would have been. The test asserts bit-equality against a hand-computed ratio so
a future re-implementation fails rather than drifts.

---

## 2 · The Sprint 2 decision, and where it lives

`market_instruments` had **no** column able to express sector vs index:
`asset_class` is `equity_etf` for XLE, SPY **and** EEM alike, and `proxies_for`
is free text that parsing would misfile silently.

A hardcoded map in the component was rejected on the rule
`nexusPairsCompute.js` already states in its own header — *a surface must not
hold a hardcoded copy of a classification the database owns*. So the migration
`20260916100000_f5_tape_group_on_market_instruments.sql` adds one column:

| `tape_group` | legs | symbols |
|---|---:|---|
| `sector` | 6 | XLE XLF XLI XLP XLU XLY |
| `index` | 5 | DIA IWM QQQ RSP SPY |
| `regional` | 1 | EEM |
| NULL — off the tape | 7 | CPER GLD HYG IEF IEI SHY TLT |

This is a **labelling change over rows that already exist** — no new series, no
price backfill, no inception verification. It is not the A0-shaped data unit
that adding regional legs would be.

### The fold rule is structural, not a carve-out for EEM

`tape_group` records what the instrument **is**. The tape decides how to
**render** it, under one rule:

> A group holding fewer than two legs does not get a frame. Its legs fold into
> the broad-market frame, and the fold is recorded on the item.

That is the owner's own reasoning — *one instrument is a data point, not a
category* — encoded as a rule rather than as a decision about EEM. Two
consequences, both tested:

- Today `regional` has one leg, so **EEM renders under INDEX** and the sprint
  carries the note *"regional shown in index"*. Nothing is hidden.
- **Registering a second regional leg gives regional its own frame with no code
  change.** `nexusTapeCompute.test.mjs` asserts exactly this by adding an R2 row
  to the fixture.

`index` is also literally true of EEM — it tracks the MSCI Emerging Markets
Index — so the frame is not a small lie about the instrument.

### The ticker is the label, for every leg

The owner's rule was *"EEM +1.1%", not "Emerging markets +1.1%" — the ETF is the
measurement; the asset class is an interpretation of it.*

That reasoning is **not specific to EEM** and is applied to all twelve legs.
XLE's own `caveats` record that it is a large-cap-only S&P 500 slice "close to a
two-stock series"; printing "Energy +2.17%" over it makes the same overstatement
one step smaller. `proxies_for` rides on the item's `title`, so the
interpretation is one hover away rather than discarded.

---

## 3 · What the tape says today (2026-09-15 close)

**NAMES** — 5 best, 5 worst of 65 measured holdings.
`▲ PBR +2.84% · AMD +2.21% · XLE +2.17% · IXC +2.16% · HAL +1.88%`
`▼ ANF −3.80% · ATAT −3.55% · INTU −2.95% · ADBE −2.94% · TGT −2.77%`
`1 withheld · no current price` — `SOXX261016P00500000`, an option contract with
no mark. It is **excluded from the ranking and named**, never printed as 0.00%.

**GROUPS** — `SECTOR` XLE +2.17 · XLF −0.32 · XLI −0.64 · XLP −0.82 · XLU −1.20 ·
XLY −1.75 ‖ `INDEX` EEM −0.35 · SPY −0.46 · RSP −0.49 · DIA −0.62 · QQQ −0.65 ·
IWM −0.96. Note: *regional shown in index*.

**SIGNALS** — 12 pairs, ranked by absolute 1D move.
`XLE/XLU 1D +3.4% 1W +7.0% 1M +14.2% · cyclical +`
`XLY/XLP 1D −0.9% 1W −2.4% 1M −3.5% · cyclical + ·tie`
`CPER/GLD 1D +0.7% 1W −3.3% 1M −1.6% · no axis`

---

## 4 · Two defects the render caught, not the build

Both shipped-looking and both wrong. The Vite build was clean through each.

**1 · The axis rendered as a full sentence.** `factor_axes.label` is
*"Cyclical risk-on (up = cyclicals & credit over defensives & gold)"* — a
description, not a name. At ticker size it swamped the item and took the
sequence to 9,526 px. The tape token is now the **axis key**; the sentence and
`positive_means` moved to the `title`, so orientation is preserved rather than
discarded. 9,526 → 6,156 px.

**2 · The loading's sign was missing, and that one is a misreading.** The tag
alone says which axis a pair belongs to and not which way it pushes it. RSP/SPY
loads **−0.47** on concentration: a reader shown a rising RSP/SPY beside a bare
`concentration` tag would conclude the opposite of what the loading says.
`nexusPairsCompute.js` makes this exact argument in its own header, and the tape
is the surface that would have broken it. Every assigned item now carries
`+` or `−`, and an unassigned pair carries **no sign** rather than a defaulted
one.

**3 · Sprint 2's frames were invisible.** Sector and index ran as one
undifferentiated list of tickers, which makes the frame concept — and therefore
the whole EEM decision — unreadable. A frame marker now sits at each boundary,
so `INDEX EEM −0.35%` is visible as the decision it is.

---

## 5 · Decisions F1 §7 leaves to CC

Recorded rather than asked, per the brief.

**Scroll velocity — 55 px/s, constant.** The duration is derived from the
**measured** track width, not fixed. A fixed duration would make the tape run
faster on days the book has more to say, which is the opposite of what a reader
needs.

**The separator is each sprint's own leading label, not a rule between
sprints.** On a tape you land mid-sprint constantly, and a divider you have
already scrolled past tells you nothing about the frame you are now in. The
label travels with its sprint, so the frame of reference is legible from
anywhere in the stream — which is what F2 §3 actually asks for.

**Component boundary.** `nexusTapeCompute.js` is pure and IO-free and runs under
plain node; `NexusTape.js` holds the only fetch and the only DOM. The duplicate
sprint copies are `aria-hidden` and `tabIndex=-1`, so the loop seam costs
nothing in the accessibility tree or the tab order.

**Placement.** F2 §3 puts the tape "where the strip used to be". F-4 has not run,
so the strip (`nfv2-pf-line`) is still above it. The tape sits in its **final**
position now and F-4 vacates the line above rather than moving it. Mounted in
both the v1 and v2 flagship layouts.

**Reduced motion.** "Paged static list" is read literally: one sprint at a time
with a `◀ n / 3 ▶` pager, user-driven only. Auto-advancing would reintroduce
motion by another route.

---

## 6 · One paging implementation, not two

`fetchPricesPaged` was local to `NexusPairExplorer.js`. The tape needed the same
read, and a second copy of a PostgREST pager is precisely how the 1,000-row cap
has come back four times in four layers. Extracted to
`src/pages/nexus/nexusMarketPrices.js`; the explorer now calls it. Its own test
suite passes unchanged, which is what makes that a refactor rather than a
rewrite.

The harness enforces the 1,000-row cap on every `market_prices` response, so a
regression that dropped the pager would truncate visibly here.

---

## 7 · Data honesty

- **`nexus_holdings`, never `vw_nexus_holdings`.** The latter reads a matview
  that ran three positions behind the live book and its `daily_return_pct`
  carries no staleness gate — how KMTUY published +6.3% off a 179-day-old print.
- **A NULL move is absent, never 0.00%.** Rendered as a dimmed em dash with its
  reason on the title.
- **A genuine 0.00% survives.** `??`, never `||` — tested with a flat name that a
  `||` would drop.
- **One bar yields no move.** A single close cannot express a change, and
  printing 0.00% for it would be a fabricated flat session.
- **Freshness is per item, against the newest bar on the tape — never
  wall-clock.** A weekday feed is not late on a Sunday.
- **A transport failure says so.** `"Tape unavailable — the market feed did not
  answer."` — never "no market data". Observed live: the first harness run had no
  anon key and rendered exactly that sentence.
- **Nothing on Sprint 2 comes from the book.** F3 §2.1's prohibited substitution
  is not used and was never needed.

---

## 8 · The gap, recorded so it is not rediscovered

**Sprint 2 runs two frames because there is no regional coverage.** `regional`
holds one leg, EEM. That is a property of `market_instruments`, not of the tape.

**Do not close this by computing regional aggregates from the book's holdings.**
That is the substitution F3 §2.1 prohibits, in the layer where it would be
easiest to reach for.

The fix is an A0-style unit: register EFA, EWJ, FXI, EWZ or similar in
`market_instruments` with `caveats` and inception, backfill `market_prices`, set
`tape_group = 'regional'`. **Sprint 2 then gains a third frame with no code
change** — the fold rule in §2 releases it automatically at the second leg.

---

## 9 · Files

| File | |
|---|---|
| `supabase/migrations/20260916100000_f5_tape_group_on_market_instruments.sql` | `tape_group` column, CHECK, comment, 12-row backfill |
| `src/pages/nexus/nexusTapeCompute.js` | pure transforms — all three sprints and every refusal |
| `src/pages/nexus/nexusTapeCompute.test.mjs` | 19 tests |
| `src/pages/nexus/NexusTape.js` | the component: one fetch, the DOM, the scroll |
| `src/pages/nexus/nexusMarketPrices.js` | the one paged `market_prices` read |
| `src/pages/nexus/NexusPairExplorer.js` | repointed at the shared pager |
| `src/pages/nexus/NexusFlagship.js` | mounted in both layouts |
| `src/styles/nexus-flagship-v2.css` | tape styling, existing tokens only |

**263/263 tests pass. Build clean.**

Screenshots: `f5-tape.png` (NAMES), `f5-tape-groups.png` (SECTOR ‖ INDEX with
EEM), `f5-tape-signals.png`, `f5-tape-reduced-motion.png` (pager),
`f5-tape-skipped-sprint.png` (GROUPS source emptied — two sprints, no padding).

**Render proven, network read not.** The rows were read server-side and replayed
by patching `window.fetch` for `/rest/v1/*`; the real supabase-js client, its
query builders and the real component all run. The browser in this container
cannot reach Supabase directly.

The only console error in any run is `/favicon.ico` 404 from the harness page —
confirmed by `curl`, not assumed.
