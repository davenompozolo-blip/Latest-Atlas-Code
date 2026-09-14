# D1 — Growth × Inflation quadrant: consumer inventory

Master spec §3. 2026-09-14.

**D1 (inventory) against `main` @ `10c358f`. D2 and D3 executed the same day — see §7.**

The inventory below is preserved as written, including one entry it got wrong: it counted
**four** live consumers and there were **five**. The miss is recorded in §7.2 rather than
patched out of §1, because how it was missed is the useful part.

---

## 0 · What is already done

Phase D2 was executed on **2026-09-10** for the **Nexus Regime tab only**, and it was done
properly: the verdict header, the 2×2 SVG, Book fit and the regime read were all removed on
the stated rule *"if a block takes `regime.label` as an input, it goes"* — removing only the
SVG would have left three blocks still asserting a single label. `src/pages/nexus/NexusRegime.js`
records it, and its claim **"Nothing on this tab names a regime"** holds.

`api/macro.js` carries an accurate D3 list from that session. This inventory confirms it,
extends it with the render paths, and adds the database sweep it never covered.

---

## 1 · Live consumers — D3 items

### 1.1 · `RegimePanel` — the full quadrant, on two tabs

`src/pages/macro-regime.js` is the 2×2 in its entirety: four labels, the quadrant grid,
`REGIME_TILTS` (five-factor tilt per label) and `REGIME_ASSETS` (four asset-class calls per
label). All hardcoded, all keyed on `regime.label`.

It is exported as `RegimePanel` and rendered on **two live, routed tabs**:

| Page | Site | Reachability |
|---|---|---|
| `src/pages/macro-dashboard.js` | `:87` `tab === 'regime'` | `:12` in the tab list, and `:37` `useState('regime')` — **the default tab** |
| `src/pages/market-watch.js` | `:749` `case 'regime'` | `:718` tab `REGIME`, subtitle **"Macro Quadrant"** |

Both are imported and routed from `src/pages/app.js`.

**This is the finding that holds D2.** The quadrant was retired from the Nexus Regime tab
and left standing on the Macro dashboard, where it is the first thing rendered. §3's premise
— "still on the page beside its replacement" — is true of these two tabs, not of the tab the
2026-09-10 work cleaned.

### 1.2 · `src/pages/nexus/NexusTheme.js` — rotation banner

`:96` `rotationBias(regime.label)`, `:103` prints `regime.label` in the quadrant's own
colour, `:322` `rotationCall(rows, disp, regimePlaybook(regime.label))`.

`regimePlaybook` and `rotationBias` survive in `nexusRegimeCompute.js` **only** for this
consumer — its own comment says so.

### 1.3 · `src/pages/nexus/nexusLiveCompute.js` — flagship windshield

`:603` templates `reg.label + ' regime'` into the headline, falling back to `'Rates in
focus'`; `:676` and `:732` carry the label into the narrative.

### 1.4 · `api/macro.js` — the producer

`classifyRegime()` at `:176`. Live Vercel function. Two series (UNRATE, CPI), four hardcoded
branches, and a `confidence` that is a **literal constant per branch** (0.7 / 0.65 / 0.65 /
0.6) rather than a measurement. Still computed and served because 1.1–1.3 would break
without it.

---

## 2 · Not consumers — verified name collisions

**`market_regime_windows`** and its two hardcoded fallbacks —
`src/pages/perf-panels-analytics.js:46-52` (`DEFAULT_REGIME_WINDOWS`) and
`src/pages/risk-v2.js:44-46` — are **not** quadrant consumers, despite four of the five
names coinciding.

The table's own comment settles it:

> Hand-authored dated market windows used to slice performance and risk history (Regime
> Slicer, risk-v2, api/trade-sync). NOT the retired Growth × Inflation quadrant: some names
> coincide but this is a period labelling, and "Tariff Shock" is not a quadrant.

`Tariff Shock` has no quadrant equivalent, the rows carry explicit `start_date`/`end_date`,
and nothing joins them to `regime.label`. **A grep on the four names finds these and they
are the wrong answer** — which is the reason D1 is an inventory rather than a search.

---

