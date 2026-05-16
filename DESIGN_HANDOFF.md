# ATLAS Terminal — Design Handoff & Discrepancy Report

> **Purpose:** Hand off the current state of ATLAS Terminal frontend to a fresh Claude session so it can mediate between what was built and what the user asked for. The user is frustrated and wants this triaged with surgical precision.
>
> **Branch:** `claude/atlas-valuation-screener-LrRAY`
> **PR:** [#543](https://github.com/davenompozolo-blip/Latest-Atlas-Code/pull/543)
> **Latest commit:** `97c68f0` — "design: fix charts page, table fonts, blend palette, spacing"

---

## 1. The Design Spec (target)

The user shared **one image** as the design brief — a PCM page mockup — but explicitly stated:

> *"don't focus on the fact that the PCM is on display here, I'm using it for illustrative purposes here, look at the spacing, the card design, the font, the theme, the colours all the little nice details, this is what I mean, look at it infer everything you need"*

So the PCM mockup is the **design language brief for the whole system**, not just PCM.

### Spec breakdown (what to infer):

| Region | Spec details |
|---|---|
| **Topbar** | Black bg (~#070c16). `ATLAS` in bold teal letterspaced, `TERMINAL` in small grey mono. Breadcrumb `Dashboard ›  PORTFOLIO CONSTRUCTION` (active page in teal-bordered chip). Right cluster: 3 metric pills — `$142,380` (white, Syne ~16-18px) / `+2.34%` (green) / `7.2%` (red), each with tiny grey mono label below (`Portfolio NAV` / `MTD Return` / `Drift Alert`). Thin teal-to-purple gradient line at very top edge. |
| **Sidebar** | Same dark surface. `— SECTION` headers (e.g. `— NAVIGATION`, `— CONSTRUCTION MODULE`, `— PCM LAYERS`, `— TOOLS`). Items: `— Dashboard`, `— Holdings` etc. Active item: full-width teal-tinted bg + `ACTIVE` badge on the right. PCM Layers sub-list shows `L1 IPS Builder ✓` (done = green ✓), `L4 Risk Budget OPEN` (active = teal pill), `L5 Optimizer LOCKED` (locked = grey pill). |
| **Layer strip (PCM)** | 7 cells in a row, separated by vertical dividers. Each: `L#` code at top (teal/green/grey), short abbreviated label below, dot indicator at bottom. Active cell (L4) has a clearly visible teal-tinted background fill + glowing teal dot. |
| **Page header (PCM)** | Tiny teal mono caps `— PORTFOLIO CONSTRUCTION MODULE`. Then huge `Decision Engine` title in Syne 800 (~32-36px white). Below: small grey mono breadcrumb `Integration → Ingestion → Analysis → Output → Allocation Decision  ·  4 of 7 layers complete` (with the count in teal). |
| **Layer cards** | Dark card with subtle border. Header row: small L# badge (square with code in accent colour), name in Syne ~14px white, sub-description in grey mono ~10px, status badge on right (`COMPLETE` green / `IN PROGRESS` teal / `LOCKED` grey), then expand chevron `▼`. Expanded card has an accent border-color (teal for active). |
| **Metric tiles (L4 Risk Budget)** | **2×2 grid**, not 4-across. Each tile is a clean card with all-around subtle border (NO left accent). Label tiny grey mono ALL-CAPS, value HUGE (`18.4%`, `1.34`, `0.18`, `8.2%` — looks like ~40px Syne 800), value in metric accent colour (gold / teal / red / purple respectively), sub-line tiny grey mono. |
| **Position risk table** | Below the metrics. Columns: `Ticker · Weight · Volatility · MRC · % Risk Contribution · Risk Share`. Ticker in teal, weights/vols/MRC in white mono, % risk in colour by severity (>15% red, >10% gold, else green), Risk Share is a horizontal bar in matching colour. |
| **Right panel** | Width ~260px, dark card. Sections separated by `— SECTION` headers: `— Active IPS` (label/value rows), `— Portfolio Snapshot` (2×3 small metric tiles: NAV, Positions, MTD, YTD, Sharpe, Beta), red `● Drift alert: 7.2% aggregate` warning box if drift > threshold, `— Layer Progress` (✓ Done / → Active / ○ Locked), `— Quick Actions` (`SAVE DRAFT` teal-bordered button). |

### Design tokens implied by the spec

- Display font: **Syne** (700-800 weight) — for hero values, page titles, layer names
- Mono font: **JetBrains Mono** — labels, numbers in tables, badges, breadcrumbs
- Body font: **Figtree** (or similar) — paragraphs, descriptions
- Accent colours: **teal `#00c8e0`** primary, **gold `#f4a261`**, **purple `#7b2fbe`**, **red `#e63946`**, **green `#2dc653`**
- Base surface: a single dark slate (`#0a1224`-ish) with subtle radial glow from top-left
- Cards: translucent surfaces (`rgba(255,255,255,0.02-0.04)`) that share the shell gradient — NOT separate flat colours

---

## 2. Current State (what's actually built)

All screenshots taken at viewport `1500×900`, against the current preview build of the branch.

### 2.1 Pages that render with content

| Page | Status | Notes |
|---|---|---|
| **Portfolio Home** | ✅ Renders | 6 hero cards (Positions / Today U/D / Win Rate / Top Concentration / At Risk / Best-Worst) with left-accent borders. NAV history chart, top-holdings donut. Account equity row at top in Syne. Generally close to spec aesthetic. |
| **PCM** | ✅ Renders | 7-layer horizontal strip works. Layer cards render with COMPLETE / LOCKED badges. Right panel shows Active IPS, Layer Progress, Quick Actions (SAVE DRAFT). Decision Engine title in Syne 800. **No drift alert / Portfolio Snapshot tiles** because mock data missing. |
| **Trading** | ⚠️ Partial | Order ticket UI renders but TradingView chart errors out with `Unexpected token '<'` (HTML returned where JSON expected). |
| **Command Centre** | ⚠️ Visual regressions | Page title `Command Centre` and giant `72` health score render in **plain browser sans-serif (default Arial/system)** — NOT Syne. Hero cards have left accents and badges but the title hierarchy is broken. |
| **SQL** | ✅ Renders | SQL Terminal with editor, controls, history tabs — looks reasonably tight. Hero header card has icon badge + title in Syne. |
| **Markets** | ⚠️ Partial | Sub-tabs (OVERVIEW / SECTORS / NEWS / CALENDAR / REGIME / CROSS-ASSET) render. But `Market Watch` page title is **plain sans-serif** and data fails with `Market data unavailable. Check /api/macro or FRED/Finnhub API keys`. |
| **Options** | ⚠️ Partial | Tabs render (Payoff Diagram / Strategy Builder / IV Surface). Contract list errors with `Unexpected token '<'`. Title `OPTIONS ANALYSIS / AAPL` renders. |
| **Equity** | ⚠️ Partial | Search box and "Analyse" button render. Title `Equity Research` is **plain sans-serif**. Just shows placeholder text. |
| **Valuation** | ⚠️ Empty | `Connect Supabase to load screener data` placeholder only. |

### 2.2 Pages that show empty-state (data missing in mock)

| Page | Why |
|---|---|
| Performance Suite | `if (!hasNav && !hasPerf) return EmptyState` — mock data lacks nav series |
| Quant Dashboard | Same data dependency |
| Risk Analysis | Same |
| Equity / Macro / Funds | Need live API data |
| Scrapbook | Needs Supabase |

**Critical implication:** Empty-state masks UI regressions. The user only sees these pages working with live data on Vercel. Anything regressed in those pages won't show in screenshots.

### 2.3 What was actually fixed in this PR

| Fix | Verified |
|---|---|
| **Hero card CSS system added** — `.hero-card`, `.hc-icon`, `.hc-label`, `.hc-value`, `.hc-badge` + `.b-excellent/positive/good/fair/poor` variants. Left-border accent in metric colour. Previously entirely missing → unstyled tiles across 6+ pages. | ✅ Portfolio Home screenshot confirms |
| **`.ac-*` chart CSS added** — 35+ classes for advanced-chart.js (pill groups, timeframe buttons, toggle, series list, overlay checkboxes, stat cards, canvas). Previously entirely missing → user saw raw unstyled text on Charts sub-tab. | ✅ Verified in isolation HTML test |
| **Loading spinner / empty state / narrative strip CSS** — also previously missing | ✅ Visible on Performance / Quant empty states |
| **Topbar redesign** — `ATLAS TERMINAL` inline logo, `Dashboard › ACTIVE` breadcrumb, 3-metric right strip (NAV / MTD / Total Return), teal-to-purple accent line at top edge | ✅ Every screenshot |
| **Sidebar redesign** — `— SECTION` headers with teal dash prefix, `— ITEM` / `▶ ITEM` nav items, `ACTIVE` badge on selected | ✅ Every screenshot |
| **PCM metric tiles** — 40px Syne 800 values, clean all-around border (no left accent), 2×2 grid | ✅ PCM screenshot |
| **PCM layer strip** — active cell with solid teal fill + glowing dot | ✅ PCM screenshot |
| **Background blend** — single `#0a1224` base + radial glow (teal top-left, purple bottom-right). Topbar/sidebar/content all transparent. | ✅ Visible cohesion in screenshots |
| **Global font inheritance** — `button/input/select/table/td/th/tr` now `font-family: inherit` to fix Times New Roman regression in form/table elements | ⚠️ Need to verify with a populated table |
| **`tabular-nums`** — added to topbar metrics, hero values, mono utilities | ✅ |

---

## 3. Discrepancies — Current vs Spec

These are the gaps that remain. Numbered for triage:

### G1 — **Page titles are plain sans-serif, not Syne**

**Spec says:** Page titles like `Decision Engine` are big bold Syne 800.
**Current:** On Command Centre the title `Command Centre` and the giant `72` Health Score number render in browser default Arial/system sans. Same on `Market Watch`, `Equity Research`, `Options Analysis`.

**Cause:** Individual page components (`pages-other.js`, `market-watch.js`, `equity-research.js`, `options-analysis.js`) use plain `<h1>`/`<h2>` or inline-styled divs with no `fontFamily`. The CSS `h1/h2` rules in globals.css set `font-family: var(--font-display)` but pages override or bypass them.

**Fix scope:** Audit each page module, force `font-family: var(--font-display)` on titles, or add a `.atlas-page-title` class with `!important` and use it everywhere.

### G2 — **Hero card value font is inconsistent**

**Spec says:** All big metric values should match — they share one display font (Syne).
**Current:** Portfolio Home hero cards use Syne (via `.hc-value` class). But Command Centre's metric cards use **JetBrains Mono** for the big `$119,500.00` (set inline at `performance-suite.js:149` and similar). The user specifically asked: *"could you make the font in the hero cards the same as the main bar that shows account equity and all other details please"*.

**Cause:** Each page has inline `fontFamily: 'JetBrains Mono'` on its hero number. The `.hc-value` class fix only works for components that *use* the `HeroCard` React component — pages with their own inline-styled cards bypass it.

**Fix scope:** Either (a) refactor every page to use the shared `HeroCard` component, or (b) globally apply Syne to all `.atlas-card .value`-style elements. Simpler: do an audit-and-replace on `fontFamily: 'JetBrains Mono'` for hero-sized values across `performance-suite.js`, `pages-other.js`, `portfolio-home.js`'s account equity strip, etc.

### G3 — **Tables / forms / inputs sometimes render Times New Roman**

**Spec implies:** Everything is JetBrains Mono or Figtree.
**Current:** I added a global `button, input, select, textarea, table, th, td, tr { font-family: inherit; }` rule which *should* fix this, but I couldn't verify it with mock data because most tabular pages show empty-state. The user reported seeing it; the rule is in place but unverified in production.

**Fix scope:** Visually verify on Vercel preview against live data. If still broken, the issue is that some table cells have inline `style={{ fontFamily: 'serif' }}` or a missing rule on `<tbody>`.

### G4 — **Components hug edges; spacing inconsistent**

**Spec says:** Generous breathing room — topbar has padding, content has page padding, cards have proper internal padding.
**Current:** I bumped topbar padding to 22px and sidebar top to 14px, but each *page* manages its own internal padding inline. Portfolio Home pads 0/24 in some spots. PCM pages pad 20/24. Markets pads 0/24. Inconsistent. The "topbar hugs the sidebar" complaint refers to the lack of a clear separator between them — they currently share a border edge with no visual gap.

**Fix scope:** Add a single `.page-wrap { padding: 20px 24px; gap: 16px; display: flex; flex-direction: column; }` class and apply it to every page root. Remove the per-page inline padding. Optional: add `box-shadow` under the topbar to give it visual elevation over the body.

### G5 — **Charts page hasn't been verified live**

**Spec doesn't directly cover Charts**, but the user explicitly called it out: *"Charting is completely f*cked as well, look at the state of the advanced charts."*
**Current:** I added 35+ `.ac-*` classes and verified them in an isolated HTML test against the built CSS. They render correctly. But the live Charts sub-tab (Performance Suite → CHARTS) only renders when there's nav data, which the mock lacks.

**Fix scope:** Verify on Vercel preview with live data. The CSS is in place; if something still looks off it's a content-layout issue inside `advanced-chart.js`, not missing CSS.

### G6 — **Topbar right-side metrics show `—` because mock data is missing fields**

**Spec shows:** `+2.34%` MTD Return and a 7.2% Drift Alert.
**Current:** Topbar shows `$119,500.00` (NAV ✓) but `—` for MTD Return and `—` for Total Return because `MOCK_COMMAND` doesn't include `mtd_return_pct`. Also there's no "Drift Alert" metric wired up at all — I substituted "Total Return".

**Fix scope:** (a) add the missing fields to `MOCK_COMMAND` in `src/pages/config.js` so the topbar looks complete in demo mode; (b) decide whether to swap the third metric back to a drift-alert calculation per the spec.

### G7 — **Data-dependent pages all show empty-state in mock**

Performance / Quant / Risk / Equity / Macro / Funds / Valuation all show the same `⚠ No data available — run Alpaca sync first` empty state. The user only sees these populated on Vercel.

**Fix scope:** Either (a) seed `MOCK_COMMAND` and add mock `vw_portfolio_nav_daily` rows so every page has *something* to render in demo mode — useful for catching CSS regressions during dev, or (b) accept that demo mode = unconnected and use Vercel preview as the only visual ground-truth.

### G8 — **Trading / Options chart-data errors aren't styling issues**

The `Unexpected token '<'` JSON parse errors are API-level issues — endpoints returning HTML (probably a 404 page) instead of JSON. Out of scope for design, but they impact the user's perception of "this build is broken".

---

## 4. The User's Gripes — In Their Own Voice

Direct quotes from the conversation, ordered by how strongly they were expressed:

> *"This is the same image I shared earlier of the target design. We're still very far off... no plan has been followed for how the hero cards are handled, how spacing is handled, and it just looks VASTLY different from what I was shown. The instruction was clear, I want Atlas to have that SAME design, recall no deviations, I want my system to look like that."*

> *"Sorry that I'm being a bit harsh, but I was not expecting complications on this scale, this was the easy part of our build, front-end design, I thought that was your bag :("*

> *"Overall this build lacks tightness and consistency, I need you to be surgical, precise, and innovative. Please lets get this run right. I also need you to visually test what you build, it hurts getting my hopes up and seeing that we're a million miles away."*

> *"Charting is completely f*cked as well, look at the state of the advanced charts."*

> *"some tables it looks like Times New Roman and others not."*

> *"some of the components and the background feel like they're from 2 different systems, background is a little too dark, I'd like a blend so that components feel like they're a part of the same system."*

> *"the bar up top that hugs the sidebar, this is the case for a lot of things."*

> *"could you make the font in the hero cards the same as the main bar that shows account equity and all other details please."*

> *"if we don't get it right on this attempt, I'm going to have to rope in the other version of Claude to help."*

### Synthesised gripe list (priority order)

1. **Inconsistency** — fonts vary between components (Times Roman in some tables, mono vs display in hero values, plain sans-serif in page titles). The user wants ONE system, not visual collage.
2. **Lack of tightness** — spacing isn't deliberate. Components hug edges. Padding is per-page, not systemic.
3. **Design brief was ignored** — the PCM mockup was supposed to be the language for the *whole* system. Specific elements like hero card design and spacing weren't followed elsewhere.
4. **Broken pages** — Charts page had no CSS at all (fixed in this PR but not yet verified live).
5. **No visual testing** — multiple times the assistant claimed a fix was complete without screenshotting; the user kept seeing it broken on Vercel and got progressively more frustrated.

---

## 5. Recommendations for the Next Session

Triaged by ROI:

**Quick wins (≤1 hour, high visibility):**
1. **G1 + G2 together:** Sweep every page component and force `font-family: var(--font-display)` on hero titles and big metric values. One regex audit catches all the inline `fontFamily: 'JetBrains Mono'` on Syne-sized text. This single fix removes most of the "looks like 2 different systems" complaint.
2. **G6:** Populate `MOCK_COMMAND` with `mtd_return_pct: 0.024, ytd_return_pct: 0.118, sharpe_ratio: 1.18, drawdown_pct: -0.072` etc. — gets the topbar looking complete in demo too.
3. **G4:** Introduce `.page-wrap` utility + apply to every page's outermost div. Standardises gutter, gap, and top padding everywhere.

**Medium effort (~half-day):**
4. **G7:** Seed mock nav data (~60 points of synthetic NAV history) into `MOCK_NAV` in config.js so Performance / Quant / Risk / Charts pages render in demo mode. **This is the unlock** — once these render, regressions are visible without needing Vercel.
5. **G5 verification:** Once #4 is in, screenshot Charts page and verify the `.ac-*` CSS is actually doing what the isolated test promised.

**Larger investments:**
6. **G3:** Build out a `tests/visual/` directory with Playwright snapshot tests against every page. CI-enforced visual diff prevents regressions.
7. Consider extracting a `Card`, `HeroCard`, `MetricTile`, `PageTitle` set of shared React components that *every* page uses, instead of every page rolling its own inline-styled card. The current state is fragile because every page is its own design system.

---

## 6. Files / artefacts referenced

- `src/styles/globals.css` — design tokens + all shared CSS
- `src/pages/app.js` — topbar, sidebar, app shell
- `src/pages/portfolio-construction.js` — PCM (the spec illustration)
- `src/pages/components.js` — shared `HeroCard`, `Loading`, `EmptyState`, `NarrativeStrip`, `SyncStatusPill`, `RefreshButton`
- `src/pages/utils.js` — `fmt`, `fmtPct`, `fmtCurrency`, `heroBadgeCls`
- `src/pages/config.js` — `sb`, `loadView`, `MOCK_COMMAND`, `MOCK_POSITIONS`
- `src/pages/advanced-chart.js` — the previously-broken Charts component (CSS now in place)
- `src/pages/performance-suite.js` — KPI bar with inline JetBrains Mono on hero values (**G2**)
- `src/pages/pages-other.js` — `CommandCentre` with plain sans-serif title (**G1**)

### Screenshots captured during this audit

Saved to `/tmp/audit_*.png` on the build agent. Key ones:
- `a1_portfolio.png` — Portfolio Home (best-looking page)
- `a7_command.png` — Command Centre (shows G1 and G2 clearly)
- `a13_pcm.png` — PCM page (closest to spec)
- `a3_performance.png` — Performance empty state (mock data limit)
- `a11_markets.png` — Markets with sub-tabs (shows G1)
