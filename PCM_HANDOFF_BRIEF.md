# ATLAS Terminal — Current State Report & PCM Module Handoff Brief

**Prepared for:** the Claude instance building the Portfolio Construction Module (PCM)
**Branch:** `main` @ `cccfe6e` (pre-Vite CDN React build)
**Date:** 2026-05-16

---

## 1. WHY THIS DOCUMENT EXISTS

The previous attempt at the PCM module ran into deep problems because its spec assumed:
- A Vite + ESM build pipeline (`npm run build` → `dist/`)
- A Tailwind-style utility class system
- Design tokens like `--font-display`, `--teal`, `--navy`, `--gold`, scrapbook-style cards with `rgba(255,255,255,0.03)` backgrounds
- A separate `src/styles/globals.css` design system
- A `src/pages/` source layout
- Modern React JSX with hooks-as-syntax (`const [x, setX] = useState()`)

**None of that is true on `main` anymore.** Production has been rolled back to the pre-Vite CDN React build. **Adjust the PCM spec to match the actual build below before writing any code.**

---

## 2. ACTUAL BUILD SYSTEM

```json
// vercel.json
{
  "framework": null,
  "installCommand": "echo 'skip install'",
  "outputDirectory": "public",
  "buildCommand": "node inject-env.js",
  "rewrites": [
    { "source": "/command-centre", "destination": "/command-centre/index.html" },
    { "source": "/status",         "destination": "/status/index.html" },
    { "source": "/",               "destination": "/index.html" }
  ]
}
```

- **No bundler.** No Vite, no Webpack, no Babel.
- **No npm packages in the browser.** `package.json` only declares `@supabase/supabase-js` for the `scripts/sync-wrapper.mjs` Node script — it is never bundled.
- **All libraries are loaded via CDN** in `public/index.html`:
  - React 18 UMD (production min)
  - Chart.js 4
  - Plotly 2.35.2
  - TradingView Lightweight-Charts 5.2.0
  - Supabase JS v2
- **Build step** is a single string replace: `inject-env.js` swaps the Supabase anon key into `public/js/config.js`.
- **Page modules** are native ES modules — browsers parse them directly:
  ```html
  <script type="module" src="js/app.js"></script>
  ```
- **JSX is NOT used.** Every component is plain JS with `React.createElement()` (often aliased to `h`).

---

## 3. FILE LAYOUT

```
public/
  index.html              ← entry; contains the ENTIRE design system in a <style> block
  js/
    app.js                ← root <App/>, TABS registry, NAV_STRUCTURE
    config.js             ← Supabase client, loadView(), MOCK_* fallbacks
    components.js         ← shared atoms (HeroCard, Loading, EmptyState, SyncStatusPill…)
    utils.js              ← formatters (fmtPct, fmtCurrency, cls, heroBadgeCls)
    portfolio-home.js     ← page component, exports PortfolioHome
    pages-other.js        ← RiskAnalysis, CommandCentre
    performance-suite.js  ← PerformanceSuite
    quant-dashboard.js, quant-correlation.js, quant-drawdown.js, …
    valuation-hub.js, valuation-house.js, valuation-screener.js
    scrapbook.js          ← canonical "calm" design reference (see §6)
    trading.js, options-analysis.js, equity-research.js, macro-dashboard.js,
    funds-dashboard.js, market-watch.js, sql-terminal.js
api/
  *.js                    ← Vercel serverless functions (claude-analyse, claude-sector, equity, macro, screener-market, …)
```

**There is no `src/` directory in the production build path.** Anything under `src/` was Vite-era and is no longer deployed.

---

## 4. DESIGN SYSTEM — CANONICAL REFERENCE

The entire CSS lives **inline in `public/index.html`** between `<style>…</style>`. ~1,196 lines, ~122 unique classes. Treat that file as the single source of truth.

### 4.1 Design Tokens (CSS variables on `:root`)

```css
--bg:           #070814;   /* App background */
--card:         #0d0f1a;   /* Card background */
--card-border:  rgba(255, 255, 255, 0.06);
--cyan:         #00d4ff;   /* Primary accent — active nav, hover glow */
--indigo:       #6366f1;
--violet:       #8b5cf6;
--green:        #10b981;   /* Positive returns */
--red:          #ef4444;   /* Negative returns */
--amber:        #f59e0b;   /* Neutral / warning */
--text:         rgba(255,255,255,0.92);
--text-sec:     rgba(255,255,255,0.52);
--text-muted:   rgba(255,255,255,0.28);
```

### 4.2 Typography

| Token / Use | Font | Weights |
|-----|------|---------|
| Body / nav | `'DM Sans', -apple-system, sans-serif` | 400–700 |
| Numbers, metric values, table cells | `'JetBrains Mono', monospace` | 400–800 |
| Page titles, large branded text | `'Syne', sans-serif` | 600–800 |

