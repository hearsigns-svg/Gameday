# Gameday — Agent Guide

Expo SDK 57 — read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing code against Expo APIs.

## Mission

Gameday puts sports fixtures into the user's phone calendar and keeps them
correct, silently. Follow teams, competitions, athletes, or series across
11 launch sports; the app writes fixtures to the device calendar and a
backend diff engine propagates schedule changes. One role. Minimal friction
is the first product principle: no sign-up to start, one permission prompt.

## Session start

Re-read this file and `docs/PLAN.md` before any action. PLAN.md is the
source of truth for build state — never chat history.

## Stack

- Expo SDK 57 / React Native 0.86 / TypeScript (strict), React Navigation
- expo-calendar (EventKit / CalendarProvider) — the device write path
- Firebase: anonymous Auth, Firestore, Cloud Functions + Scheduler, FCM
  (dedicated project — NOT shared with any other app)
- MMKV for the on-device sync ledger; jest for domain tests

## Commands

- `npm run ios` / `npm run android` — native build + launch
- **Metro port is 8082** — 8081 belongs to the owner's MedHandover session.
  Always pass `--port 8082`. RN 0.86 prebuilt core ignores the port at
  build time and the blank template has no dev-client, so after install:
  iOS sim → `xcrun simctl spawn booted defaults write com.hearsigns.Gameday
  RCT_jsLocation "localhost:8082"` then relaunch; Android →
  `adb reverse tcp:8081 tcp:8082`. Wrong-port symptom: RedBox
  "PlatformConstants could not be found" (foreign bundle from 8081).
- app.json changes (name, icon, splash, plugins) do NOT reach native
  builds via `expo run:ios` when ios/ already exists — run
  `npx expo prebuild -p ios --clean` first (same for android/). CNG:
  both directories are generated, never hand-edited.
- CocoaPods needs UTF-8: prefix pod/expo-run commands with
  `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`.
- `ANDROID_HOME` is unset in the shell: prefix Android runs with
  `ANDROID_HOME="$HOME/Library/Android/sdk"` (Gradle fails with
  "SDK location not found" otherwise).
- Default `java` is JDK 26, which breaks the CMake configure step
  ("restricted method in java.lang.System"). Build Android with
  `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`
  (JBR 21). If a daemon ran under the wrong JDK: `./gradlew --stop` first.
- Firebase emulators: `firebase emulators:start --project demo-gameday` —
  Firestore 8180, Functions 5101 (offset from MedHandover's 8080/5001).
  Functions need `cd functions && npm run build` first.
- Simulator limits (verified): silent-push wake, BGTaskScheduler, and
  AppState 'active' on `simctl launch` of a running app do NOT fire on
  iOS sims — verify those layers on a real device (M6). Sync logic is
  testable via the in-app Sync now button.
- NEVER edit sync-engine source while an on-device sync is mid-run in
  dev: fast refresh resets the mutex while old closures keep executing —
  zombie runs race the ledger and duplicate events/calendars.
- `npx tsc --noEmit` — typecheck (must stay clean)
- `npm test` — jest unit tests, run TWICE: under UTC and under
  TZ=America/Los_Angeles. Every timezone bug the 2026-07-29 audit found
  was invisible in a UTC-only run — never reduce this back to one pass.
  (`npm run test:fast` = single current-zone pass for quick iteration.)
- `cd functions && npm test` — backend tests (once functions exist)
- `firebase emulators:start` — local Firestore/Functions/Auth

## Conventions

- Feature-first: `src/features/<name>/{presentation,domain,data}`;
  shared code only in `src/core`. No cross-feature imports except via core.
- Data boundary returns typed `Result<T, E>` — UI never sees raw throws.
- No magic constants; tokens come from `src/core/tokens` which mirrors
  `docs/DESIGN_SYSTEM.md`.
- Every fixture written to a calendar is recorded in the sync ledger;
  never create/modify/delete a calendar event outside the ledger path.
- Significant choices get one line in `docs/DECISIONS.md` (append-only).
- Stale docs are bugs: update PLAN/ARCHITECTURE/PRODUCT with the change
  that invalidates them, in the same commit.
- A milestone is never marked done with failing checks.

## Doc index

- `docs/PRODUCT.md` — vision, personas, journeys, scope, follow taxonomy
- `docs/ARCHITECTURE.md` — stack rationale, data flow, sync engine, folders
- `docs/DESIGN_SYSTEM.md` — semantic tokens, platform idioms, a11y rules
- `docs/DECISIONS.md` — append-only decision log
- `docs/PLAN.md` — dependency-ordered milestones + verification, current state
