# ATLAS — Platform Ground Truth

> **Why this file exists.** External reviews (and the root `ARCHITECTURE.md`,
> which still describes the retired Streamlit app) keep mis-stating what ATLAS
> actually is, because the repo carries a lot of legacy code that is no longer
> in the live path. This document is the **verified** state of what is built and
> deployed, established by tracing real config and execution paths — not by
> reading the file tree. Trust this over the root `ARCHITECTURE.md` (Streamlit-era,
> stale) and over any review that infers architecture from filenames.

_Last verified: 2026-06 (against production Vercel projects + Supabase
`vdmojjszvvcithuxwexx`)._

---

## 1. What ATLAS actually is (today)

A **bundled Vite + React single-page app** served by Vercel, talking to
**Supabase** (Postgres + Edge Functions) and a set of **Vercel Node serverless
functions** under `api/`. Market-data ingestion runs on **Supabase Edge
Functions** (Deno/TypeScript) on `pg_cron` + Vercel Cron + GitHub Actions
schedules. There is **no live Python** and **no live Streamlit**.

### Frontend — bundled Vite, not CDN
- `vercel.json` → `"framework": "vite"`, `"buildCommand": "npm run build"`,
  `"outputDirectory": "dist"`. `vite.config.js` is present. `index.html` loads a
  single module entry: `<script type="module" src="/src/main.jsx">`.
- `zustand@^5` is a declared dependency.
- **Code style is a CDN-era holdover, not a CDN runtime:** ~67 files under
  `src/` use `const h = React.createElement` (no JSX). This is ergonomics, not
  the build mechanism — the app is bundled by Vite.
- **Dead code:** `public/js/*.js` is the *old* CDN/vanilla build. It is copied
  verbatim into `dist/` but **nothing imports it** (the SPA entry is
  `src/main.jsx` → `src/pages/app.js`). Safe to delete.

### Data orchestration — Edge Functions + Vercel serverless
- **14 Supabase Edge Functions deployed** (live): `sync_alpaca_prices`,
  `sync_alpaca_positions`, `sync_funddata_prices`, `sync_fundamentals`,
  `sync_portfolio_history`, `sync-listing-status`, `compute_ticker_derived`,
  `enrich_assets`, `generate_cortex_signals`, `cortex_pretrade_risk`,
  `synthesize_thesis`, `claude_sql_assistant`, `database-access`,
  `probe_investing`.
- **25 Vercel Node functions** under `api/*.js` (e.g. `claude-analyse`,
  `macro`, `equity`, `ledger-snapshot`, `sync-valuations`, `nexus-*`).
- **Schedules:** Vercel Cron (`vercel.json` → `ledger-snapshot`,
  `sync-valuations`, `options-snapshot`), `pg_cron` (matview refreshes:
  `mv_nexus_holdings`, `mv_cortex_screener`), and GitHub Actions (Alpaca sync,
  per `CLAUDE.md`).

### Legacy / dead code (NOT in any live path)
- **200+ Python files** — `atlas_app.py`, `ui/pages/*.py`, `analytics/`,
  `services/` (incl. `services/market_data/`), `core/*.py`, `api/routers/*.py`
  (FastAPI), `scheduler/`, `legacy/`, `requirements*.txt`. **Zero are referenced
  by `vercel.json`.** This is the retired Streamlit + an exploratory FastAPI
  layer. Any claim that `services/alpaca_sync.py` / `data_normalizer.py` is in
  the live data path is **false** — ingestion is the Edge Functions above.
- `public/js/*` — old CDN frontend (see above).
- Root `ARCHITECTURE.md` — describes the Streamlit monolith; **stale**.

> **Reviewer note:** a previous Gemini review inferred a "Python backend +
> Vite/Zustand frontend" from a screen-share of the file tree. The Vite/Zustand
> half was right; the live-Python half was legacy debris mistaken for the live
> path. Don't diagnose runtime bugs against the Python files.

---

## 2. Environments & deployment topology

The single repo currently **auto-deploys to 6 Vercel projects** (all tracking
`main`), configured inconsistently — a hazard, since a user can land on a clone
that is missing keys and get hard 500s:

| Vercel project | Domain | `ANTHROPIC_API_KEY` | Notes |
|---|---|---|---|
| `latest-atlas-code` | `latest-atlas-code.vercel.app` (clean) | ❌ missing | owns the nice domain |
| `latest-atlas-code-o19a` | `latest-atlas-code-o19a.vercel.app` | ✅ set | **daily-driver / canonical in practice** |
| `latest-atlas-code-9odn` | … | ❌ | duplicate |
| `latest-atlas-code-aceu` | … | ❌ | duplicate |
| `latest-atlas-code-amyn` | … | n/a | rootDir `atlas_quant_dashboard`, 404s |
| `altas_hub` | … | n/a | 404 / broken |