All three loaded from Google Fonts via `<link>` in `public/index.html`.

### 4.3 Core component classes — USE THESE, DO NOT REINVENT

| Class | Purpose | Key styling |
|------|---------|-------------|
| `.app-container` | Outer flex column | `min-height:100vh` |
| `.top-bar` | Branded header | flex row, status badges, sync pill |
| `.body-layout` | Sidebar + content flex container | `display:flex; overflow:hidden` |
| `.sidebar` | Left nav | `width:180px`, `border-right: 1px solid var(--card-border)` |
| `.nav-item` | Sidebar button | 12×20 padding, `border-left: 3px solid transparent`; `.active` → cyan border + bg |
| `.main-content` | Page wrapper | `padding:24px; overflow-y:auto; flex:1` |
| `.content-with-sidebar` | Two-column layout | `grid-template-columns: 1fr 320px` |
| `.page-title` | Page header | Syne 22px 700, letter-spacing 1px |
| `.metrics-row` | Top-of-page metric grid | `grid auto-fit minmax(200px,1fr); gap:16px` |
| **`.metric-card`** | **Headline metric tile** | `var(--card)` bg, 1px border, **radius 12px**, padding 20px, hover lift |
| `.metric-card .label` | Tile label | 11px UPPERCASE, `--text-muted`, letter-spacing 1px |
| `.metric-card .value` | Tile value | 24px JetBrains Mono 700 |
| `.metric-card .sub` | Tile sub-text | 12px `--text-sec` |
| **`.card`** | **Generic content card** | `var(--card)` bg, 1px border, **radius 12px**, padding 24px, hover → border brightens |
| `.card-title` | Card heading | 10px JetBrains Mono 700 UPPERCASE, letter-spacing 2px, bottom border |
| `.data-table` | All tabular data | 13px; th = 11px UPPERCASE Mono; td = JetBrains Mono; sticky header |
| `.positive` / `.negative` / `.neutral` | Numeric coloring | green / red / amber |
| `.badge`, `.badge.green/red/amber/blue` | Pill labels | 11px 600, semi-transparent fill |
| `.hero-card` | Featured metric (top-of-page accent) | Cyan accent stripe via `.accent-cyan` modifier; built via `<HeroCard>` in `components.js` |
| `.chart-container`, `.chart-pane` | Plot wrappers | |
| `.empty-state`, `.loading-spinner`, `.error-state` | Stateful placeholders | use the `<EmptyState>` / `<Loading>` components |

**Do NOT introduce new classes for things these already cover.** If you need a metric tile, use `.metric-card`. If you need a content section, use `.card`. If you need a table, use `.data-table`. Adding `.pcm-metric-tile` or similar is the path back to the redesign mess.

### 4.4 Animation primitives

- `fadeInUp` — used by `.metric-card`, `.card`. Already staggered by `:nth-child`.
- `fadeIn` — used by `.data-table tbody tr`.
- `glowPulse` — used by status pill `.dot`.
- `shimmer` — used by top gradient line.

Don't add new keyframes for similar effects.

---

## 5. COMPONENT PATTERN — HOW PAGES ARE WRITTEN

Every page module looks like this. **Match this pattern exactly.**

```js
// public/js/pcm.js
// ============================================================
// ATLAS Terminal — Portfolio Construction Module
// ============================================================

import { sb, loadView, MOCK_COMMAND } from './config.js';
import { fmtPct, fmtCurrency } from './utils.js';
import { Loading, EmptyState, HeroCard } from './components.js';

const { useState, useEffect, useMemo } = React;
const h = React.createElement;       // alias is conventional; some files use React.createElement directly

export function PortfolioConstructionModule() {
    var _r = useState(null);
    var rows = _r[0];
    var setRows = _r[1];

    useEffect(function() {
        loadView('vw_pcm_universe', []).then(setRows);
    }, []);

    if (!rows) return h(Loading, null);
    if (!rows.length) return h(EmptyState, { message: 'No PCM data — run sync first' });

    return h('div', null,
        h('div', { className: 'page-title' }, 'PORTFOLIO CONSTRUCTION'),
        h('div', { className: 'metrics-row' },
            h('div', { className: 'metric-card' },
                h('div', { className: 'label' }, 'Universe Size'),
                h('div', { className: 'value' }, rows.length),
                h('div', { className: 'sub' }, 'after filters')
            )
            // ... more metric-cards
        ),
        h('div', { className: 'card' },
            h('div', { className: 'card-title' }, 'Layer 1 — Investability'),
            // ... table or chart
        )
    );
}
```

### Hard constraints when writing components

