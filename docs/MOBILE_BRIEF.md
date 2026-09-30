# ATLAS Mobile Brief

Status: DRAFT v0.1, a spec for CC. **Not for build** until the multi-tenant
architecture hardening and RLS remediation are complete (Section 2).
**Section 14 records the Section 2 gate as measured on 2026-09-30. The gate
is not met, and two of its premises do not hold for this stack. Read §14
before starting any stage.**

## 1. Purpose and principles

ATLAS mobile is a **check-and-react surface, not a build surface.** Portfolios
are still built and analysed on desktop. Mobile answers one question: *What
is the state of my portfolio, regime and theses right now, and does anything
need my attention?*

1. **Verdict first, drill down on demand.** Reuse the Nexus tile/verdict
   model. The verdict engine decides what arrives open. Mobile shows only the
   verdict layer by default.
2. **One codebase.** Same React SPA, same Supabase backend. Mobile is a
   responsive shell plus purpose-built mobile surfaces, not a fork.
3. **Logic is layout-agnostic.** Data fetching, calculations and verdict
   logic live in hooks, services and Edge Functions. Components only render.
4. **Fewer things, done beautifully.** Build 4-6 excellent surfaces. Do not
   squeeze every module onto a small screen.
5. **Staged delivery.** PWA first, then purpose-built surfaces. Add a native
   shell (Capacitor) only if users ask for one.

## 2. Prerequisites (gate before build starts)

- [ ] RLS enabled and tested on all tables, including `users` and
      `cortex_signals`. A phone client increases exposure of the anon-key path.
- [ ] Multi-tenant isolation verified with the existing additional user
      accounts: cross-user read and write tests on every user-scoped table.
