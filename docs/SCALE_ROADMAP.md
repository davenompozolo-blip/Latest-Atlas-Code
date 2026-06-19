# ATLAS — Scale Roadmap

Two independent tracks. **Track 1** cleans up the *current* production so it
stops being fragile and confusing. **Track 2** builds the *multi-tenant product*
greenfield, in parallel, without touching production. **Track L** (licensing)
runs alongside and blocks neither.

Ground truth this plan is built on: `docs/PLATFORM_GROUND_TRUTH.md`.

Owner key: 🧑 = manual (Vercel/Supabase dashboard) · 🤖 = Claude Code can do/verify.

---

## Track 1 — Consolidate production (collapse 6 Vercel projects → 1)

**Goal:** one production project, correctly configured, no clones a user can
accidentally hit. **Non-goal:** any architecture change — this is hygiene.

### 1.1 Pick & configure the survivor
- [ ] 🧑 Choose the survivor. Recommended: keep **`latest-atlas-code-o19a`**
      (already has the working env) and **move the `latest-atlas-code.vercel.app`
      domain onto it** (Vercel won't let two projects share a domain, so remove
      it from the old project first), or rename for a clean URL.
- [ ] 🤖 Hand over the env manifest (`PLATFORM_GROUND_TRUTH.md §3`) — done.
- [ ] 🧑 Set the **full** env set on the survivor for **Production *and*
      Preview** (the Supabase aliases, `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL`,
      all market-data keys, `CRON_SECRET`, `ATLAS_ALLOWED_ORIGIN`).
- [ ] 🧑 Set Edge Function secrets on Supabase (vendor keys + `ANTHROPIC_API_KEY`).

### 1.2 Kill the clones
- [ ] 🧑 Disconnect Git / delete `latest-atlas-code` (after domain move),
      `9odn`, `aceu`, `amyn`, `altas_hub` so pushes stop fan-out deploying.
- [ ] 🧑 Confirm Deployment Protection stays on for preview URLs (already on).

### 1.3 Verify
- [ ] 🤖 Smoke-test the single domain: `/api/claude-analyse` (200 + thesis),
      `/api/macro`, a sync endpoint, a Nexus endpoint.
- [ ] 🤖 Re-run the env grep to confirm no referenced var is unset on the survivor.

### 1.4 Repo hygiene (separate PR, reversible)
- [ ] 🤖 Standardize Supabase env names to the canonical set; delete
      `NEXT_PUBLIC_*` reads once nothing uses them.
- [ ] 🤖 Remove/relocate dead code: `public/js/*` (old CDN build), the
      Streamlit/FastAPI Python tree, `legacy/`. Move to a `legacy/` tag or delete
      after you confirm nothing is run by hand.
- [ ] 🤖 Replace the stale root `ARCHITECTURE.md` with a pointer to
      `docs/PLATFORM_GROUND_TRUTH.md`.

---

## Track 2 — Multi-tenant product (greenfield, parallel)

**Why greenfield:** production is single-tenant by construction (no auth, 21
`USING(true)` policies, 5 user-scoped columns in 63 tables). You cannot safely
retrofit `auth.uid()` onto that — every existing feature assumes one operator.

### 2.0 Foundations (fork-agnostic — safe to start today)
- [ ] 🧑 New **private GitHub repo** (same account; consider an **org** if this
      may become a company-owned product).
- [ ] 🧑 New **Vercel project** pointed at the new repo (own env + domain).
- [ ] 🧑 New **Supabase project in a *separate org*** (free-tier, billing
      decoupled). **Production `vdmojjszvvcithuxwexx` is never touched.**

### 2.1 Tenancy from day one
- [ ] 🤖 Schema: `profiles` (1:1 `auth.users`), `portfolios` (FK → user),
      `positions`/`transactions`/`prices`/scrapbook tables all FK'd and
      **`user_id`-scoped**.
- [ ] 🤖 **RLS `USING (auth.uid() = user_id)` on every table** — the inverse of
      today's `USING(true)`. No SECURITY DEFINER view exposed to the API without
      an explicit allowlist.
- [ ] 🤖 Supabase Auth + the frontend auth shell the current app lacks
      (sign-in/up, session, route guards).

### 2.2 Reuse, don't reinvent (numbers must not drift)
- [ ] 🤖 Lift the **pure** modules verbatim: `src/lib/fairValueComposite.js`,
      `src/pages/nexus/nexus*Compute.js`, and the DCF/VaR/attribution math.
- [ ] 🤖 Do **not** port single-tenant queries/access patterns.

### 2.3 Data-source adapter (the key decoupling)
- [ ] 🤖 Define a `DataSource` interface the app talks to (quotes, fundamentals,
      positions). Ship a **stub** first.
- [ ] 🤖 Keep heavy compute **client-side** (DCF/MC/VaR) so it scales
      horizontally per user, as today.
- [ ] Implementations are deferred until Track L resolves: `OwnerKeysAdapter`
      (today's model), `BYODAdapter` (user connects their own brokerage/data),
      `EnterpriseFeedAdapter` (redistribution license).

### 2.4 Commercialization scaffolding (fork-agnostic)
- [ ] 🤖 Stripe + plan gating, onboarding flow, error tracking / alerting.

### 2.5 Incremental module migration — **sequence by stability, not importance**
- [ ] Port stable modules first (Performance Suite, Risk Analysis).
- [ ] Port shifting modules last (Nexus Theme/Opportunities/Drift) so you don't
      port mid-redesign.

### 2.6 Cutover decision (decide deliberately, later)
- [ ] Choose: "user #1 migrates onto the new repo" **vs** "personal instance and
      product diverge on purpose." Founders often want a bigger, ungated surface
      for personal use than is marketable — don't force convergence by default.

---

## Track L — Licensing (parallel, blocks nothing, gates go-live)

- [ ] 🧑 Confirm **redistribution** terms for Alpaca, Finnhub, AlphaVantage,
      Yahoo **before** any beta user sees data flowing through your keys. Retail
      tiers typically forbid redistributing data to other end users — a
      contractual limit no refactor fixes.
- [ ] The `DataSource` adapter (2.3) is what lets you defer this safely: when the
      answer lands, it's a new adapter impl, not a rearchitecture.
- [ ] 🧑 The Track 2 validation checkpoint (a working 2nd user account) is the
      natural moment to talk to vendors with something concrete.

---

## Suggested order of operations
1. **Track 1.1–1.3** (consolidate + verify) — removes immediate fragility.
2. Start **Track 2.0–2.1** (new repo + tenant schema/RLS) in parallel; kick off
   **Track L** conversations.
3. **Track 1.4** repo hygiene whenever convenient.
4. Track 2.2→2.5 as capacity allows; resolve **Track L** at the 2.x checkpoint;
   defer the **2.6** cutover decision until you're there.
