# Parade E2E Testing Strategy

Goal: catch **functional bugs**, **human logic gaps** (flows that technically work but confuse or strand a real person), and **inconsistencies** across the app — by simulating how humans actually use Parade, including the messy parts: multi-user back-and-forth, abandoning flows halfway, tapping notifications hours later, and opening deep links while logged out.

Current state (audited 2026-07-18): no test tooling exists in the repo — no Maestro flows, no Jest, and **zero `testID` props** anywhere in `app/` or `components/`. This is greenfield.

---

## 1. The three-layer model

Parade's riskiest logic lives in three different places, and no single tool covers all of them:

| Layer | What it tests | Tool | Speed |
|---|---|---|---|
| **L1 — Backend contract tests** | DB triggers + RPCs (where most multi-user logic actually lives) | Node scripts + `supabase-js`, run against test accounts | Seconds |
| **L2 — UI journey tests** | Persona-driven human journeys on the simulator | Maestro | Minutes |
| **L3 — Exploratory audits** | Human logic gaps, consistency, edge states | Structured checklists driven by Claude/human sessions | Hours, periodic |

The instinct is to jump straight to L2 (UI automation), but most of Parade's subtle bugs live in L1: `auto_create_trip_from_availability` (already bit us once — deleted trips when editing dates), `create_plans_on_hang_accepted`, `convert_open_invite_to_plan`, `check_and_apply_plan_change` threshold logic, and the invite-token RPCs. These are testable in seconds without a simulator, so they run on every change; UI journeys run nightly/pre-release.

---

## 2. Prerequisites (do these first — everything depends on them)

### 2.1 Test auth: Supabase test phone numbers
Phone OTP is the primary auth path and must stay in the tested surface. Supabase supports **test phone numbers with static OTPs** (Dashboard → Auth → Phone → Test OTPs, or `auth.sms.test_otp` in config). Register e.g.:

```
+15005550001 → 123456   (persona: Organizer "Olivia")
+15005550002 → 123456   (persona: Responder "Ravi")
+15005550003 → 123456   (persona: New user "Nora" — deleted/reset before every run)
+15005550004 → 123456   (persona: Lurker "Liam" — never completes onboarding)
```

No Twilio calls, deterministic codes, and the real OTP UI flow still gets exercised. Email/password fixtures are the fallback for flows where phone entry is awkward to script.

### 2.2 Seed & reset script — `scripts/test-seed.mjs`
A Node script (service-role key, same pattern as `dump-schema.mjs`) with two commands:

- `reset` — for each test account: delete plans/trips/friendships/hang-requests/open-invites/notifications they own or participate in; restore availability to the seeded default; reset `onboarding_completed` for Nora only.
- `seed` — build the standing fixture world: Olivia↔Ravi are friends, Ravi has known availability (free Sat afternoon, away in Austin next month), one existing plan with both, one pending friend request from Liam→Olivia.

Every test run starts with `reset && seed`. Deterministic starting state is what makes failures diagnosable. **Guardrail:** the script must refuse to run unless the target user IDs are in a hardcoded test-account allowlist — this runs against the production Supabase project (`parade-ios` has no staging project), so scoping deletes to fixture accounts is non-negotiable.

### 2.3 testIDs on interactive elements
Zero testIDs exist. Add them incrementally, highest-traffic first — don't boil the ocean:

1. Tab bar buttons (`FloatingTabBar`), login inputs/buttons, onboarding steps
2. The "+" create menu (`what-planning`), new-plan / quick-plan / find-time wizard steps
3. Plan detail actions (RSVP, vote, propose change), friend request accept/decline
4. Everything else opportunistically as flows get written

Convention: `testID="<screen>.<element>"` e.g. `login.phone-input`, `tabbar.plans`, `plan.rsvp-yes`. Maestro can select by visible text as a stopgap, but text selectors break on copy changes — and Parade iterates on copy constantly.

### 2.4 Maestro install + dev-client build
Maestro over Detox: no native rebuild needed, YAML flows are readable/maintainable solo, works with the existing dev client on the simulator. Flows live in `.maestro/`, named `NN-flowname.yaml` for run order.

---

## 3. Layer 1 — Backend contract tests

