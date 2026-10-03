# Onboarding: change of course — handoff for Claude Code

Date: 2026-10-03. Supersedes the invite-link plan in `ONBOARDING_ISSUES_REPORT.md` §5–6.
Owner: Hlobo (product, schema). Implementer: CC.
Supabase project: `vdmojjszvvcithuxwexx` (the only project; it is live, not stale).

> **Status, 2026-10-03 (ONB-0 shipped, #860).** Measured before applying: §4.1's first
> three findings did not hold -- `anon` holds no grants (AUTH-2c), and the 43 views in
> Appendix A all return nothing to a user without a portfolio (they read `vw_active_*`).
> ONB-0 instead closed what did leak to a signed-in user: `portfolios`,
> `trade_universe_members`' book columns, `cortex_signals`, `insight_*`,
> `atlas_validation_log`. See CLAUDE.md, "Measure isolation by reading as the other user".
> The anonymous branch returns nothing: there is no signed-out demo (open question 1).

---

## 1. The change in one paragraph

Stop delivering access as **links**. Every bug in the issues report comes from a chain of
hand-offs (request → approve → one-time link → password → broker) where each step depends on
email, expires, and reports nothing. The new model: **anyone signs in with a 6-digit email
code; whether they get into the terminal is a status on their account row**
(`pending | approved | revoked`). An invite is an allowlist row, not a link. Onboarding
resumes from that row on every sign-in. The admin reads one pipeline instead of the database.

### What we stop doing (delete, don't patch)

| Remove | Why |
|---|---|
| `/api/access-request` form and the Request access page | Replaced by code sign-in. Its "existing user = silent success" rule is bug 7 |
| `inviteUserByEmail` / `generateLink` calls and the **Copy link** fallback (#858) | Links expire, get eaten by mail scanners, and land on Vercel's login (bugs 2, 3, 8) |
| Set-password screen and "Forgot your password?" | No passwords for new users, so nothing to forget (bug 9) |
| Requests tab showing only pending rows | Replaced by the pipeline (bug 10) |

Keep the password sign-in path working **for existing accounts only**, behind a flag, for one
release. Then remove it.

---

## 2. Facts read from the live database (2026-10-03, read-only)

- `auth.users` has **2** rows:
  - `e64dc4d6…` owner, admin, 3 brokers, 3 portfolios.
  - `45833d50…` created by the 21:26 invite, confirmed, signed in 21:34, **has a password
    set**, no broker, no portfolio. This is the stuck account.
- No trigger on `auth.users`. No profiles table. `public.users` is empty and unused.
- Existing: `atlas_admins`, `atlas_is_admin()`, `atlas_account_cap()` (= 3),
  `access_requests` (1 row, approved), `atlas_submit_access_request`,
  `atlas_decide_access_request`, `atlas_grant_portfolio_access`.
- Broker keys are in **Vault** as `broker_credentials:<broker_account_id>`. Good; keep that.
- There is no broker-connect edge function. The connect step writes from a **Vercel API
  route**. Find it (`grep -r "broker_accounts" api/ src/`).
- **Security (blocking):** see §4.1. Anonymous callers can read every portfolio today.

### Immediate unblock for the stuck account (no code)

That account already has a password. Ask them to sign in at `https://atlasterminal.online`
with email + the password they chose at 21:34. If they don't remember it, wait for ONB-1
(the code sign-in) rather than fixing reset links that are being removed. After ONB-1 is
applied they land on **Connect broker** automatically.

---

## 3. Dashboard settings (Hlobo, before any code ships)

1. **Auth → URL Configuration.** Site URL `https://atlasterminal.online`. Redirect URLs
   `https://atlasterminal.online/**`, `https://www.atlasterminal.online/**`. Codes don't
   need redirects, but the remaining password flow and OAuth later will.
2. **Email sender.** Resend, domain `atlasterminal.online` verified (SPF, DKIM, DMARC records
   in DNS). Auth → SMTP: host `smtp.resend.com`, port 465, user `resend`, password = API key,
   sender `no-reply@atlasterminal.online`, name `Atlas`. Remove the current settings
   (they point at the Vercel site).
3. **Email templates.** Both **Magic Link** and **Confirm signup** must contain
   `{{ .Token }}`. `signInWithOtp` uses *Confirm signup* for a new email and *Magic Link* for
   an existing one; if either lacks the token the person gets a link instead of a code.
   Suggested body: *"Your Atlas sign-in code is {{ .Token }}. It expires in 10 minutes."*
4. **Auth → Providers → Email.** OTP length 6. Email OTP expiry 600 s. Leave
   "Confirm email" on.
5. **Auth → Rate limits.** Raise emails/hour (default is tiny) once custom SMTP is on.
6. **Auth → Attack protection.** Enable captcha, provider **Cloudflare Turnstile**, paste the
   secret. Site key goes to the app as `VITE_TURNSTILE_SITE_KEY` (or the framework's
   equivalent).

Acceptance: send yourself a code from the production site to a non-Gmail address; it
arrives within a minute from `no-reply@atlasterminal.online` and contains a 6-digit code,
not a link.

---

## 4. Work packages, in order

Each package is one PR. Do not start the next until the previous one's acceptance passes.

### 4.1 ONB-0 — signed-in isolation (shipped 2026-10-03)

**Superseded as written.** The draft migration this section described
(`20261003005000_close_anon_portfolio_reads.sql`) was never applied. Measured
first: `anon` holds no grants (AUTH-2c), and the 43 views in Appendix A return
nothing to a user without a portfolio, because they read `vw_active_*`.

What shipped is `supabase/migrations/20261003005749_onb0_signed_in_isolation.sql`.
The rule it enforces:

- signed-in user → the portfolios they are a member of (administrators also
  read `portfolios` / `broker_accounts` for the admin screens);
- anonymous JWT → **no portfolio at all**. There is no signed-out demo; the
  terminal does not render without a session;
- no JWT (pg_cron, psql, the per-account refreshes) → every portfolio, as before.

It also closes the signed-in leaks that were actually found: `portfolios`
(account number, equity, cash in `metadata`), `cortex_signals`, `insight_*`,
`materialized_insights`, `atlas_validation_log`. ONB-0b revokes
`trade_universe_members.book_state` / `held_weight_pct` once the Trade page's
named-column reads are deployed.

Acceptance: `supabase/tests/onb0_signed_in_isolation_contract.sql` raises
`ONB0_ALL_PASSED` (it needs ONB-0b for its `held_weight_pct` assertion); signed
in as the second account, every terminal page shows nothing from the owner's
portfolios.

### 4.2 ONB-1 — onboarding state in the database

File: `supabase/migrations/20261003010000_onboarding_state.sql` (written, not applied).

Adds:
- `atlas_accounts` (one row per auth user, status + a timestamp per stage) and
  `atlas_allowlist` (invites). RLS: read own row; admins read all; no client writes.
- Triggers on `auth.users` (create the row; auto-approve if allowlisted; stamp first
  sign-in). They swallow their own errors so a bug can never block sign-in;
  `atlas_my_onboarding()` self-heals a missing row.
- `broker_accounts` **before insert** trigger: rejects a broker for an unapproved user,
  whichever route inserts it. **After insert**: stamps `broker_connected_at`.
- `account_snapshots` after insert: stamps `first_sync_ok_at` for the portfolio's members.
  *Confirm the onboarding sync writes `account_snapshots`; if not, move the stamp to
  `sync_log` `status = 'success'`.*
- RPCs: `atlas_is_approved()`, `atlas_my_onboarding()`, `atlas_set_my_details()`,
  `atlas_admin_accounts()`, `atlas_admin_set_status()`, `atlas_admin_invite()`,
  `atlas_admin_uninvite()`.
- Backfill: both existing users → `approved`, history reconstructed.

Apply on a Supabase **branch** first (`create_branch`), run the verify query, then
production. Regenerate types after.

Acceptance: `select email, status, broker_connected_at, first_sync_ok_at from atlas_accounts`
shows 2 approved rows; as the second account, `select atlas_my_onboarding()` returns
`next_step = 'connect_broker'`; as the owner, `ready`.

### 4.3 ONB-2 — code sign-in, guard and onboarding screens

> **Status, 2026-10-03.** Built, not yet merged: `src/components/auth/CodeSignIn.js`,
> `src/components/Welcome.js` (`WelcomeGate`), `src/lib/onboarding/nextStep.js`. The
> terminal has no router, so steps map to screens rather than URLs. Blocked on §3: sign-ups
> are disabled, the OTP length is 8, and neither template carries `{{ .Token }}`.

File: `src/lib/onboarding/nextStep.ts` (written). It calls `atlas_my_onboarding()` and maps
`next_step` to a route; the database makes the decision.

Build:
1. **Sign-in screen** (replaces sign-in + request access): email field + Turnstile →
   `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, captchaToken } })`
   → code field → `supabase.auth.verifyOtp({ email, token, type: 'email' })` →
   `getOnboardingState()` → `navigate(routeFor(state))`.
   Same message for every email: *"We've sent a code to {email}."* Resend button after 60 s.
2. **Route guard** on every route using `guard(pathname, state)`. Terminal routes need
   `ready`. Fail closed on `OnboardingError` (show retry, never the terminal).
3. Screens under `/welcome`:
   - `details`: first name, surname → `saveDetails()`.
   - `waiting`: "You're on the list. We'll email you when you're approved." Uses
     `watchStep()` so approval moves them on without a refresh.
   - `broker`: paper/live toggle, key + secret, plain-English "where to find these" with a
     link to Alpaca's dashboard. **Before saving**, call Alpaca `GET /v2/account` on the right
     base URL (paper `https://paper-api.alpaca.markets`, live `https://api.alpaca.markets`)
     server-side; show Alpaca's error if it fails. On success: insert `broker_accounts`,
     store keys in Vault as `broker_credentials:<id>`, create the portfolio and
     `portfolio_members` row (respect `atlas_account_cap()`), trigger the first sync.
   - `syncing`: progress, `watchStep()` at 5 s; after 3 minutes show "This is taking longer
     than usual" with the last `sync_log` error for their portfolio.
   - `revoked`: plain message, sign-out button.
4. **The broker route** must check `atlas_is_approved()` using the **caller's JWT**
   (not the service role) before doing anything. The DB trigger is the backstop, not the gate.
5. Keep the old password form reachable at `/sign-in?password=1` behind a flag for existing
   users. Remove in ONB-4.

Acceptance: §5 test passes on a Vercel preview.

### 4.4 ONB-3 — admin pipeline and notifications

- ACCOUNTS tab: `rpc('atlas_admin_accounts')`. Columns: name, email, stage
  (`unverified · waiting · approved · syncing · live · revoked`), and the timestamps as
  "2 h ago" with the exact time on hover. `unverified` rows (asked for a code, never typed
  it) shown muted and collapsed by default.
- Row actions: **Approve**, **Revoke**, **Set back to pending** → `atlas_admin_set_status`.
  Revoking deletes their sessions.
- **Invite someone** → `atlas_admin_invite(email, first, surname)`. Result
  `allowlisted` or `approved_existing`; either way send the *"You're in"* email (below).
  Show the result in plain words. No link is created.
- **Approval email**: an edge function `notify-account-event` (Resend API) sends
  *"You're in. Sign in at atlasterminal.online with {email}."* on approve/invite, and
  *"{name} ({email}) is waiting for approval"* to the admin when a pending account
  completes `details`. Trigger it with a **Database Webhook** on `atlas_accounts` UPDATE;
  the function decides from old/new rows, and sets `admin_notified_at` so it sends once.
- Badge on ACCOUNTS with the count of `waiting`.

Acceptance: a new email signing in produces an admin email within a minute; Approve moves
the person from Waiting to Connect broker without them refreshing.

### 4.5 ONB-4 — retire the old flow

Remove everything in the §1 table, the password flag, `atlas_submit_access_request` and
`atlas_decide_access_request` (revoke execute, drop next release). Keep `access_requests`
read-only for history.

### 4.6 ONB-5 — email you can see

- Resend webhook (`email.delivered`, `email.bounced`, `email.complained`) → edge function →
  `email_events` table (admin-read only).
- ACCOUNTS shows a red banner if any auth email bounced or failed in the last 24 h.
- Optional later: Supabase **Send Email Hook** to Resend's API instead of SMTP, so a send
  failure is an error in our logs, not a silent drop.

### 4.7 ONB-6 — outsider test before every release

Playwright, run against the production domain (or a preview with protection bypass for the
test runner only):
clean browser context → non-team email (Resend test inbox or a catcher in staging) → code →
details → waiting → approve via `atlas_admin_set_status` with a test admin JWT → broker with
Alpaca **paper** test keys → first sync → terminal loads. Second job repeats sign-in on a
"different device" (fresh context) using the code only. This closes bug 11.

---

## 5. Definition of done

1. A stranger with a non-team email goes from atlasterminal.online to the terminal without
   messaging anyone except being approved, on any device.
2. Signing in again at any point resumes at the right step.
3. The admin never queries the database to see where someone is.
4. Any failed email is visible in ACCOUNTS within minutes.
5. Signed out, and signed in as someone else, nobody can read the owner's portfolios
   (tables **and** views).

---

## 6. Decisions taken (do not re-open without Hlobo)

| Question | Decision |
|---|---|
| Invite-only or open sign-up | Open sign-in, approval-gated. Invite = allowlist row = auto-approve |
| Hide whether an email exists | Moot: identical response for every email |
| Links or codes | Codes, 6 digits, 10 minutes |
| Passwords | None for new users. Existing password path removed in ONB-4 |
| Broker keys at sign-up | No. First step after approval, validated against Alpaca before saving |

## 7. Open questions for Hlobo

1. Is the signed-out demo of the default portfolio intentional? ONB-0 keeps it. If not,
   change the anon branch of `atlas_member_portfolios()` to return nothing.
2. Delete unverified accounts (code requested, never entered) after 7 days with a pg_cron job?
   Recommended.
3. Should approved users without a broker be able to browse reference modules (Codex,
   research, screener) before connecting? Current `next_step` sends them to Connect broker.

---

## Appendix A — views that bypass RLS and don't filter by caller (ONB-0)

`nexus_holdings`, `nexus_options`, `nexus_portfolio_aggregates`, `valuation_health`,
`vw_adversary`, `vw_bench_docket`, `vw_book_frozen_baseline`, `vw_book_mctr`, `vw_brier_trend`,
`vw_calibration`, `vw_chain_status`, `vw_cluster_identity`, `vw_command_centre`,
`vw_company_institution_ratios`, `vw_default_only_book_candidate_map`, `vw_devil_advocate`,
`vw_filled_transactions`, `vw_held_symbols_absent_from_matrix`, `vw_holding_vol_latest`,
`vw_ledger_integrity`, `vw_pcm_allocation`, `vw_pcm_drift`, `vw_pcm_risk`,
`vw_performance_suite`, `vw_portfolio_home`, `vw_portfolio_nav_daily`,
`vw_portfolio_returns_daily`, `vw_position_axis_exposure`, `vw_position_cash_flows`,
`vw_position_nav_daily`, `vw_position_reconciliation`, `vw_position_returns`,
`vw_position_tier2`, `vw_positions_current`, `vw_positions_exited_intraday`,
`vw_quant_correlation`, `vw_quant_dashboard`, `vw_quant_drawdown`, `vw_quant_rolling_returns`,
`vw_risk_analysis`, `vw_screener`, `vw_sleeve_headroom`, `vw_transactions`.

Some of these may be harmless reference data matched by a loose pattern (e.g. `vw_screener`,
`vw_company_institution_ratios`); confirm each before changing it. Query used:

```sql
with v as (
  select c.relname, pg_get_viewdef(c.oid) def from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('v','m')
    and coalesce((select option_value from pg_options_to_table(c.reloptions)
                  where option_name = 'security_invoker'), 'false') = 'false'
    and has_table_privilege('authenticated', c.oid, 'select'))
select relname from v
where def ~* '(positions|transactions|account_snapshots|portfolio_equity_curve|decisions|orders|portfolios|broker_accounts|bench_claims|forward_test_positions|book_|mv_.*__acct)'
  and def !~* '(atlas_active_portfolio|atlas_member_portfolios|atlas_owner_portfolios|auth\.uid)'
order by 1;
```

## Appendix B — files in this handoff

| File | State |
|---|---|
| `supabase/migrations/20261003005000_close_anon_portfolio_reads.sql` | Written, not applied |
| `supabase/migrations/20261003010000_onboarding_state.sql` | Written, not applied |
| `src/lib/onboarding/nextStep.ts` | Written; adjust `STEP_ROUTES` to the router |
| `ONBOARDING_HANDOFF.md` | This file |
