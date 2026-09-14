# D1 — Growth × Inflation quadrant: consumer inventory

Master spec §3. **Read-only. Nothing removed.** 2026-09-14, against `main` @ `10c358f`.

**Verdict: D2 waits.** Consumers other than the regime tab read the quadrant label, so
§3's own condition for holding D2 is met. Three D3 migrations are required first.

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
| 1 | D1 inventory reported | **done — this document** |
| 2 | Quadrant absent from the regime tab; screenshot | Nexus Regime tab: done 2026-09-10. Macro dashboard and Market Watch: **not done** |
| 3 | No table dropped, no label deleted; retirement recorded | no stored labels exist; `api/macro.js` and `NexusRegime.js` carry the retirement record |
| 4 | Every D1 consumer migrated or reported as blocked | **4 live consumers, none migrated** |
| 5 | Nothing on the regime tab asserts a single regime label | true of the Nexus Regime tab; **false of the other two tabs** |
