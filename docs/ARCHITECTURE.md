# Gameday — Architecture

## Stack and rationale

Expo SDK 57 / React Native 0.86 / TypeScript strict; Firebase backend
(dedicated project). Chosen because: expo-calendar wraps EventKit (iOS)
and CalendarProvider (Android) behind one API — the make-or-break native
capability; silent FCM push + background fetch are first-class in Expo;
EAS builds both stores; the owner already operates a production
Expo+Firebase app so operational lore transfers. React Navigation over
expo-router: feature-first structure stays pure, matches owner experience.

## Repository map

```
gameday/
├── AGENTS.md / CLAUDE.md     # agent guide (CLAUDE.md includes AGENTS.md)
├── docs/                     # PRODUCT, ARCHITECTURE, DESIGN_SYSTEM,
│                             # DECISIONS, PLAN
├── src/
│   ├── core/                 # tokens, firebase client, mmkv storage,
│   │                         # Result type, calendar driver, push handling
│   └── features/
│       ├── onboarding/       # first-run, permission priming
│       ├── follows/          # browse sports → followables, manage follows
│       ├── fixtures/         # fixture models, upcoming views
│       ├── calendar-sync/    # sync engine, event ledger, preferences
│       └── settings/         # calendar options, about
└── functions/                # Cloud Functions: provider adapters, poller,
                              # diff engine, push dispatch, entitlements
```

Feature folders split `presentation/ domain/ data/`. Cross-feature
imports only via `src/core`.

## Data flow

1. **Central fixture cache.** Cloud Scheduler polls each sport's provider
   on a per-sport cadence; adapters normalise into canonical Firestore
   `fixtures` docs. Provider calls scale with SPORTS COUNT, not user
   count — one poll serves every user. This keeps API cost flat.
2. **Provider adapters** (`functions/src/providers/<name>`). One adapter
   per provider behind one normalised interface: teams, competition,
   startUtc, venueTimezone, status (scheduled|tbd|postponed|cancelled|
   finished). Primary: API-Sports family (soccer, basketball, baseball,
   hockey, NFL, rugby, F1, MMA). Cricket, tennis, golf need dedicated
   providers. Adapters have contract tests incl. DST-crossing fixtures.
   Swapping providers never touches the app.
3. **Diff engine.** Each poll diffs against the cache: new / time-changed
   / cancelled / tbd-sharpened. Changes fan out to affected users' sync
   queues (keyed by followable).
4. **Device sync ledger** (MMKV): `fixtureId → calendarEventId` per
   calendar. Every sync is idempotent: upsert ledgered events, delete
   cancelled, NEVER touch events the app didn't create. fixtureId is also
   embedded in the event URL/notes so the ledger can be rebuilt after
   reinstall. One mutex-guarded sync run at a time; a killed sync re-runs
   harmlessly.
5. **Change propagation, three layers:** silent FCM push on diff (best
   effort) → daily background fetch → always sync on app foreground.
   Worst-case staleness is bounded by app-open frequency; staleness is a
   tracked metric from the proving slice onward. Escalation path if
   unacceptable: server-side Google Calendar API write (deferred
   milestone), not a redesign.

## Calendar write path (v1 decision)

On-device write via expo-calendar reaches ANY calendar account the phone
syncs (Google, Apple, Outlook) with one permission prompt and no OAuth —
lowest possible friction, and it avoids Google's multi-week sensitive-
scope verification. Server-side Google API write is a deferred milestone.

**The calendar target** (docs/CALENDAR_TARGET.md) is which calendar that
write lands in, resolved automatically on the first sync and sticky
afterwards: a dedicated KickOffCal calendar created in a writable cloud
source on iOS, the primary Google calendar on Android (where an app
cannot create inside a `com.google` account, only write into one), and a
device-local calendar as the fallback. The user can change it in
Preferences → Calendar; switching MOVES every ledgered event rather than
orphaning it, converging even if interrupted.

Two independent gates keep that safe once the target may be a calendar
the user owns:
- **Event-level.** `domain/recovery.ts` is the only thing that decides an
  event is ours (our `NOTES_TAG` plus a usable fixture id, in the target
  calendar). Recovery and prune consume that list and nothing else, so a
  user's own event cannot reach a delete call.
- **Calendar-level.** Renaming, recolouring or deleting a calendar
  requires it to be provably ours: the id we recorded, or a title match
  holding zero foreign events.

## Auth & entitlements

Firebase anonymous auth at first launch (server state, zero friction);
account linking (Apple/Google) only when subscription requires it.
Entitlements enforced server-side from day one. Anonymous-loss-on-
reinstall recovers via event-embedded fixtureIds.

## Error handling

The data boundary returns `Result<T, E>` (src/core/result.ts). UI never
sees raw exceptions; failures surface as typed states (offline, denied
permission, provider error) with explicit rendering.

## Per-sport configuration

Browse hierarchy, follow types, event rendering (span vs timed vs
sessions), and polling cadence are per-sport CONFIG, not per-sport code.
Adding a sport = provider adapter + config entry + quality-bar check.