- **Supabase:** project `vdmojjszvvcithuxwexx` (single, shared). This is the
  production daily-driver instance — treat as untouchable for any multi-tenant
  experiment (use a *new* project/org).

See `docs/SCALE_ROADMAP.md` for the consolidation plan.

---

## 3. Environment variable manifest

Authoritative set, derived by grepping every `process.env.*` (Vercel functions),
`Deno.env.get` (Edge Functions), and `import.meta.env.*` (Vite build). Use this
when configuring the surviving Vercel project so nothing is missed.

### 3a. Naming drift to fix
The Supabase URL/key is referenced under **multiple aliases** — a direct cause
of per-project config drift. Standardize on one set and delete the rest:

| Concept | Aliases found in code | Recommended canonical |
|---|---|---|
| Supabase URL | `SUPABASE_URL`, `ATLAS_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `VITE_SUPABASE_URL` | `VITE_SUPABASE_URL` (frontend) + `SUPABASE_URL` (server) |
| Supabase anon key | `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_KEY`, `ATLAS_SUPABASE_KEY` | `VITE_SUPABASE_ANON_KEY` (frontend) + `SUPABASE_ANON_KEY` (server) |
| Supabase service role | `SUPABASE_SERVICE_ROLE_KEY` | unchanged (server-only secret) |

`NEXT_PUBLIC_*` are Next.js-era leftovers (app is Vite now) — retire them once
nothing reads them.

### 3b. By surface

**Vercel — Frontend (Vite build-time, `import.meta.env`, PUBLIC):**
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_KEY`

**Vercel — Node functions (`api/*.js`, server-side SECRETS):**
- Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  (+ legacy aliases `ATLAS_SUPABASE_URL/KEY`, `NEXT_PUBLIC_SUPABASE_*`)
- LLM: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`
- Market data: `ALPACA_API_KEY`, `ALPACA_API_SECRET`, `ALPACA_PAPER`,
  `ALPHA_VANTAGE_API_KEY`, `FINNHUB_API_KEY`, `FRED_API_KEY`, `EDGAR_CONTACT_EMAIL`
- Ops/cron: `CRON_SECRET`, `SYNC_ORIGIN`, `SYNC_THROTTLE_MS`,
  `OPTIONS_THROTTLE_MS`, `ATLAS_ALLOWED_ORIGIN`
- GitHub (self-write features): `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_TOKEN`
- Vercel API (where used): `VERCEL_TOKEN`, `VERCEL_TEAM_ID`,
  `VERCEL_PROJECT_ID`, `VERCEL_PROJECT_NAME` (+ runtime-injected `VERCEL_ENV`,
  `VERCEL_REGION`)

**Supabase — Edge Functions (`Deno.env.get`):**
- Auto-injected by Supabase (do **not** set manually): `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`
- Must set as function secrets: `ALPACA_API_KEY`, `ALPACA_API_SECRET`,
  `ALPHA_VANTAGE_API_KEY`, `FINNHUB_API_KEY`, `ANTHROPIC_API_KEY`
  (used by `synthesize_thesis`)

> Set the Vercel vars for **both Production and Preview** — Preview-only keys
> were part of why behaviour differed between projects.

---

## 4. Tenancy & security posture (single-tenant by construction)

Verified against the production DB. This is fine for a one-operator terminal and
**disqualifying for multi-user** — it is why the multi-tenant build is a clean
new repo/Supabase, not a retrofit (see `docs/SCALE_ROADMAP.md`).

- **No authentication.** `auth.users` = **0 rows**; the frontend has no
  `signIn` / `auth.uid` / `onAuthStateChange` usage.
- **No tenant model.** 63 public tables; only **5 columns** named
  `user_id`/`owner_id`/`tenant_id` across the whole schema.
- **Open RLS.** 48/63 tables have RLS enabled but **21 anon policies are
  `USING (true)`**; **15 tables have RLS disabled** entirely.
- **Supabase security advisor:** **46 ERROR / 41 WARN**, incl. 31 SECURITY
  DEFINER views, 17 always-true policies, 10 anon/authenticated-executable
  definer functions, materialized views exposed to the API.

---

## 5. The pure modules worth reusing verbatim

These are side-effect-free and safe to lift into the multi-tenant repo unchanged
(keeps numbers identical across instances):
- `src/lib/fairValueComposite.js` — deterministic fair-value composite.
- `src/pages/nexus/nexus*Compute.js` — Nexus compute (pure, unit-tested).
- The calculation semantics in `core/calculations.py` (DCF/VaR/attribution) —
  port the math, not the single-tenant queries around it.