`tests/backend/` — plain Node scripts using `supabase-js`, one file per logic cluster, runnable via `npm run test:backend`. Each test signs in as fixture users (test-OTP or email accounts), performs API actions exactly as the app would, and asserts the resulting DB state.

Priority order (riskiest first):

1. **availability↔trips trigger** — set away availability → trip auto-created; edit trip dates from the "app side" (with `trip_id` tag) → trip NOT deleted (regression test for the known bug); revert to home → trip cleaned up; overlapping away ranges → `merge_overlapping_trips` behaves.
2. **hang request accept** — Olivia pings Ravi → Ravi accepts → plan auto-created with both participants, correct date/slot, notification row exists.
3. **open invite claim** — broadcast → claim → converts to plan; second claimer behavior; claim after expiry/anchor invalidation.
4. **plan change threshold** — `check_and_apply_plan_change`: change applies exactly at threshold, not before; declining participants handled.
5. **invite tokens** — `accept_plan_invite` / `accept_trip_invite`: valid token, reused token, token for deleted plan, accepting your own invite.
6. **signup linking** — `link_invited_friends_on_signup` / `link_plan_invites_on_signup`: invite sent to a phone number → that number signs up → linkage happens.
7. **new-user bootstrap** — profile creation seeds 366 days of availability; `handle_new_user` idempotency.

These double as **regression tests for every trigger/RPC change** — run them before any migration is applied.

---

## 4. Layer 2 — UI journeys (Maestro)

### 4.1 Personas, not features
Flows are scripted as *journeys a person takes*, not per-screen checklists — that's what surfaces logic gaps. Four personas map to the four test accounts:

- **Nora (new user)** — the full first-run gauntlet: install-state app → phone OTP signup → onboarding wizard → welcome slides → set availability → add first friend → create first plan → first-plan celebration. Run from a **fully reset account every time**. This journey is the single highest-value flow: it's where churn happens and where every stale assumption breaks.
- **Olivia (organizer)** — creates everything: quick-plan from a free window, find-time wizard end-to-end, find-people broadcast, new trip, trip proposal with date-range voting, pod creation, share-availability.
- **Ravi (responder)** — lives in the reactive surface: opens notification → lands on the right screen, RSVPs, votes on proposals, accepts hang requests, accepts a propose-change, declines things.
- **Liam (lurker/edge)** — half-finished states: abandons onboarding, backgrounds the app mid-wizard, has zero friends/plans (every empty state), never grants push permission.

### 4.2 The multi-user trick: headless counterpart actor
Most social flows need a second user, but running two simulators is slow and flaky. Instead: **Maestro drives one persona in the UI while a Node "actor" script performs the counterpart's actions via `supabase-js`** (accept the friend request, RSVP, vote, claim the invite). Maestro's `runScript`/`runFlow` hooks or a wrapper shell script sequence the two.

Example — plan invite journey:
1. Maestro (as Olivia): create plan, invite Ravi
2. Actor script (as Ravi): RSVP yes via RPC
3. Maestro (as Olivia): pull-to-refresh plan detail → assert Ravi shows as going, notification appeared

Reserve true two-simulator runs for a tiny set of realtime tests (vibe updates, conversation messages) where the pushed-update rendering itself is the thing under test.

### 4.3 Simulating *human* behavior
Every journey flow should include deliberately human moves — this is where "works in the demo, breaks in real hands" bugs live:

- **Abandon and return**: back out of the find-time wizard at step 2, reopen it — is state sane or half-remembered?
- **Kill mid-flow**: force-quit during plan creation, relaunch — no ghost plan, no corrupted draft.
- **Double-tap** submit buttons — duplicate plans/requests are classic trigger-backed bugs.
- **Stale screen actions**: leave plan detail open, have the actor script delete the plan, then RSVP — graceful error or crash?
- **Offline**: airplane-mode the simulator mid-action (`xcrun simctl status_bar` + network link conditioner), verify error handling and recovery on reconnect.
- **Time edges**: plans for today at a slot that just passed, availability edits at 11:55pm, the week navigator across a month/year boundary, away trip spanning a timezone change (vibeStore carries timezone).
- **Notification tap routing**: for each notification type, `xcrun simctl push` a crafted payload → assert it deep-links to the right screen, including when the app was killed and when the target was deleted.

