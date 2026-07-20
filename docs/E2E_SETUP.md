# E2E Setup — operator runbook

One-time setup to make the E2E harness runnable, in order. After this you can
run the seed/reset script and the Maestro flows. Read
[`E2E_TESTING_STRATEGY.md`](./E2E_TESTING_STRATEGY.md) first for the *why* (the
3-layer model, personas, rollout phases).

> ⚠️ **There is no staging Supabase project.** Every backend action here — the
> seed script, the fixture accounts, the OTP verifies — runs against the
> **production** project. All safety comes from the fixture-account allowlist in
> `scripts/test-seed.mjs` (see step F). Never point these tools at anything but
> the four test accounts.

The personas and their test phone numbers (static OTP `123456`):

| Phone | Persona | Role |
|---|---|---|
| `+15005550001` | Olivia | organizer |
| `+15005550002` | Ravi | responder |
| `+15005550003` | Nora | new user (reset every run) |
| `+15005550004` | Liam | lurker (never completes onboarding) |

These match the `TEST_PHONES` allowlist hardcoded in `scripts/test-seed.mjs`.

---

## A. Register the 4 test phone numbers (static OTPs)

Supabase supports **test phone numbers** that skip the SMS provider entirely and
accept a fixed code — deterministic, no Twilio spend, and the real OTP UI still
gets exercised.

1. Supabase Dashboard → **Authentication → Sign In / Providers → Phone**
   (older UIs: **Auth → Providers → Phone**).
2. Scroll to **Test OTP** (a.k.a. "Test phone numbers").
3. Add one row per persona, each mapping the number to code `123456`:

   ```
   +15005550001 = 123456
   +15005550002 = 123456
   +15005550003 = 123456
   +15005550004 = 123456
   ```

4. Save. (Equivalent config-as-code: `auth.sms.test_otp` in `supabase/config`.)

Now `signInWithOtp` for any of these numbers returns without sending an SMS, and
`123456` verifies. The static OTP has no rate limit on the code itself, but
repeated *sends* still hit Supabase's per-number SMS request window — space
resends out (see catalog case AUTH-06).

## B. Get and export the service-role key (never commit it)

The seed/reset script needs the **service-role** key to bypass RLS.

1. Supabase Dashboard → **Project Settings → API → Project API keys →
   `service_role`** → reveal + copy.
2. Export it in the shell where you run the script (do **not** put it in a
   committed file):

   ```bash
   export SUPABASE_SERVICE_ROLE_KEY='...'
   ```

   The script also reads `.env` / `.env.local` (`.env.local` wins), and both are
   gitignored (`.env`, `.env.*`, except `.env.example`). `.env.local` is the safe
   place if you prefer a file. It also requires `EXPO_PUBLIC_SUPABASE_URL` (already
   in `.env` for the app). **Never commit the service-role key** — it grants full
   admin access to production.

## C. Create + sign in the fixture accounts once

`test-seed.mjs` never creates auth users; it only resolves them by phone and
edits their app-data rows. So each fixture account must exist first. Sign each
persona in once so `handle_new_user` creates its `auth.users` + `profiles` row:

- **Easiest:** on the simulator, launch the app and log in as each number via
  the phone-OTP flow (`+1500555000X` / `123456`). For Olivia and Ravi, complete
  onboarding (they need real profiles). Leave Nora pre-onboarding-ish (the reset
  step will force `onboarding_completed=false` anyway). Liam can bail out of
  onboarding — that's his whole persona.
- **Or headless:** create them via the Supabase admin API
  (`auth.admin.createUser` with the phone + `phone_confirm: true`), then let the
  profile trigger populate `profiles`.

Until an account exists, the script reports it as missing and (for `seed`)
aborts if Olivia or Ravi is absent.

## D. Run reset + seed

`scripts/test-seed.mjs` has two commands and is **dry-run by default** — it
prints what it *would* touch and changes nothing. Pass `--go` to actually
execute.

```bash
# Preview first (safe, no --go): prints the fixtures it resolved and the
# scoped deletes/updates it would perform.
node scripts/test-seed.mjs reset
node scripts/test-seed.mjs seed

# Then run for real:
node scripts/test-seed.mjs reset --go && node scripts/test-seed.mjs seed --go
```

- **`reset`** — for each fixture: deletes the plans/trips/open-invites/pods/
  hang-requests/friendships/intentions/notifications they own or participate in,
  resets their availability to all-free/home across a ±90-day window, and flips
  **Nora's** `onboarding_completed` back to `false`. It never deletes auth
  accounts — only their app-data rows.
- **`seed`** — builds the standing fixture world: Olivia ↔ Ravi connected
  (both directions), Ravi free next Saturday afternoon/evening, and a pending
  Liam → Olivia friend request. Extend `seed()` with the plan/trip fixtures your
  journeys need. Requires Olivia + Ravi to exist.

**Run `reset --go && seed --go` before every test run** — a deterministic
starting state is what makes failures diagnosable.

## E. Install Maestro + run the smoke flow

```bash
# Install (one time):
curl -Ls "https://get.maestro.mobile.dev" | bash
# add ~/.maestro/bin to PATH, then:
maestro --version

# Maestro is JVM-based and needs Java on PATH. This machine has openjdk@17 via
# brew but it is NOT on PATH by default, so export it (add to your shell rc):
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export PATH="$JAVA_HOME/bin:$PATH"

# Smoke test — works against ANY installed build, no fixtures, no login.
# VERIFIED PASSING against the current dev build (2026-07-19):
#   launchApp → assertVisible(stable copy) → takeScreenshot all COMPLETED.
maestro test .maestro/smoke/01-launch.yaml
```

Then the persona journeys (need steps A–D done first):

```bash
maestro test .maestro/journeys/01-create-plan.yaml
```

Flow layout, run-order convention, and the headless-counterpart-actor pattern
are documented in [`.maestro/README.md`](../.maestro/README.md).

## F. Prod-safety guardrail (how the allowlist protects real users)

Because there is no staging project, `scripts/test-seed.mjs` is layered so it can
only ever touch the four fixture accounts:

1. **Service-role key is required** and must be exported at runtime — never
   committed.
2. **Dry-run by default** — nothing is written unless you pass `--go`.
3. **Allowlist scoping** — the script resolves fixtures only by matching
   `auth.users.phone` against the hardcoded `TEST_PHONES` set
   (`+1500555000{1..4}`). Every destructive query is `.in('...', fixtureIds)`,
   scoped to those resolved UUIDs — it never issues an unscoped delete.
4. **Defense-in-depth re-check** — after resolving, it re-verifies every resolved
   account still maps to a test phone and **aborts** (`SAFETY ABORT`) if not.

If you ever add a fixture, add its number to `TEST_PHONES` *and* register it as a
test OTP (step A). Do not remove the allowlist.

---

## Cross-references

- **Test-case backlog:** `docs/test-catalog/` — 672 code-grounded cases across
  18 sections, each tagged L1/L2/L3 + priority + persona + a `file:line` ref.
  Every L2 case names the testIDs it needs. *(Currently lives in the `parade-ios`
  checkout at `parade-ios/docs/test-catalog/`; it lands here under `docs/` when
  that branch merges.)*
- **Candidate defects:** `docs/test-catalog/FINDINGS.md` — 100+ candidate bugs
  surfaced while building the catalog (e.g. the post-OTP onboarding-gate bypass,
  the anon `check_username_available` RLS bug). Read this if you care about bugs
  before coverage.
- **Backend contract tests (L1):** strategy §3 — plan `tests/backend/` next; they
  run in seconds and double as migration-regression protection.
