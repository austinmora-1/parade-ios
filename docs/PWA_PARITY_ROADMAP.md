# Parade iOS — PWA Parity Roadmap (Phases 6–10)

Comprehensive audit of every Parade PWA feature not yet implemented in the iOS app. Findings produced via cross-reference against the PWA codebase (https://github.com/austinmora-1/parade-pwa) as of 2026-05.

**Status legend:** ⬛ Not started · 🟨 Partial · ✅ Implemented · 🟥 Intentionally deferred

Effort sizing: **S** = ≤1 file / ≤2 hrs · **M** = 1–3 files / half-day · **L** = multi-file flow / ≥1 day

---

## Phase summary table

| Phase | Theme | Headline items |
|---|---|---|
| **6** | Critical user-facing parity | Multi-path FAB sheet · 4-step Onboarding wizard · ParadeTour · SmartPrimaryCTA · PolishProfileCard · PushNotificationPrompt · GreetingHeader location popover |
| **7** | Friend interaction depth | Pods · Hang requests · Group scheduler · Rich Friend profile · Streak (Flame) · Mutual free-slot overlap math |
| **8** | Plan depth | Plan proposals + voting · Trip proposals + voting · Change requests · Recurring plans · Open-invite discovery · Feed visibility · Comments · Photos · Participant join requests |
| **9** | Profile + vibes depth | Vibe + Weekly Intentions card · Cover photo + crop · Bio autosave · Plan history · QuickStats · LocationTimeline · Social preferences · Granular privacy |
| **10** | Polish | Theme schemes · Auto dark mode · Rich notifications · Sharing suite · Recommended plans · Custom activities · Travel activity types · Trip conflict dialog · Feed view · Feedback widget · Delete account |

---

## Phase 6 — Critical user-facing parity

| # | Item | Effort | Status | Notes |
|---|---|---|---|---|
| 6.1 | **Multi-path FAB** ("What are you planning?" sheet) — 3 entries: "Find time with friends" (GuidedPlanSheet) · "Find friends to join" (FindPeopleSheet → open invite) · "Go somewhere" (GuidedTripSheet) + "Invite friends to Parade" footer link | L | ⬛ | iOS FAB only opens new-plan. **User-flagged.** Each destination is its own multi-step flow. |
| 6.2 | **4-step Onboarding wizard** — `/onboarding` route. Steps: AccountCreation (phone+username uniqueness) → CalendarSync → Rhythm (work days + work-hour slider) → Friends (email chips). Dashboard redirects here if `profiles.onboarding_completed=false`. Uses `localStorage parade.onboarding_step` for resume | M–L | ⬛ | iOS sign-up only collects email/password/display_name. **Many profile fields never set.** |
| 6.3 | **ParadeTour walkthrough** — coachmark overlay running once after onboarding; 10 sequential steps across `/`, `/availability`, `/friends`. Gated by `profiles.walkthrough_completed` | M | ⬛ | Highlights FAB, vibe strip, free windows, plans nav, etc. |
| 6.4 | **EllyWalkthrough** — modal walkthrough that fires *only* for empty users (0 friends, 0 plans, walkthrough not done). 4 slides: Home Base · Making Plans · Trips · Social Health | S | ⬛ | Soft welcome state. |
| 6.5 | **SmartPrimaryCTA** — context-aware dashboard card. Currently only one state ("Today's plan" deeplink); fallback "make-plan" config exists but unused | S | ⬛ | Sits directly below greeting on Home. |
| 6.6 | **PolishProfileCard** — dismissible nudge on Dashboard when ≥3 of {interests, social_goals, social_cap, preferred_social_times} are empty. Dismiss key in localStorage | S | ⬛ | Routes to `/settings`. |
| 6.7 | **PushNotificationPrompt** — push permission nudge that fires only after user owns ≥1 confirmed plan. Won't re-prompt once resolved | S | 🟨 | iOS has `usePushToken` already; needs the contextual prompt UI. |
| 6.8 | **GreetingHeader location popover** — top-of-Dashboard card with personalized time-of-day greeting + current city + "Set location" popover (CityAutocomplete + "Also save as my home location"). FAB lives inside this header | M | 🟨 | iOS has the greeting but no city/location popover. Writes `availability.location_status='away'` + `profiles.home_address`. |

---

## Phase 7 — Friend interaction depth

| # | Item | Effort | Status | Notes |
|---|---|---|---|---|
| 7.1 | **Pods** (named friend groups) — name + emoji, member management, used for `feed_visibility='pod:<id>'`, targeted open invites, dashboard filtering. Tables: `pods`, `pod_members`. Profile col: `close_friend_ids[]`. EMOJI options: 💜🔥⭐🎯🏠🎉💪🌿🎵☕🍻🧘 | L | ⬛ | Surfaces: PodSection on Friends, PodWidget + FriendsAndPodWidget on Dashboard. |
| 7.2 | **Hang requests** — lightweight async pings ("Hey, free [day][slot]?"). Separate from plan invites; on accept, plan auto-creates. Table `hang_requests` + `hang_request_emails`. Privacy: `profiles.allow_all_hang_requests` + `allowed_hang_request_friend_ids[]`. Edge fn: `send-hang-request` | L | ⬛ | Inbox + outgoing tabs on Dashboard. |
| 7.3 | **Group scheduler** — Friends-page widget that stages multiple friends then routes to "Plan together" (GuidedPlanSheet) or "Plan a trip together" (GuidedTripSheet). Suggests most-co-planned friends | M | ⬛ | |
| 7.4 | **Rich friend profile** — cover photo, current vibe + GIF, bio, location status, mutual availability matrix, shared plans, "Plan with X" CTA | L | 🟨 | iOS has basic friend profile; missing vibe card + mutual matrix + shared plans + "Plan with X" CTA. |
| 7.5 | **Streak / "Last hung out" Flame** — Flame icon next to friend name, color-graded by recency (≤7d orange · ≤14d amber · ≤30d faded · else hidden). Subtitle "Xd ago / Xw ago / Xmo ago". Backed by `last_hung_out_cache` table | S | ⬛ | Surfaces in FriendListRow. |
| 7.6 | **Mutual free-slot overlap math** — FriendVibeStrip computes mutual free slots for today, falling back to friend-only-free labeled as non-mutual | M | 🟨 | iOS FriendVibeStrip exists and shows free days; verify the **mutual** overlap computation (vs friend's own free days). |

---

## Phase 8 — Plan depth

| # | Item | Effort | Status | Notes |
|---|---|---|---|---|
| 8.1 | **Plan proposals with ranked voting** — `plans.status='proposed'` + multiple (date, time_slot) options, participants drag-rank, organizer or auto-finalizes. Tables: `plan_proposal_options`, `plan_proposal_votes` | L | ⬛ | Routes: `/proposal/:id`. |
| 8.2 | **Trip proposals with ranked voting + activity suggestions** — like plan proposals but for trips: destination + date-range options + activity suggestions. Tables: `trip_proposals`, `trip_proposal_dates`, `trip_proposal_invites`, `trip_proposal_participants`, `trip_proposal_votes`, `trip_activity_suggestions`, `trip_activity_votes` | L | ⬛ | |
| 8.3 | **Plan change requests** — owner or participant proposes new date/slot/duration; participants accept/decline; plan stays at old time until majority agree. Tables: `plan_change_requests`, `plan_change_responses`. Amber "Change Proposed" banner on UpcomingPlansWidget | M | ⬛ | |
| 8.4 | **Recurring plans** — weekly / biweekly / monthly (Nth weekday). Spawns child rows via edge fn `generate-recurring-plans`. Table `recurring_plans`; `plans.recurring_plan_id` FK | M | ⬛ | |
| 8.5 | **Open-invite discovery (incoming)** — "Open invites for you" Dashboard widget surfacing invites you can claim. "I'm in" or dismiss. Tables: `open_invites`, `open_invite_responses`. Edge fns: `on-open-invite`, `claim-open-invite` | M | ⬛ | Distinct from our existing OpenInvitesWidget which shows specifically-invited plans. This is for *public* invites you can opt into. |
| 8.6 | **Feed visibility** (`private` / `friends` / `pod:<id>`) — per-plan setting controlling whether the plan appears in friends' feed. UI dropdown in CreatePlanDialog | S–M | ⬛ | iOS plan form currently hardcodes `feed_visibility: 'private'`. |
| 8.7 | **Merge plans** — detect & merge duplicate/overlapping plans (same friends, same window). MergePlansDialog | M | 🟥 | Niche; defer indefinitely. |
| 8.8 | **Plan comments + photos** — threaded comments (`plan_comments`) and post-plan photo uploads (`plan_photos`). New photos generate notifications | M each | ⬛ | |
| 8.9 | **Participant join requests** — non-invited friends request to join, owner approves. Table `plan_participant_requests`, RPC `approve_participant_request` | M | ⬛ | |
| 8.10 | **Time-range quick picker + slot-grid calendar picker** — granular start/end time pickers and visual slot-grid pickers inside plan creators | M | ⬛ | iOS uses simple slot chips. |
| 8.11 | **Plan-invite token landing** (`/plan-invite/:token`) — non-authed RSVP page for non-Parade recipients. Edge fns: `send-plan-invite`, `send-trip-invite` | M | 🟥 | Web-only; iOS needs Universal Link handling for deep-links instead. |

---

## Phase 9 — Profile + vibes depth

| # | Item | Effort | Status | Notes |
|---|---|---|---|---|
| 9.1 | **Vibe + Weekly Intentions card** — combined card showing (a) current vibe with optional Giphy GIF + custom hashtag tags and (b) weekly social intention with progress bar. Sheet for editing intentions: social_energy (low/medium/high), target_hangouts count, vibes[], notes as `[x] todo` syntax. Edge fn: `weekly-intention-nudge` | L | ⬛ | DB: `profiles.{custom_vibe_tags, vibe_gif_url}` + table `weekly_intentions`. |
| 9.2 | **Cover photo on profile with crop** — banner cover photo, upload/replace/remove, crop dialog before upload. Field: `profiles.cover_photo_url` | M | ⬛ | iOS profile hero has a primary-tinted banner placeholder; needs photo upload. |
| 9.3 | **Bio autosave** — 500-char bio textarea, autosaves on blur with saving/saved indicators | S | 🟨 | iOS has bio in edit-profile modal (saves on form submit); polish to autosave on profile inline. |
| 9.4 | **Plan history** (collapsible) — all past plans on profile with full detail | S | ⬛ | |
| 9.5 | **QuickStats card** — 4-tile grid: plans this week · hours planned · available slots · current vibe | S | ⬛ | |
| 9.6 | **LocationTimeline** — horizontal 31-day strip on profile showing location status per day (home/trip/visiting), click-to-edit, trip overlays | L | ⬛ | DB: `availability.{location_status, trip_location}` + trips. |
| 9.7 | **Add-trip CTA + NextTripCTA on Profile** — empty state + "Add trip" CTA + mini "next trip" preview card | M | ⬛ | iOS Plans tab has new-trip CTA; profile lacks it. |
| 9.8 | **Granular privacy controls** — beyond `show_availability`: `show_location`, `show_vibe_status`, `allow_all_hang_requests`, `allowed_hang_request_friend_ids[]`, `close_friend_ids[]` | M | 🟨 | iOS Settings has only `show_availability`. |
| 9.9 | **Social preferences** — `interests[]`, `social_goals[]`, `social_cap`, `preferred_social_times[]`, `preferred_social_days[]`. Drives plan suggestions | M | ⬛ | Set during onboarding wizard (6.2) or via PolishProfileCard (6.6). |

---

## Phase 10 — Polish

| # | Item | Effort | Status | Notes |
|---|---|---|---|---|
| 10.1 | **Theme color schemes** — green vs coral palettes. `.theme-green` / `.theme-coral` root classes. localStorage `parade-color-scheme` | S | ⬛ | iOS would need parallel token sets. |
| 10.2 | **Auto dark mode** — switches at 9pm → 7am local (period-aware, respects manual toggles) | S | ⬛ | |
| 10.3 | **Rich notifications screen** — aggregates 7 types: friend requests · hang requests · plan invites · plan change requests · recent plan photos · plan participant requests · trip proposals. Swipeable dismiss, confetti on accept | L | 🟨 | iOS has basic notifications + deep links; missing the rich grouped views per type. |
| 10.4 | **Push notification types** — granular Web Push backed by edge fns: `push-subscribe`, `send-push-notification`, scheduled `plan-reminders`. Tables: `push_subscriptions`, `push_config` | M | 🟨 | iOS has token registration; needs server-side push payload routing + APNs receiving. |
| 10.5 | **Calendar integrations beyond EventKit** — Google Calendar (OAuth, `google-calendar-*`) and iCloud via Nylas (`nylas-*`). Encrypted tokens via `encrypt/decrypt_calendar_token` RPCs. Table `calendar_connections`, fn `calendar-sync-all` | L | 🟥 | iOS EventKit covers Apple Calendar + most cases. Google/Nylas needed only for users without iCloud sync. **Defer unless requested.** |
| 10.6 | **Sharing suite** — UnifiedShareSheet with tabs (Link / Profile / Open invite), channels (SMS, WhatsApp, Email, Web Share API). OG image rendering via `og-image` / `og-invite-image` edge fns | L | ⬛ | DB: `profiles.share_code`, RPC `get_availability_by_share_code`. iOS has basic native Share but not the unified sheet UX. |
| 10.7 | **Public share landing** (`/share/:shareCode`) — public web view of a user's availability + vibe | M | 🟥 | Web-only; defer indefinitely. |
| 10.8 | **RecommendedPlanDialog + EventSuggestions** — activity suggestions for open slots, nearby-event surfacing. Edge fn `event-suggestions` | M | ⬛ | |
| 10.9 | **Custom activities** — user-defined activity types beyond presets. Stored per-user | M | ⬛ | |
| 10.10 | **Travel activity types** (`flight`, `hotel`) — special activities for travel logistics, filtered out of social activity pickers. MissingReturnDialog detects one-way flights and prompts | S | ⬛ | |
| 10.11 | **"From your calendar" badges + MissingReturnDialog** — visual tag for calendar-imported plans; flight-without-return prompt | M | ⬛ | iOS calendar sync exists; doesn't tag imported events. |
| 10.12 | **TripConflictDialog** — when adding a trip overlapping existing plans/trips, resolution dialog | M | ⬛ | |
| 10.13 | **Feed view** — friends' plan activity tab under HomeTabs, with comments + reactions. Filtered by `feed_visibility` | L | ⬛ | DB: `vibe_reactions`, `vibe_comments` (unused), `plan_comments` (wired). |
| 10.14 | **Floating feedback button** — persistent floating button + side-panel. Edge fn `submit-feedback`, table `feedback` | S | ⬛ | |
| 10.15 | **Send-friend-invite via email & SMS** — invite-friend dialog with email and SMS channels. Edge fns: `send-friend-invite`, `send-sms-invite`. Shareable invite link `/invite` | M | 🟨 | iOS has native Share with invite link; no email/SMS channels. |
| 10.16 | **GifPicker (Giphy)** — used in vibe card + comments. Edge fn `giphy-search` | S | ⬛ | Bundled into 9.1 (Vibe + Intentions). |
| 10.17 | **Delete account flow** — Settings dialog + edge fn `delete-account` | S | ⬛ | iOS Settings has Sign Out but no Delete. |
| 10.18 | **Loops.so newsletter subscription** — `loops-subscribe`, `sync-user-to-loops` edge fns | S | 🟨 | Likely already works server-side via shared backend on signup. |
| 10.19 | **Reset password page** | S | ✅ | iOS has it. |
| 10.20 | **Pull-to-refresh** | n/a | ✅ | iOS uses native RefreshControl across detail screens. |
| 10.21 | **Badge API** — `navigator.setAppBadge` for unread count | S | 🟨 | iOS equivalent is `UIApplication.applicationIconBadgeNumber` via APNs payload — needs server-side push to include badge count. |

---

## Out of scope (deferred indefinitely)

These exist in the PWA but are unused, deprecated, or not relevant for iOS:

- **`vibe_sends` / `vibe_reactions` / `vibe_comments`** — schema present, no UI consumes them. Deprecated feature.
- **Chat (`chat_messages` / `conversations` / `conversation_participants` / `message_reactions`)** — tables exist, only `GifPicker` references the chat namespace. No DM UI in PWA.
- **`allow_elly_hangouts` column** — "Elly the elephant" brand mascot only; no behavioral logic.
- **`smart_nudges` table** — exists but no client code consumes it.
- **`MergePlansDialog`** — niche power-user feature (8.7).
- **Desktop Sidebar** (`Sidebar.tsx`) — desktop-only.
- **`/share/:shareCode` web page** (10.7) and **`/invite.html`** — web-only public pages.

---

## Cross-cutting dependencies

These items have hidden dependencies that affect sequencing:

1. **Pods (7.1) → Feed visibility (8.6)** — pod-scoped visibility needs Pods to exist first.
2. **Onboarding wizard (6.2) → Social preferences (9.9) → PolishProfileCard (6.6)** — the preferences fields are *set* by onboarding and *prompted* by PolishProfileCard.
3. **GreetingHeader (6.8) → Multi-path FAB (6.1)** — in the PWA the FAB lives inside the GreetingHeader. iOS could keep them separate (current pattern is FAB bottom-right, header at top).
4. **ParadeTour (6.3) + EllyWalkthrough (6.4)** — should land together with the onboarding wizard so the full first-run experience is coherent.
5. **Push notification types (10.4) → Push prompt (6.7)** — server-side push payload routing should be ready before contextual push prompting kicks in.
6. **Hang requests (7.2) → Rich notifications screen (10.3)** — the rich screen aggregates hang requests as one of its 7 types.

---

## Recommended phase ordering

| Phase | Why | Estimated calendar effort |
|---|---|---|
| **6** | Critical user-facing parity. Onboarding wizard alone unlocks 15+ profile fields that drive every other feature's UX. Multi-path FAB is the #1 user-flagged gap. | ~2 weeks |
| **7** | Pods unlock pod-scoped feed visibility (which 8.6 depends on). Hang requests are the most-used surface in PWA per the rich notifications screen. | ~2 weeks |
| **8** | Plan depth. Proposals + recurring + open-invite discovery + comments/photos make planning feel finished. | ~2–3 weeks |
| **9** | Profile + vibes depth. Vibe-and-intentions is the "personality" of the app and reads back into FriendVibeStrip. | ~1–2 weeks |
| **10** | Polish. Theme, dark mode, sharing suite, recommended plans, custom activities, feed view, feedback widget. | ~2 weeks |

**Total remaining for full PWA parity: ~9–11 weeks** of focused work.

---

## Files referenced (PWA absolute paths)

Edge functions, components, hooks, and pages enumerated in the agent report. See section headers above for specific file paths.
