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
- `npx tsc --noEmit` — typecheck (must stay clean)
- `npm test` — jest unit tests (domain logic)
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
