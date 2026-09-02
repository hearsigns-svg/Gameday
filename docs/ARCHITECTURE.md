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

## Calendar write paths (v1 provider path; Prompt 28 REST path)

Two write paths, selected per install by `data/calendarBackend.ts`
(`'provider' | 'rest'`) behind ONE facade, `data/driver.ts`. The sync
engine imports the facade and nothing platform-shaped; every verb
branches on the active backend there and nowhere else.

**iOS — the provider path.** expo-calendar over EventKit: one permission
prompt, no OAuth. **The calendar target** (docs/CALENDAR_TARGET.md) is
which calendar the write lands in, resolved automatically on the first
sync and sticky afterwards: a dedicated KickOffCal calendar created in a
writable cloud source (iCloud), a device-local calendar as the fallback,
or a calendar of the user's own if they pick one in Preferences →
Calendar. Switching MOVES every ledgered event rather than orphaning it,
converging even if interrupted.

**Android — the REST path ("REST-always", Prompt 28).** Google Calendar
API v3 under the `calendar.app.created` scope, into a KickOffCal
calendar the app creates in the user's Google account. No
CalendarProvider write, no sync adapter, no mass-deletion gate — and a
scope that structurally cannot see the user's other calendars. The
authorization is a Google sign-in (account picker, then one consent
naming one permission), not an account system; its expiry is the typed
`auth-expired` state, surfaced on the Schedule chip and as the
Preferences reconnect row. The pre-P28 Android provider path (writing
into the user's primary Google calendar) is RETIRED as a write path:
until Google is connected an Android install is fixtures-only, and a
legacy install is auto-downgraded to that state (Round 4 B4,
2026-09-02). Its old events stay where the provider path wrote them —
the REST scope cannot reach them — and the Connect row says so.

**One connection truth.** `data/calendarConnection.ts` answers
`connected | needs-google-connect | off` from the stored choice, the
install's sync route and the armed backend (rule in
`domain/calendarConnection.ts`). The engine's gate, the calendar-off
banners, the Connect row and the picker all read it; reinstall healing
latches an opt-in from durable evidence only where that opt-in would
actually connect.

**One target record.** Both paths write `calendarTarget.v1`
(`data/calendarTargetStore.ts`) when they resolve; connect and
disconnect clear it. Preferences, the priming confirmation and the erase
copy read that record and nothing else.

**Colour.** The saved colour (`calendarColour.v1`, one shared store) is
painted by whichever path owns the calendar: EventKit `update({ color })`
on the provider path; `PATCH users/me/calendarList/{id}?colorRgbFormat=
true` on the REST path — at creation, on every resolve until applied,
and on each change. A refusal (403/400) is recorded and shown, never
assumed away; a scope refusal is not a rate limit and is not retried.

Google's sensitive-scope verification for `calendar.app.created` is a
launch-prep item (PLAN.md, M7); until then the consent screen runs in
Testing status and refresh tokens expire weekly.

Two independent gates keep the provider path safe once the target may
be a calendar the user owns:
- **Event-level.** `domain/recovery.ts` is the only thing that decides an
  event is ours (our `NOTES_TAG` plus a usable fixture id, in the target
  calendar). Recovery and prune consume that list and nothing else, so a
  user's own event cannot reach a delete call.
- **Calendar-level.** Renaming, recolouring or deleting a calendar
  requires it to be provably ours: the id we recorded, or a title match
  holding zero foreign events.

## Auth & entitlements

Firebase anonymous auth at first launch (server state, zero friction);
no accounts in v1 — the billing layer (RevenueCat, Stage 3) keys on the
anonymous uid and restore re-links a fresh uid on reinstall.
ENTITLEMENTS ARE ENFORCED CLIENT-SIDE IN THE SYNC PLANNER (Round 5,
2026-09-02): `src/core/entitlement.ts` turns the SDK's cached state into
planner effects (free = skip `create` only; downgrade = keep-window or
72-hour-window removals, capped per pass); the server never gates
polling, and `entitlements/{uid}` is the webhook's server-written mirror
(owner-readable, never client-written). Remote switches live in the
`status/flags` doc (`src/core/flags.ts`, fail-safe defaults).
Anonymous-loss-on-reinstall recovers via event-embedded fixtureIds.

## Error handling

The data boundary returns `Result<T, E>` (src/core/result.ts). UI never
sees raw exceptions; failures surface as typed states (offline, denied
permission, provider error) with explicit rendering.

## Per-sport configuration

Browse hierarchy, follow types, event rendering (span vs timed vs
sessions), and polling cadence are per-sport CONFIG, not per-sport code.
Adding a sport = provider adapter + config entry + quality-bar check.