## 3 · Database — nothing, and that matters

A full sweep of `public` for views, matviews, functions and column names carrying
`Goldilocks|Stagflation|Reflation|quadrant`, plus any column named `quadrant*` or `regime*`,
returns **zero objects**. The quadrant was never persisted; it is computed per request in
`classifyRegime()`.

Two consequences:

- **D2's "do not drop any table, do not delete any historical labels" has nothing to
  protect.** There is no stored quadrant history.
- **§6/E3's possible comparison baseline does not exist.** The spec floats a retired
  regime-label history as something B2 might want to compare against. There isn't one, and
  it cannot be reconstructed — `classifyRegime` reads whatever FRED returns at call time and
  nothing recorded its output. E3 should be planned without it.

---

## 4 · Dead code — Python / Streamlit era, not deployed

`services/macro_regime.py`, `ui/pages/macro_intelligence.py`, and `api/routers/sandbox.py:151`
(mounted at `api/main.py:71`) all carry quadrant names.

Not reachable in production: `vercel.json` declares only `api/*.js` functions and rewrites
every non-`api/` path to `index.html`, and CLAUDE.md records Streamlit as retired with the
React terminal as the single source of truth. **Listed for completeness; no migration
needed.** They should not be counted as consumers, and equally should not be quietly
deleted under Phase D — that is a separate decision about the Python stack as a whole.

---

## 5 · What D2/D3 needs, per consumer

| # | Consumer | Migration question |
|---|---|---|
| 1.1 | `RegimePanel` on two tabs | Straight removal, as on the Nexus tab — but **two tabs lose their default/primary panel** and need something in its place. `REGIME_TILTS` / `REGIME_ASSETS` are authored claims about what each label rewards, not measurements; §3's D3 rule says a consumer that cannot be expressed in axis terms is **reported, not translated**, and these two tables are exactly that case. |
| 1.2 | `NexusTheme` rotation banner | `rotationBias` maps a label to a rotation direction. The axis layer answers a different question — measured exposure with significance. Same D3 rule applies. |
| 1.3 | `nexusLiveCompute` windshield | Smallest: the label is one clause in a templated headline with an existing non-regime fallback (`'Rates in focus'`). |
| 1.4 | `api/macro.js classifyRegime` | Deletable **only after** 1.1–1.3. Everything else `/api/macro` serves (FRED series, yields, CPI) is independent and stays. |

---

## 6 · Acceptance status (§3)

| | Criterion | Status |
|---|---|---|
| 1 | D1 inventory reported | **done** — this document |
| 2 | Quadrant absent from the regime tab; screenshot | **done** — browser DOM scan, §8. Eight surfaces, zero banned tokens, under **both** payload shapes |
| 3 | No table dropped, no label deleted; retirement recorded | **done** — no stored labels existed to drop (§3 above); retirement recorded in `api/macro.js`, `macro-dashboard.js`, `market-watch.js`, `NexusTheme.js`, `nexusRegimeCompute.js` |
| 4 | Every D1 consumer migrated or reported as blocked | **done** — 5 of 5, see §7.1 |
| 5 | Nothing on the regime tab asserts a single regime label | **done** — no surface anywhere asserts one |

---

## 7 · D2 / D3 outcome

### 7.1 · What happened to each consumer

