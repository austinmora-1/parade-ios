# Parade Maestro flows (Layer 2 — UI journeys)

Persona-driven UI automation for the Parade iOS app, per
[`docs/E2E_TESTING_STRATEGY.md`](../docs/E2E_TESTING_STRATEGY.md) §4. These are
the L2 layer of the 3-layer model; the granular case backlog lives in the
[test-catalog](../../parade-ios/docs/test-catalog/) (parade-ios checkout).

`appId` is `app.parade.ios`.

## Prerequisites

- **Maestro installed** — `curl -Ls "https://get.maestro.mobile.dev" | bash`
  (then ensure `~/.maestro/bin` is on your `PATH`). Verify with `maestro --version`.
- **A running simulator** with a Parade dev-client (or TestFlight) build
  installed. Maestro drives whatever build is installed for `app.parade.ios`;
  it does not build the app.
- **Fixtures** for anything beyond the smoke flow — the four static-OTP test
  numbers registered in Supabase Auth, the fixture accounts signed in once, and
  `test-seed.mjs reset && seed` run. Full setup: [`docs/E2E_SETUP.md`](../docs/E2E_SETUP.md).

## Running

```bash
# Smoke — runs against ANY build, no fixtures, no login required:
maestro test .maestro/smoke/01-launch.yaml

# A whole directory in run order:
maestro test .maestro/smoke

# A persona journey (needs fixtures + seed):
maestro test .maestro/journeys/01-create-plan.yaml

# Interactive element inspector (great for finding/adding testIDs):
maestro studio
```

## Layout & conventions

```
.maestro/
  smoke/      # fast sanity flows — every build. 01-launch runs with no fixtures.
  journeys/   # persona journeys (Olivia/Ravi/Nora/Liam) — need fixtures + seed.
  helpers/    # reusable subflows invoked via `runFlow` (e.g. login-as).
  edges/      # (future) human-behavior + deep-link + offline flows.
```

- **Run order:** files are named `NN-name.yaml` (`01-`, `02-`, …). `maestro test
  <dir>` runs them in filename order, so the number encodes intended sequence.
- **testIDs over text:** prefer `id:` selectors (`tapOn: { id: "login.verify" }`)
  over visible text — copy iterates constantly and text selectors rot. The
  convention is kebab-case `screen.element` (e.g. `login.phone-input`,
  `tabs.create`, `what-planning.quick-plan`). Text selectors are an explicit
  stopgap only where a screen has no testIDs yet (see the note in
  `journeys/01-create-plan.yaml`).
- **Subflows:** shared steps live in `helpers/` and are pulled in with `runFlow`,
  parameterized via `env`.

## What runs now vs. needs fixtures

| Flow | Runs today? | Needs |
|---|---|---|
| `smoke/01-launch.yaml` | ✅ any build | nothing — no login, no testIDs |
| `helpers/login-as.yaml` | ⛔ (subflow) | static-OTP test numbers + fixture accounts |
| `journeys/01-create-plan.yaml` | ⛔ | fixtures + `test-seed.mjs reset && seed` |

## testID coverage so far

Only the three highest-traffic surfaces are wired up (strategy §2.3 step 1–2):

- **`app/(auth)/login.tsx`** — `login.phone-input`, `login.send-code`,
  `login.otp-input`, `login.verify`, `login.change-number`, `login.resend-code`,
  `login.other-ways`, `login.apple`, `login.email-input`, `login.password-input`,
  `login.username-input`, `login.sign-in`, `login.sign-up`, `login.send-reset`,
  `login.forgot-password`, `login.use-phone`, `login.back-to-signin`,
  `login.to-signup`, `login.to-signin`.
- **`components/navigation/FloatingTabBar.tsx`** — `tabs.home`, `tabs.plans`,
  `tabs.friends`, `tabs.profile`, `tabs.create`.
- **`app/(app)/what-planning.tsx`** — `what-planning.find-time`,
  `what-planning.quick-plan`, `what-planning.new-trip`,
  `what-planning.vibe-check`, `what-planning.find-people`,
  `what-planning.share-availability`, `what-planning.add-friends`.

Add more opportunistically as flows get written (plan detail, RSVP, friend
requests come next per the catalog).

## The multi-user trick: headless counterpart actor

Most social flows need a second user, but two simulators are slow and flaky.
Instead (strategy §4.2): **Maestro drives one persona in the UI while a Node
"actor" script performs the counterpart's actions via `supabase-js`** (accept the
friend request, RSVP, vote, claim the invite). Sequence the two with a wrapper
shell script around `maestro test`, or Maestro's `runScript` hook. Reserve true
two-simulator runs for the tiny set of realtime-rendering tests (vibe updates,
live conversation) where the pushed update itself is under test.
