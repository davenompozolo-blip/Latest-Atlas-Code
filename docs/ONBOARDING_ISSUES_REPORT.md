# Onboarding a new user: what went wrong and what it should be

Status as at 2026-10-03 00:30 UTC. Written so the next plan starts from facts, not from memory.

## 1. The exact issue, right now

The fourth person (you, on a second email) cannot get into Atlas. The latest symptom is
*"the request isn't coming through, even the second time"*.

**What actually happened to that request.** At 00:25:11 UTC the form posted to
`/api/access-request`, and the route answered `202` and showed "Request sent". The database
recorded **nothing**. Requests only lists pending rows, so it reads *"No one is waiting"*.

That is the form working exactly as designed, and the design is the problem:

- That email **already has an account**. It was created by the approval at 21:26, the invite
  link confirmed it at 21:30, and it signed in through that link at 21:34. It has no portfolio
  and no broker connected.
- To stop strangers using the form to test which emails have accounts, it treats an existing
  account the same as a success and records nothing (`existing_user`, RA-1).
- So the one person who most needs help is told their request went through, and the
  administrator never sees it. **Nothing on either side says what happened.**

**Where that person is actually stuck.** The account exists but has no broker connected, and
there is no way back in that works today:

| Route back in | Why it fails today |
|---|---|
| Submit the request form again | Silently dropped, as above |
| "Forgot your password?" | Sends an email, and **no email can be sent** (see §2, bug 6) |
| Click the original invite link again | One-time and expired (1 hour) |
| Administrator: ACCOUNTS → Invite someone (same email) | **Works in the code**: it issues a set-new-password link. **But the link lands on Vercel's login page** until the Supabase URL settings are fixed (bug 4) |

So every path is blocked by one of two settings outside the code: **Supabase's redirect URLs**
and **a working email sender**. Both are still unset as of this report.

## 2. Bugs found along the way, in the order they appeared

| # | Bug | Effect | State |
|---|-----|--------|-------|
| 1 | "No account?" and "Request access" were 12px out of line on the sign-in card | Cosmetic | Fixed, #857 |
| 2 | Approving a request **sent nothing**. It returned a one-time link for the administrator to copy and send by hand, because no email server is configured | The person waits for an email that never comes | Partly fixed, #858: the system now tries to email first and shows the link as a fallback. **Still produces no email** (bug 6) |
| 3 | The link opened on a different browser **landed on Vercel's login page** | Nobody outside the Vercel team can follow any invite or reset link | Code fixed in #858 (links now point to `https://atlasterminal.online/`). **Still broken until bug 4 is fixed** |
| 4 | Supabase's **Site URL** is a Vercel-protected team address, and its **Redirect URLs** list holds only protected team addresses. Supabase sends a confirmed link to the requested address only if it is on that list; otherwise it sends it to the Site URL | Every invite and password reset ends at Vercel's login | **Open. Dashboard setting**, which my automated attempt was not permitted to change |
| 5 | Name was one field | Minor | Fixed, #858: first name and surname |
| 6 | **Email cannot be sent.** Supabase's built-in mailer only reaches the project's own team, at about 2 an hour. The SMTP settings since entered point at `atlasterminal.online` port 465. That address is the website on Vercel, not a mail server, and none of the mail ports answer. The sender is a Gmail address, which only Gmail's own servers may send from | No invite, reset or approval email reaches anyone | **Open. Dashboard setting** |
| 7 | An existing account re-submitting the form is **silently dropped** (§1) | The stuck person and the admin both see nothing | **Open. Design decision** |
| 8 | Invite links expire after **1 hour** and work **once**. Corporate email scanners can open a link before the person does, which uses it up | A link sent in the evening is dead by morning | **Open.** Expiry is a dashboard setting (`mailer_otp_exp`, 3600) |
| 9 | Clicking the invite link signs the person in at once, before they have chosen a password. If they close the tab at that point, they have an account with no password and no way back except the admin | Half-onboarded accounts | **Open** |
| 10 | **No status anywhere.** The admin cannot see invited / clicked / password set / broker connected for a person. The Requests tab shows only pending rows | Every problem above had to be diagnosed by querying the database | **Open** |
| 11 | Testing was done only by the owner, who is a member of the Vercel team. Protected URLs open for them, so bug 3 was invisible until a real outsider tried | The flow was never tested the way a new user meets it | Process |