| Consumer | Action | Why |
|---|---|---|
| `macro-regime.js` `RegimePanel` | **deleted** | 4 of its 5 blocks took `regime.label`. The 5th, `SignalTiles`, was a strictly worse duplicate — all four of its numbers already render on sibling tabs *with history* (2s10s on Rates & Yields, CPI YoY and Unemployment on Inflation & Growth, HY on Cross-Asset). Nothing replaces the tab because nothing of its own was left. |
| `macro-dashboard.js` | regime tab removed, default → `yields` | It was `useState('regime')` — the quadrant was the first thing the page rendered. |
| `market-watch.js` REGIME tab | removed | One of six tabs. |
| `market-watch.js` OVERVIEW | "Macro Regime" pulse cell and narrative clause removed | **The D1 miss.** See §7.2. |
| `NexusTheme.js` rotation banner | label, colour, confidence and "Rotation bias" line removed; facts row kept | §3's report-don't-translate case. `rotationBias` read a label off a four-branch classifier and looked up an **authored** claim about what that label rewards; the axis layer reports **measured** exposure with significance. Repointing would keep the sentence's shape and change its meaning. |
| `nexusLiveCompute.js` windshield | label clause removed from three sentences | Each already had a non-regime fallback (`'Rates in focus'`, an empty string, `.filter(Boolean)`), so removal is the fallback becoming unconditional. |
| `nexusRegimeCompute.js` | `PLAYBOOKS`, `regimePlaybook`, `rotationBias` deleted | The 2026-09-10 pass kept them solely for NexusTheme and said so. That consumer is gone, so they go rather than linger as an exported table nothing calls. |
| `api/macro.js` `classifyRegime()` | **deleted**; payload no longer carries `regime` | Deletable once every consumer above was done. |
| `pcm-optimizer.js` `cpiYoY` | repointed to `inflation.cpiYoY` | **Kept, not removed** — an observed print that merely lived under `regime`. D2 says remove the surface and keep the data. `nexusRegimeCompute` and `nexusLiveCompute` read it too and were repointed the same way. |

`rotationConviction` already treated a null playbook as a designed path: `macroFit` goes null
and its weight renormalises over momentum/positioning/breadth, per that file's own rule that
a factor with no data never fabricates an input. So the conviction score survives intact.

### 7.2 · The consumer D1 missed, and why

`market-watch.js:299` printed `regime.label` at 20px in the quadrant's own colour under the
heading "Macro Regime", subtitled "Growth / Inflation quadrant", in the KPI pulse bar of that
page's **default** tab. `:339` repeated it in the narrative strip. Both are more visible than
the REGIME tab D1 did find.

**D1 grepped for the four quadrant NAMES.** Neither line contains one — they render whatever
the classifier returns. The same grep simultaneously produced two false positives
(`perf-panels-analytics.js`, `risk-v2.js`) that *do* contain the names and are not consumers.

So the name-based sweep was wrong in both directions at once. What found the miss was
grepping the **field**: `regime.label|regime.quadrant|regime.confidence|regime.color`. The
lesson generalises past this unit — **a consumer is identified by the field it reads, not by
the values that field happens to take.**

### 7.3 · Not consumers, confirmed again after the change

`src/lib/trade/families.js:363` tests `regime.name || regime.label` against
`/risk-on|expansion|recovery/` and `/risk-off|contraction|stress|crisis/`. **None of the four
quadrant names match either regex**, and it is fed from `api/trade-sync.js`'s own context, not
`/api/macro`. Untouched.

`market_regime_windows` and its fallbacks: unchanged, per §2.

### 7.4 · Tests

`nexusLive.test.mjs`'s three assertions that the label reached the surface are **inverted
rather than deleted**, and the fixture still feeds `regime: { label: 'Reflation' }` on
purpose: a fixture that merely dropped the key would let a regression reading `regime.label`
again pass silently against `undefined`. Feeding a live-looking label and asserting it does
**not** appear is the version that can fail.

`nexusRegimeCompute.test.mjs` drops the `regimePlaybook` test with its subject, and its
fixture now carries **no `regime` key at all** — so a regression that went back to reading
`regime.cpiYoY` would lose the CPI row and fail.

219/219 pass. Build 207 → 206 modules.

---

## 8 · The browser proof (§3 acceptance item 2)

The source no longer contains the quadrant; that is not the same claim as *nothing renders
it*. This is the rendered-DOM check, run in headless Chromium against the real bundle.

### 8.1 · Two payloads, and why the pre-D2 one is the real test

The harness serves `/api/macro` from the **live cached payload** — `public.cache`,
`cache_key = 'macro_data'`, cached 2026-09-13 23:34 UTC — in two shapes:

| variant | what it is | `regime` | `inflation.cpiYoY` |
|---|---|---|---|
| `pre_d2` | **exactly what production serves today**, byte for byte | `{label: "Reflation", quadrant: "growth_up_inflation_up", confidence: 0.65, color: "#f59e0b", cpiYoY: 3.7129581058388483}` | absent |
| `post_d2` | what this branch's `api/macro.js` emits from the same inputs | absent | `3.7129581058388483` |

