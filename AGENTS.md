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
- Emulator DNS is captured AT BOOT. If the host Mac changes network
  after the emulator started, every hostname inside it stops resolving
  (raw-IP pings still work) and Firestore fails with code=unavailable —
  looks exactly like an app bug, is not. Reboot with
  `emulator -avd Phone_1 -dns-server 8.8.8.8,1.1.1.1`. A killed
  emulator can leave a stale AVD lock: add `-read-only`.
- Verify Android sync HEADLESSLY when the emulator UI is ANR-thrashing
  (8GB host vs the AVD's 16GB suggestion): the calendar provider is the
  source of truth —
  `adb shell content query --uri content://com.android.calendar/calendars`
  then `.../events --where "calendar_id=N"`. Stronger proof than a
  screenshot, and immune to SystemUI hangs.
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
- Backend tests are NOT a separate command: `functions/package.json` has
  only a `build` script, and the ROOT jest run collects
  `functions/src/__tests__` (it ignores only `functions/lib`). `npm test`
  at the root is the whole surface, backend and client — 58 suites.
  Note `npm test` ALREADY runs both timezones (`TZ=UTC jest &&
  TZ=America/Los_Angeles jest`), so one invocation satisfies the
  run-twice rule.
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

## Standing conventions (owner, 2026-07-31; deploy rule revised 2026-08-03)

These apply to every stage. They do not need restating in a brief.

1. **You deploy** (owner ruling 2026-08-03, supersedes the original
   commands-are-the-owner's rule). Run deploys yourself rather than
   handing over commands — deploy is a step in the work, not a reflex:
   - Only after the FULL test suite, both typechecks and the functions
     build are green, and only after the adversarial review round has
     run and its findings are fixed.
   - Announce what and why before; confirm the outcome after, including
     anything that failed.
   - Incremental only — `--only functions`, `--only firestore:rules`,
     `--only firestore:indexes`. Never a bare `firebase deploy`.
   - **Migrations and destructive scripts stay the owner's.** Anything
     that deletes, soft-cancels or rewrites existing production
     documents: dry-run, show the output, wait for explicit approval
     before `--apply`. Deploying code is the agent's; changing data
     that already exists is the owner's.
   - Never enable the reaper (`REAPER_ENABLED` stays false until the
     owner says so in a message, not a brief). Never touch TTL policies
     or anything in the Firebase / Google Cloud console.
   - A failed deploy is reported, not retried blind.
   Anything else the owner must run personally still goes in a
   `## Run these` block — complete, pasteable, one command per block.
2. **Internal gates, not external checkpoints.** Each brief names the
   specific conditions under which to stop and ask. Outside those
   conditions, keep going: do not stop after each sub-item for approval.
3. **Verify deployment state at the START of every stage.** Establish it
   from the live project — `firebase functions:list`,
   `firebase firestore:indexes`, a `coverageReport` call — never from
   PLAN.md or from what a previous stage said it would do. Do not assume
   the previous stage's commands were ever run.
4. **Standing invariant:** a read failure must never be indistinguishable
   from an empty result. No `?? []` on a response shape, no treating a 2xx
   as success, no scan returning empty being read as "nothing there".
5. **Horizon rule:** only fixtures that have NOT YET FINISHED are ever
   created, updated or deleted in a calendar. `isPast`
   (`src/features/fixtures/domain/horizon.ts`) is the one definition.
6. The other Claude Code session must be idle against production during
   any reaper run.
7. **One session per feature area, and commit before switching windows**
   (owner ruling 2026-08-03). Prompt 11 found an uncommitted, unreported
   half-feature from another session in the tree — five failing tests,
   design decisions nobody had reviewed. Never leave a feature area's
   working tree dirty for another session to inherit; if work must
   pause, commit it (marked WIP) and say so in the session that owns it.
8. **Verify the layer the feature reads, not a layer that happens to
   agree** (owner ruling 2026-08-03, from F40). Prompt 9 verified
   tournament follows by reading `listTournaments` — computed from
   titles at serve time — while the stored docs' followKeys, the layer
   follows actually query, carried nothing. A derived view agreeing is
   not proof; probe the store the feature depends on.
9. **Any stage that touches client code ends with a simulator rebuild
   and a stated list of what changed on screen** (owner ruling
   2026-08-03). Six client commits drifted unshipped across five
   stages because server deploys happened within minutes and client
   builds happened never. A Release-configuration simulator build
   (embedded bundle) counts; a Metro session does not — it dies with
   the terminal.
10. **Never render a section whose content explains why something is
    unavailable** (owner ruling 2026-08-04). Omit it. Explaining an
    absence draws attention to it; silence makes the feature simply not
    exist on that platform. Condition on a CAPABILITY the code can
    probe, never on `Platform.OS` — when the capability arrives, the
    control appears without a code change.
11. **Explanatory prose in UI is a signal the design has failed.** If a
    screen needs a paragraph to explain itself, the design is doing too
    little and the copy is compensating. The control should show what it
    does; the state should show what it is.
12. **Generic caps section headings are a Settings-app pattern.** Group
    content by rhythm, weight and spacing instead. A screen assembled
    from labelled sections has stopped being designed.

## Concurrency against production

A second Claude Code session (the owner's) also writes to the production
Firestore. Confirmed 2026-07-31: 272 Premier League fixtures appeared
mid-audit, off the sweep's schedule, from that session's app usage.

From M-remediation Stage 4 onward this matters for correctness, not just
for measurement: the reaper computes fetched-versus-stored per slice, and
another process writing the same slice during that window can make a live
fixture look absent. **Reaper dry-runs and executions require the other
session to be idle against production.** Coordinate before running either.