## 3. Why it is this hard: the root causes

1. **No working email.** Every self-service step a normal product has (confirm email, reset
   password, "you've been approved") depends on email, so everything fell back to an
   administrator copying links by hand.
2. **Site addresses were never set up for outsiders.** The auth settings were written when
   the only user was the owner, on team URLs.
3. **Invite-only was built as a chain of hand-offs**: request → admin approves → admin sends
   link → link → password → broker. Each hand-off can fail silently, and none reports its state.
4. **Defences built for strangers hurt the real user.** Hiding whether an email exists, and
   one-time 1-hour links, are reasonable on their own. Together, with no email, they leave a
   stuck person with no way back and no message saying why.
5. **No end-to-end test as an outsider**: a clean browser, an email outside the team, a
   different device.

## 4. The aim: what "seamless" means for a product like this

The benchmark is any invite-only SaaS (Linear, Notion, Vercel, a broker app). The person should
never need to message the administrator, and the administrator should never need to query a
database.

**For the new person**
1. One page to ask for access, with a clear answer: *"We've got your request"*. If they
   already have an account, they get *"You already have an account — sign in or reset your
   password"*, or an email saying the same if we keep hiding which emails exist.
2. Approval arrives **by email** within a minute, from an address on the Atlas domain, with a
   link that lands on `atlasterminal.online`. It works for at least 24 hours and survives
   being opened by a mail scanner (for example a one-time code, or a link that only opens a
   page with a "Continue" button).
3. One screen to set a password, then **straight into connecting the broker**, in the same
   session, with plain-English help (paper or live, where to find the keys).
4. "Forgot your password?" always works, by email, with no admin involved.
5. Any half-finished state (account but no password, password but no broker) resumes where
   it stopped the next time they sign in.

**For the administrator**
1. One list of people: *requested → approved → email sent → link opened → password set →
   broker connected → first sync OK*, with a timestamp on each step.
2. One-click **Resend** and **Revoke** on any row, plus **Copy link** as a fallback.
3. Is told when a request is waiting (email or a badge), and sees a repeat request from
   someone already invited instead of having it dropped.

**For the platform**
1. Email delivery is monitored. A bounce or send failure is visible, not swallowed.
2. The whole journey is tested as an outsider before release: a clean browser, an email
   outside the team, the production domain.

## 5. Prerequisites that no code can replace (do these first)

1. **Supabase → Authentication → URL Configuration**
   - Site URL: `https://atlasterminal.online`
   - Redirect URLs: `https://atlasterminal.online/**`, `https://www.atlasterminal.online/**`,
     `https://latest-atlas-code-o19a.vercel.app/**`
2. **A real email sender**, for example Resend with `atlasterminal.online` verified
   (host `smtp.resend.com`, port 465, user `resend`, password the API key, sender
   `no-reply@atlasterminal.online`). Gmail with an app password works for testing but is
   rate-limited and sends from a personal address.
3. **Link expiry**: raise the email OTP expiry from 3600 to 86400 seconds.

With those three in place, the fourth account unblocks in two minutes: ACCOUNTS → Invite
someone (same email) → open the link in a private window → set a password → connect the
Alpaca keys.

## 6. Decisions for the better plan

- **Keep invite-only, or open sign-up with approval on first sign-in?** Open sign-up removes
  the request/approve/link chain entirely: the person creates an account, and the terminal
  stays locked until an admin approves it.
- **Hide whether an email exists, or tell the person?** Hiding it is what dropped the
  second request. Telling them leaks which emails have accounts. The usual answer is to say
  the same thing on screen and **email** the true answer.
- **Links or codes?** A 6-digit code typed into the page survives mail scanners and works
  across devices.
- **Collect broker keys at sign-up?** Recommended against: keys sent before the person's
  identity is confirmed are keys held for a stranger. Better as the first step after the
  password, which it already is.