### 4.4 Deep-link surface
All landings are injectable without iMessage: `xcrun simctl openurl booted "https://helloparade.app/invite.html?t=..."` (exercises `+native-intent` rewriting), plus direct `parade://` routes for `invite/[code]`, `share/[code]`, `plan-invite/[token]`, `trip-invite/[token]`, `imsg`, `imessage-plan`. Each gets three variants: **logged in**, **logged out (must survive the login bounce — the redirect-preservation logic in `(app)/_layout`)**, and **invalid/expired token**.

### 4.5 Suite structure

```
.maestro/
  smoke/          # 5 min — launch, login, one plan create, tab sweep. Every build.
  journeys/       # 30-45 min — the four persona journeys. Nightly / pre-TestFlight.
  edges/          # human-behavior + deep-link + offline flows. Pre-release.
  helpers/        # login-as-<persona>.yaml, reset-and-seed hooks
```

---

## 5. Layer 3 — Exploratory audits (logic gaps & inconsistencies)

Automation proves flows work; it doesn't notice that two screens disagree. Run these as periodic structured sessions (Claude-driven against the simulator, or manual with the checklist):

### 5.1 Consistency audit checklist
- **Terminology**: is it "plan" vs "hang" vs "event" consistently? "Trip" vs "visit"? Same action named the same everywhere?
- **Date/time formats**: same format on Home cards, plan detail, day view, notifications?
- **Empty states**: every list screen (friends, plans, trips, notifications, pods, pending requests) has a designed empty state with a working CTA — audit via Liam.
- **Availability truth**: does the same slot read identically on Home free-windows, the Plans tab DateDials, day view, friend-profile free windows, and the share-availability preview?
- **Counts & badges**: pending-request count on Friends tab vs pending-requests screen; notification badge vs list.
- **Back/dismiss behavior**: every bottom-sheet modal — does swipe-down discard or save? Is it consistent?
- **Error copy**: same failure (network down) worded consistently across screens.

### 5.2 Human logic gap prompts
Walk each flow asking: *"What does a person expect to happen next, and does the app do that?"*
- After creating a plan, where do I land? Can I immediately find what I just made?
- If I RSVP no, does the plan disappear from my Home? Should it?
- If my only free slot gets a plan, does Home still recommend it as free? (`blockSlotsForPlan` coupling)
- If a friend removes me, what happens to our shared plans, pending hangs, pod memberships?
- If I change my availability after accepting a plan for that slot, does anything warn me?
- Does the smart CTA on Home ever recommend something impossible (plan with zero friends, weekend slot on Sunday night)?

Findings route straight into Linear via the existing `roadmap/` harness (`linear-write.mjs`), tagged as an XPE cluster.

---

## 6. Rollout plan

**Phase 1 — Foundation (first)**
Test phone numbers in Supabase config · 4 fixture accounts · `test-seed.mjs` with allowlist guardrail · testIDs on auth + tab bar + create menu · Maestro installed · 3 smoke flows green (launch→login, create plan, tab sweep).

**Phase 2 — Backend contracts**
`tests/backend/` covering the 7 clusters in §3, `npm run test:backend`. Immediately valuable as migration-regression protection.

**Phase 3 — Persona journeys**
Nora's full first-run journey first (highest value), then Olivia, Ravi, Liam. Headless-actor script for counterpart actions.

**Phase 4 — Edges + audits**
Deep-link matrix, offline/kill/double-tap flows, notification routing, first consistency audit session.

**Ongoing cadence**
- Smoke suite: every dev-client build / before every TestFlight upload
- Backend contracts: before every migration + nightly
- Journeys: nightly (local) or pre-release
- Exploratory audit: monthly, or after any major feature ships

---

## 7. Known constraints

- **Single Supabase project (prod)** — no staging. All safety comes from the fixture-account allowlist in the seed script. If test volume grows, revisit a Supabase branch/staging project.
- **Apple Sign-In** is un-automatable on simulator — covered only by manual pre-release check.
- **iMessage extension UI** can't be driven by Maestro — test its *landings* (`imsg`, `imessage-plan`, universal links) via URL injection; the extension itself stays a manual checklist item.
- **Push delivery** end-to-end (Expo push → APNs) isn't simulator-testable — test the notification *row creation* in L1 and the *tap routing* via `simctl push` payloads.
