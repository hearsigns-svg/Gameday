# Plan — dependency-ordered milestones

Status legend: [ ] not started · [~] in progress · [x] done (checks green)

## M0 — Environment & skeleton  [x]

Toolchain verified; bare scaffold builds and runs on BOTH platforms.
- Verified 2026-07-25: template screen on-device on iPhone 17 Pro sim
  (iOS 26.5) and Phone_1 emulator, each served by Gameday's own Metro
  (706/707 modules); `npx tsc --noEmit` clean; knowledge base committed.
- Environment lore discovered (recorded in AGENTS.md Commands): Metro
  pinned to 8082 (8081 = owner's MedHandover) with RCT_jsLocation /
  adb-reverse overrides; CocoaPods needs UTF-8 locale; Android builds
  need ANDROID_HOME + JBR 21 (default JDK 26 breaks CMake configure).

## M1 — Proving vertical slice  [ ]

Thinnest path through every risky joint: follow ONE soccer team →
provider adapter fetches fixtures → canonical cache (Firestore emulator
acceptable) → device-calendar write with ledger on iOS AND Android →
simulated fixture change → diff → silent push → background re-sync
corrects the event without duplicates.
- Verification: fixtures appear in device calendars on both platforms;
  re-running sync creates zero duplicates; a time-change propagates via
  simulated silent push (simctl push acceptable on iOS sim); killed
  mid-sync then re-run = correct state; domain unit tests green.
- External unlocks needed from owner: API-Sports key (free tier OK for
  slice); Firebase project + Blaze billing for real Scheduler/FCM
  (emulator until then).

## M2 — Fixture platform hardening  [ ]

Adapter framework, multi-league soccer, diff edge cases (TBD, postponed,
cancelled, DST-crossing), adapter contract tests.
- Verification: contract tests green incl. DST cases; edge-case fixture
  transitions produce correct calendar mutations in emulator E2E.

## M3 — Follow experience  [ ]

Browse/search per-sport hierarchies (config-driven), follow management,
calendar preferences (reminders, all-day, naming, F1 race-only).
- Verification: all follow types creatable/removable; preferences apply
  to newly synced events; a11y pass on new screens; typecheck/tests green.

## M4 — Sync robustness  [ ]

Reinstall recovery (rebuild ledger from event-embedded fixtureIds),
calendar choice, multi-device, kill-state resumption, undo-unfollow.
- Verification: delete+reinstall → no duplicates after recovery sync;
  unfollow removes exactly its events; two devices converge.

## M5 — Sport expansion  [ ]

Data-quality order: basketball, NFL, baseball, ice hockey, rugby, F1
(API-Sports family) → cricket (dedicated provider) → tennis, golf, UFC
(exercise placeholder machinery hardest).
- Verification: per-sport quality bar (spot-check vs official schedules);
  span/session/placeholder rendering correct per taxonomy.

## M6 — Propagation & observability  [ ]

Real FCM silent push + background fetch tuning, staleness metric,
entitlement scaffold (server-side, no UI).
- Verification: staleness measured on real devices; push-triggered
  background sync observed on iOS device (not just simulator).

## M7 — Polish & store readiness  [ ]

Onboarding, empty states, full a11y pass, privacy manifests + purpose
strings, store listings, screenshots, name availability check.
- Verification: review checklist clean; EAS production builds submitted
  to TestFlight/closed track.

## External lead times (facts, not schedule)

- Apple organisational enrolment (D-U-N-S): commonly 1–4 weeks — owner
  should start now.
- If Play account is personal: 12-tester/14-day closed test required
  before production; organisational account avoids this.