1. **No JSX.** Use `React.createElement` (or alias `h`). The browser does not transpile.
2. **Hooks via `React.useState` destructuring**, NOT array destructuring:
   ```js
   var _s = useState(initial); var x = _s[0]; var setX = _s[1];
   ```
   Reason: avoids `const [x, setX] = useState()` which is fine syntactically but matches the existing codebase style for git-diff sanity.
3. **No new CSS files.** If a style truly cannot be expressed with existing classes, use inline `style={...}` sparingly.
4. **No npm packages.** If you need a library, add a CDN `<script>` to `public/index.html` and document why.
5. **Demo-mode safety.** Every `loadView()` call must accept a `MOCK_*` fallback so demo mode renders without Supabase.
6. **Register the page** in `public/js/app.js`:
   - Add to `TABS` array (id, label, sub, icon, component)
   - Add to `NAV_STRUCTURE` under an appropriate header
7. **Import from existing modules** — don't reimplement formatters, sync pill, hero card, etc.

---

## 6. SCRAPBOOK IS *NOT* THE DESIGN BLUEPRINT

In the previous redesign session, "Scrapbook Card pattern" (rgba(255,255,255,0.03) bg, 8px radius, no accent strip) was treated as canonical. **It is one page's local style, not the system.** The actual system is in `public/index.html` and uses `.metric-card` / `.card` at **12px radius** with `var(--card)` (`#0d0f1a`) backgrounds. Use the system, not Scrapbook's local choices.

---

## 7. DATA LAYER

- **Live data:** `loadView(viewName, fallback)` from `config.js` — reads a Supabase view via the anon key.
- **Mock data:** `MOCK_POSITIONS`, `MOCK_COMMAND` in `config.js`. Add `MOCK_PCM_*` exports there for the PCM module's fallback.
- **Refresh bus:** dispatch `window.dispatchEvent(new CustomEvent('atlas:refresh'))` to re-run all subscribed loaders.
- **Data-mode flag:** `window.__ATLAS_DATA_MODE__` is `'live'` if any view returned rows, else `'mock'`.

The PCM module should expose Supabase views like `vw_pcm_universe`, `vw_pcm_scored`, `vw_pcm_portfolio` — created via Supabase migrations, NOT computed in the browser.

---

## 8. WHAT TO ADJUST IN THE PCM SPEC

Concrete changes the other Claude must make before writing any code:

1. **Drop all Vite/JSX/Tailwind assumptions.** Output is CDN React + `React.createElement`.
2. **Drop the `src/styles/globals.css` design references.** Use `public/index.html` classes (`.metric-card`, `.card`, `.data-table`, `.badge`, `.page-title`).
3. **Drop the design tokens `--teal`, `--navy`, `--gold`, `--font-display`.** Use `--cyan`, `--bg`, `--card`, `--amber`, `'Syne'`, `'JetBrains Mono'`, `'DM Sans'`.
4. **Drop Scrapbook-card styling** (3% white bg, 8px radius). Use the 12px-radius `.card` / `.metric-card` defaults.
5. **Drop any `src/pages/pcm.js` path.** New file is `public/js/pcm.js`.
6. **Register PCM in `public/js/app.js`** — both `TABS` and `NAV_STRUCTURE` (probably under the `VALUATION` header next to Scrapbook, or in its own `PORTFOLIO` group below `Trading`).
7. **All hooks use `useState`/`useEffect`/`useMemo` from `const { useState, useEffect, useMemo } = React;`**, not `import { useState } from 'react'`.
8. **No new keyframes, no new colors, no new fonts.** Reuse what exists.
9. **All `loadView()` calls have a mock fallback in `config.js`**.
10. **Backend logic** (7-layer scoring) belongs in Supabase views or `/api/*.js` serverless functions, not in browser code.

---

## 9. SUCCESS CRITERIA (what "done right" looks like)

- A new `public/js/pcm.js` file exporting `PortfolioConstructionModule`.
- Added to `TABS` + `NAV_STRUCTURE` in `public/js/app.js`.
- Uses **only existing CSS classes** from `public/index.html`. Zero new selectors.
- Uses **only existing components/utils** from `components.js` / `utils.js`. Adds new shared atoms only if reused by another module.
- Demo mode renders the page with sensible mock data; no console errors with `sb = null`.
- Live mode reads from `vw_pcm_*` Supabase views.
- Visual diff against the rest of the terminal (Portfolio, Quant, Performance) is consistent — same fonts, same card style, same nav rhythm.
- No `npm install` required. No `vite build`. Just push and Vercel serves `public/`.

---

## 10. ONE-LINE TL;DR FOR THE OTHER CLAUDE

> The ATLAS production build is **CDN React in `public/`, no bundler, no JSX, all CSS inline in `public/index.html`**. Reuse `.metric-card` / `.card` / `.data-table` / `.page-title`, register the page in `app.js`, and put scoring logic in Supabase views — don't invent a new design system.