`pre_d2` is the one that matters. A payload with the key removed proves only that the code
does not crash; a payload **still carrying `"Reflation"`** proves the code does not read it.
Production has not been deployed from this branch, so that payload was not constructed — it
is what the endpoint is serving right now.

The two `cpiYoY` values are **bit-identical**, which is the separate claim that moving the
figure did not change it. `cpiYoYFrom(live.inflation.cpi)` reproduces the classifier's own
`regime.cpiYoY` to the last digit of the double.

### 8.2 · Banned-token scan of the rendered DOM

`innerText` **and** `innerHTML`, case-insensitive, so a value hidden by style or sitting in an
attribute still counts. Tokens: the four quadrant labels, the quadrant key, and the exact
phrases the retired blocks printed.

```
surface                            pre_d2    post_d2
01 macro dashboard  (default)      absent    absent
02 macro  Inflation & Growth       absent    absent
02 macro  Cross-Asset              absent    absent
03 market watch     (default)      absent    absent
04 nexus flagship   (default)      absent    absent
05 nexus THEME                     absent    absent
06 nexus REGIME                    absent    absent
07 nexus REGIME / Macro dashboard  absent    absent

tokens scanned: Goldilocks · Reflation · Stagflation · Deflation ·
                growth_up_inflation_up · Macro Quadrant · Book fit ·
                Rotation bias · Regime confidence · The regime read ·
                Asset implications · Factor tilts
TOTAL HITS: 0 / 0
```

What the DOM positively shows, on both variants:

- **Macro Intelligence** — subtitle *"Rates, inflation, growth & cross-asset signals"*, three
  tabs (`Rates & Yields` · `Inflation & Growth` · `Cross-Asset`), opening on Rates & Yields.
  No fourth tab.
- **Market Watch** — five tabs (`OVERVIEW SECTORS NEWS CALENDAR CROSS-ASSET`), **five** KPI
  cells (S&P 500, 10Y, 2s10s, HY OAS, NFCI) and **three** DAILY READOUT clauses. The sixth
  cell and the fourth clause were the §7.2 miss; both are gone.
- **Nexus THEME** — the facts bar renders `10Y ▲ · USD ▲ · Credit tightening` and nothing
  else. Rotation conviction shows **Macro fit — needs both legs**, which is the null playbook
  renormalising rather than a fabricated input.

### 8.3 · The differential that proves the CPI read moved

Absence of a label would also follow from the pages simply ignoring `/api/macro`. The CPI row
is the control, and it flips with the payload:

| surface | `pre_d2` | `post_d2` |
|---|---|---|
| REGIME → Macro dashboard, INFLATION group | `5y breakeven 2.40%` **only** | `CPI YoY 3.7%` · `5y breakeven 2.40%` |

The same number is present in both payloads. The row appears only when it is published under
`inflation`, so `macroIndicators` demonstrably reads `inflation.cpiYoY` and demonstrably does
not fall back to `regime.cpiYoY`.

### 8.4 · What is proven and what is replayed

`CLAUDE.md` records that the headless browser in this container cannot reach Supabase, so the
**transport** is replayed and nothing else: every `rest/v1` request the real supabase-js
client makes is answered from the live database, read server-side. The client, its query
builders, the loaders, the components and the bundle are all the real ones — the Nexus
flagship ran on **62 live `vw_nexus_holdings` rows** through 25 replayed view reads.

Every request to any other host is **aborted and named**, so nothing silently escaped: Google
Fonts and four TradingView iframes (the grey panels in the Market Watch capture).

Two reads failed because the relations do not exist — `sector_pnl_residuals` and
`attribution_history`. Those panels degrade to their own no-data paths. Unrelated to this
change, and flagged rather than fixed.

`/api/nexus-theme` is **not** replayed and answers 503, so the theme panel renders its
feed-down path (*"16 themes have momentum pending sync, so this is unconfirmed"*). That is the
honest render for a dark feed and it is what the panel is supposed to say.

The harness is not committed, matching the 2026-09-10 precedent.