- [ ] Panel provider lift (Nexus, PR #741) stable, with data access decoupled
      from desktop layout components.
- [ ] Supabase auth redirect URLs include the Vercel preview domain pattern
      and the production domain.

Measured status: §14.

## 3. Delivery stages

**Stage 1: PWA shell (own beta testing)**
- Web app manifest: name, icons, theme colour `#0a0d12`, `display: standalone`.
- Service worker: app-shell caching and an offline fallback screen. Do not
  cache authenticated API responses without an explicit design.
- Install prompt: Chrome Android `beforeinstallprompt` (primary). iOS "Add to
  Home Screen" guidance (secondary).
- Viewport meta with `viewport-fit=cover`. Apply safe-area insets globally.
- Responsive navigation shell (§5).
- Route-level code splitting.

**Stage 2: purpose-built mobile surfaces (§4)**

**Stage 3: native shell, only on demand**
- A Capacitor wrapper of the same build, for app-store distribution,
  biometric login and native push.
- Trigger: external users asking for native capabilities. Try web push via
  the PWA first.
- React Native/Expo is out of scope unless mobile becomes a first-class
  product.

## 4. Mobile surfaces (v1 scope)

| # | Surface | What it shows | Data / notes |
|---|---------|---------------|--------------|
| 1 | **Home / Verdict** | Portfolio coherence status, headline verdict, the tiles the verdict engine pre-opens, changes since last visit | Nexus verdict engine output. Needs a summary endpoint that returns the verdict plus tile headlines, not full panel payloads |
| 2 | **Regime** | Current regime state; the three empirical axes (cyclical risk appetite, concentration, dollar strength) as compact gauges; a transition flag | Regime module outputs per `ATLAS_REGIME_MASTER_SPEC.md`; read-only |
| 3 | **Signals** | Cortex signals ranked by relevance to the portfolio, each with a one-line thesis | `cortex_signals` (RLS-gated); tap opens a detail sheet |
| 4 | **Bench** | Claims with integrity states (INTACT, BENDING, BROKEN, UNTESTED, EXPIRED), sorted by attention needed | Bench data model; state chips are the primary UI |
| 5 | **Holdings snapshot** | Positions as cards: weight, day and since-entry change, contribution | A card list, not a table; sort and filter in a bottom sheet |
| 6 | **Quick capture** | Log a thought or thesis note against a holding or claim in under 10 seconds | Write path; must respect RLS and tenant scoping; offline queue optional in Stage 2 |

Desktop-only in v1: the trading ticket, Reverse DCF, Brinson-Fachler
attribution, the Skill vs Luck panels, the Fund/Equity Research screeners,
the Codex study platform and the geographic exposure surface.

## 5. Navigation and layout primitives

- **Navigation:** a bottom tab bar with at most 5 items (Home, Regime,
  Signals, Bench, More). Holdings and Capture open from Home and More. Capture
  is also a floating action on relevant screens.
- **Sheets over drawers:** detail views open as bottom sheets with snap points
  (peek, half, full), a drag handle and swipe-to-dismiss. A sheet must not
  trap the back gesture.
- **Single-column stacks** below 640px. Two columns are allowed only at
  tablet width.
- **Tables to cards:** tabular data collapses to cards. The key metric is
  promoted and secondary metrics sit on a compact second line. Horizontal
  scrolling tables are a last resort.
- **Breakpoints:** define them once as tokens (mobile < 640, tablet 640-1024,
  desktop >= 1024) and use them everywhere. No ad-hoc media queries.
- **Desktop untouched:** the desktop layout must not regress. Swap in mobile
  components through the breakpoint layer or a route-level layout. Do not
  bend desktop components to fit.

## 6. Visual design system for mobile

Keep the ATLAS identity: `#0a0d12` background, `#3ad6e0` cyan accent, Syne
(display), DM Sans (body), JetBrains Mono (data).

- **Type scale:** a mobile-specific scale. Body text is 15-16px minimum. Data
  in JetBrains Mono is 13px minimum with `font-variant-numeric:
  tabular-nums`. Display headings are sized down from desktop, not scaled
  proportionally. No text below 11px.
- **Density:** 2-3 metrics per card. Terminal density is a desktop virtue.
- **Colour:** verify the accent and the semantic colours (positive, negative,
  warning) against WCAG AA on `#0a0d12`. Test on OLED at low brightness and in
  sunlight. Never use colour alone for state: pair it with an icon or label.
- **Elevation:** use subtle layered surfaces rather than borders everywhere,
  one radius token, and no heavy shadows on dark backgrounds.
- **Motion:** 150-250ms ease-out transitions. Sheet and tab transitions should
  feel physical. Respect `prefers-reduced-motion`.
- **Loading:** skeleton loaders that match the final layout. Never a blank
  screen or a spinner on its own. Optimistic UI for quick capture.
- **Empty and error states:** designed, specific and actionable. No raw
  errors.

## 7. Touch, input and platform polish

- Touch targets are at least 44x44px, with enough spacing. No hover-only
  affordances: every tooltip has a tap equivalent.
- Swipe and long-press are shortcuts only, never the only route to an action.
- Apply safe-area insets (top notch, bottom home indicator) to the tab bar,
  sheets and fixed elements.
- Use `dvh` / `svh`, never `100vh`.
- Inputs stay visible above the keyboard, with the right `inputmode`,
  `autocomplete` and `enterkeyhint`.
- Input font size is at least 16px, which stops iOS zooming on focus.
- Prevent pull-to-refresh and overscroll bounce from conflicting with sheets
  and charts.
- Haptic feedback only in a native shell (Stage 3).

### 7a. Android-specific requirements

- **Back button and back gesture:** every sheet, modal, drawer and drill-down
  pushes a history entry and closes on back. Back must never exit the app or
  jump to an unrelated route. Back from a top-level tab returns to Home, then
  exits. Test with both 3-button and gesture navigation.
- **Gesture navigation insets:** account for the system gesture bar and
  edge-swipe back. Keep horizontal swipe interactions away from the screen
  edges.
- **PWA install:** handle `beforeinstallprompt` with an in-app install
  affordance (Chrome installs it as a WebAPK). Provide **maskable** 192 and
  512 icons plus standard icons.
- **Theme and status bar:** `theme-color` `#0a0d12`, `color-scheme: dark`.
- **Screen variability:** use fluid units and `env(safe-area-inset-*)`. Test
  at 360px and 390px, and check for overlap at 320px. Include foldables and
  display cutouts.
- **Performance baseline:** a mid-range Android on throttled 4G, not a
  flagship.
- **Text scaling:** layouts must tolerate a 130-200% system font scale.
- **Web push:** supported on Android Chrome without a native shell, so it can
  be prototyped in Stage 1/2.
- **Native shell (Stage 3):** Capacitor Android can be sideloaded as an APK.

## 8. Charts on mobile

- Every desktop chart gets one of three decisions: **adapt, replace or omit.**
- Adapt: fewer ticks, simpler axes, larger tap targets, a tap-to-pin tooltip,
  and pinch or range-chip zoom instead of a brush.
- Replace: complex multi-series charts become a sparkline plus a headline
  number, with an expand action into a full-width view.
- Hierarchy: **verdict, then number, then chart on tap.**
- Rotation map: show the quadrant summary first and the plot on tap.
- Charts resize on orientation change and follow the container width, not
  the window width. `useLwChart` already uses a `ResizeObserver` (see
  `docs/CHART_CONTAINER_RESIZE_FIX.md`).

## 9. Performance and network

- Budget: initial JS for the mobile entry route, proposed at 200KB gzipped.
  The baseline is measured in §14 and is about 10x that.
- Route-level code splitting. Lazy-load charts and heavy libraries.
- Lean summary endpoints for mobile tiles.
- Query caching with stale-while-revalidate, and a refetch when the app
  resumes or becomes visible.
- Test on throttled 4G and a mid-range Android.
- SVG icons; no large raster assets.

## 10. Security and multi-tenancy on mobile

- All access goes through a Supabase auth session and RLS. No service-role
  key in any client bundle.
- Refresh tokens persist in storage suitable for a PWA. Sign-out clears
  cached authenticated data.
- No sensitive data in service worker caches unless explicitly designed.
- Quick capture writes are validated server-side and tenant-scoped.
- Preview deployments use the same auth redirect allowlist. Production and
  preview environment variables are never mixed.

§14 explains why the first bullet describes a stack that does not exist yet.

## 11. Testing and beta plan

- **Primary device: the owner's Android phone, in Chrome.** Secondary: an
  iPhone (partner's device) for Safari/WebKit. Neither may regress the other.
- Vercel preview URLs on the phone, and an HTTPS tunnel for local PWA
  testing. Android: USB debugging plus `chrome://inspect`. iPhone checks are
  visual and functional only.
- Chrome DevTools device modes for layout; real devices for touch, safe
  areas, keyboard and performance.
- Browsers: Chrome Android, Safari iOS, and a spot-check on Samsung Internet.
- Per-surface checklist: loads under budget on throttled 4G; usable
  one-handed; no horizontal page scroll; no overlap at 320px; landscape
  acceptable; dark-mode contrast passes; works after backgrounding and
  resuming.
- Beta: own use first, then the additional users. Decide on Stage 3 only
  after beta evidence.

Preview deployments on this project are SSO-gated (see CLAUDE.md, EQ-4), so a
preview URL does not open on a phone until protection is bypassed for it.

## 12. Build sequence (proposed)

1. Responsive shell and navigation, breakpoint tokens, safe-area and viewport
   fixes
2. PWA manifest and service worker; install on own phone
3. Home / Verdict surface, including the summary endpoint
4. Bench and Signals surfaces
5. Regime surface
6. Holdings snapshot
7. Quick capture
8. Performance pass, accessibility pass, beta feedback round
9. Decision gate: native shell or continue as a PWA

## 13. Open questions

- Which surfaces matter most on the phone first? Reorder §12 to match.
- Are the regime outputs stable and light enough for a read-only mobile view?
  §14 has a partial answer.
- Notifications: which events justify a push (regime transition, Bench claim
  state change, high-relevance Cortex signal)? This needs a notification
  design.
- Offline: is a read-only cached last state enough, or does v1 need a write
  queue for Quick capture?
- Confirm the Android model and version so the performance baseline is known.

## 14. Gate status as measured (2026-09-30)

Measured against Supabase `vdmojjszvvcithuxwexx` and `main` at `d6e5c34`.

### 14.1 There is no user authentication, so there are no tenants

| fact | measured |
|---|---|
| `auth.users` | **0 rows** |
| `public.users` | **0 rows**, 3 columns, RLS off |
| `auth.signIn*` / `getSession` / `onAuthStateChange` in `src/` | **0 call sites** |
| policies that reference `auth.uid()` | 4, all on `portfolios`, and they sit beside `portfolios_read_anon USING (true)` |

The terminal talks to Supabase as **anon** with the publishable key. It picks
an account with the `x-atlas-portfolio` request header, which
`atlas_active_portfolio()` checks against `portfolios` (MP-0 to MP-2). That
header selects an account; it does not authenticate anyone. Anyone with the
public key can read any of the three portfolios by setting it.

So two gate items rest on premises that do not hold:

- *"Multi-tenant isolation verified with the existing additional user
  accounts"*: there are no user accounts. There are three broker accounts
  under one owner.
- *"Supabase auth redirect URLs"*: nothing uses Supabase Auth, so there is
  nothing to redirect.

§10's "all access via Supabase auth session and RLS" is therefore **new
work, not a check**. VC-1 in CLAUDE.md already names it as deferred: "The
self-serve 'log in with your Alpaca keys' screen is this route behind a real
user session, plus RLS so one user's book is not another's." The mobile
brief is where that deferred work becomes a hard dependency. A phone
installed as a PWA on the anon key is the same exposure as the desktop, in a
place that is easier to lose.

**Decision needed from the owner before Stage 1:** is Stage 1 an own-use PWA
on the current anon model, accepting today's exposure, or does user auth come
first? The brief's §2 implies the latter.

### 14.2 RLS is off on 22 tables, and anon can write every one

Anon holds SELECT, INSERT and DELETE on all 22:

```
cortex_paper_trades  cortex_signal_controls  cortex_signals
insight_best_worst_tradingdays  insight_correlation_cluster
insight_correlation_clusters_common  insight_counter_specific_var_vs_sector
insight_drawdown_severity_by_counter  insight_factor_decomposition
insight_positions_approaching_52_week_high_low  insight_sector_attributiom
insight_sector_attribution  insight_ssector_pnl_decomposition
insight_top_winner_losers_within_52w_extremes  instrument_sector_overrides
materialized_insights  query_log  saved_queries  sector_industry_map
sector_overrides  theme_taxonomy  users
```

`bench_claims` has RLS **on**, but its policies are
`anon_insert` / `anon_update USING (true)`, so anyone can write or rewrite a
claim. Quick capture (§4 #6) would be writing into exactly that path.

Enabling RLS on these tables without policies would break live pages, which
write through anon:

- `cortex.js:1142` updates `cortex_signals.is_muted`.
- `sql-terminal.js` inserts `query_log` and inserts, updates and deletes
  `saved_queries`.

Remediation is its own unit. For each table: find its writers, give reads
and writes a policy, and revoke anon DELETE where nothing needs it. It can be
done before user auth exists, and that alone closes the anonymous-write hole.

### 14.3 Nexus panel provider (PR #741)

`nexusLive.js` with `nexusLiveProvider.test.mjs` is the data layer the
flagship reads. Whether it is decoupled enough for a mobile Home surface is
not measured here. Check it when Stage 2 #1 is scoped.

### 14.4 Bundle baseline: about 10x the proposed budget

A keyed `vite build` (`VITE_SUPABASE_ANON_KEY` set, per CLAUDE.md) of `main`:

| chunk | gzip |
|---|---:|
| `index-*.js` (the entry: every page) | **2,112 KB** |
| `GlobeRenderer-*.js` | 553 KB |
| `FlatRenderer-*.js` | 552 KB |

`src/pages/app.js` has **no `lazy()` routes**, so every module is in the
entry chunk. The 200KB mobile budget cannot be met without route-level
splitting. That work also helps desktop, and it is the first real task of
Stage 1.

### 14.5 What already exists for the surfaces

- **Regime (§4 #2):** `vw_regime_axis_state` publishes one row per axis for
  the three axes (latest `factor_axis_scores` date 2026-09-29), with today's
  z-score and the active account's regime-CVaR bucket. It is light, per
  account and read-only, so it is suitable as the surface's source. Theme
  states (`regime_theme_states`, latest 2026-09-25) are
  **`v0.1-structural`, which detected 1 of 4 expected periods**. Do not
  present a theme "transition flag" as a calibrated signal. Render axis state
  now and theme state only with its version caveat.
- **Bench (§4 #4):** 34 `bench_claims`. `vw_position_risk_thesis` joins them to
  risk share. Per CLAUDE.md (B4), every claim is `untested`, so an
  attention-sorted list is a constant today.
- **Signals (§4 #3):** 8 `cortex_signals` rows.
- **Holdings (§4 #5):** `vw_nexus_holdings` publishes both return bases.
  Render `since_entry` / `on_cost` through `src/lib/nexusReturnBasis.js` and
  stale moves through `src/lib/weightedMove.js`. Those modules exist because
  cards built on the raw columns went wrong before.

### 14.6 Gate verdict

| item | status |
|---|---|
| RLS on all tables incl. `users`, `cortex_signals` | **not met**: 22 tables off, all anon-writable |
| multi-tenant isolation with user accounts | **premise false**: 0 users, no auth |
| panel provider lift | not measured |
| auth redirect URLs | **premise false**: no Supabase Auth in use |

**Recommended order:** (1) RLS remediation of the 22 tables plus
`bench_claims` writes; (2) an owner decision on user auth, which settles what
§10 means; (3) route-level code splitting, which is safe to do now and needed
either way; then Stage 1.
