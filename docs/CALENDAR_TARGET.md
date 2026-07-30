# Calendar target — where KickOffCal writes your fixtures

**Status: SPEC, not built.** This is the execution brief for a new
session. Everything below the verdict was verified against real devices
and the installed SDK on 2026-07-30, not assumed.

## Why this exists

The product promise is: *your fixtures land in the calendar you already
use — native Calendar on iOS, Google Calendar on Android — and stay
correct.* Today we only half deliver that.

Verified evidence:

- **Android is wrong.** We create a **device-local** calendar. Queried
  live on the emulator:
  `calendar_displayName=KickOffCal, account_type=LOCAL, ownerAccount=Gameday`.
  It appears in the phone's calendar app and nowhere else: not on
  calendar.google.com, not on the user's other devices, and gone when
  they change phone. `calendarDriver.ts` sets
  `source: { isLocalAccount: true, type: 'LOCAL' }` for non-iOS.
- **iOS is right by luck, not by design.** We create the calendar in
  `Calendar.getDefaultCalendarSync().source.id` — the *default
  calendar's* source. For most people that is iCloud (cloud-synced,
  correct). For anyone whose default is "On My iPhone" it is local and
  silently phone-only. Unverifiable on a simulator: the sim has no
  iCloud account, and its only writable source is `Default` (type 0,
  local) — which is exactly why this was never caught.

The original M4 decision ("dedicated calendar only, never user
calendars") was right about *isolation from the user's data* and wrong
to also mean *isolation from the user's account*. Those are separable.

## Verdict / design

**One feature: the calendar target.** Not "dedicated vs cloud" — a
dedicated calendar CAN be cloud-synced. No OAuth is required on either
platform.

- **iOS**: EventKit can create a calendar in any writable source,
  including iCloud. So we create a dedicated **KickOffCal** calendar in
  a *cloud* source and the user does nothing. Fall back to local only
  when no cloud source exists.
- **Android**: an app cannot create a calendar inside a `com.google`
  account (only Google's sync adapter can). But it can WRITE into one.
  So: offer the user's existing Google-account calendars, and tell them
  they can make a dedicated one in Google Calendar in 20 seconds if
  they want isolation. Keep the local calendar as the zero-friction
  fallback when no Google account is present.

**Minimum friction is the requirement.** Nobody should have to choose
anything to get a working app. The picker exists for people with a real
choice (multiple accounts, work vs personal) and for anyone we cannot
serve automatically.

## Behaviour spec

### Default (no user interaction)

| Platform | Situation | Target |
|---|---|---|
| iOS | any writable cloud source (CALDAV/MOBILEME/EXCHANGE) exists | create dedicated **KickOffCal** in the source of the user's default calendar if that source is cloud; else the first writable cloud source |
| iOS | only a local source | create dedicated **KickOffCal** locally (today's behaviour) |
| Android | ≥1 writable calendar in a `com.google` account | **write into** the primary Google calendar (`isPrimary`, else the one matching the account name) |
| Android | no Google account | create the dedicated **LOCAL** calendar (today's behaviour) |

### Preferences → Calendar (new, first row)

Shows the current target: calendar name + account/source + a one-line
consequence, e.g.
- "KickOffCal · iCloud — syncs to your other Apple devices"
- "Personal · you@gmail.com — syncs to Google Calendar everywhere"
- "KickOffCal · On this device only — won't appear on your other devices"

Tapping opens a picker listing every **writable** calendar grouped by
account/source, plus (iOS) "Create a new KickOffCal calendar in
<source>". On Android, when the target is local, show a quiet hint:
"Using a Google calendar makes your fixtures appear on all your
devices."

### Switching target — the migration

Switching MUST move existing events, not orphan them:

1. Plan against the ledger as usual, but with the new calendar id.
2. For every ledgered fixture: create in the new calendar, then delete
   from the old, updating the ledger per operation (the ledger is
   already persisted per-op, so an interrupted switch converges).
3. If the OLD calendar is one WE created (title matches
   `CAL_TITLE`/`LEGACY_CAL_TITLES` and it holds only our tagged
   events), delete it once empty. **Never** delete a user's calendar.
4. Surface progress: "Moving 128 fixtures…" then a toast.

### The invariant that must get stricter

Today's prune rule is "delete any tagged event the ledger does not
reference". That is safe in a calendar we own. **Once we write into a
user's calendar it is not enough** — a bug could delete their events.
Tighten to: only ever delete an event that (a) carries our
`NOTES_TAG`, AND (b) is referenced by our ledger or was written by us
into the currently-targeted calendar. Add a test that a foreign event
in the target calendar is never touched by prune or recovery.

## Files to change

- `src/features/calendar-sync/data/calendarDriver.ts` — target
  resolution, source/account enumeration, creation per platform,
  migration, stricter prune guard.
- `src/features/calendar-sync/data/calendarTargetStore.ts` (new) —
  persisted chosen target `{ calendarId, kind: 'ours'|'user', label,
  accountLabel }`.
- `src/features/calendar-sync/domain/calendarTarget.ts` (new, PURE) —
  choosing a default from a list of calendars/sources; grouping and
  labelling for the picker; the consequence copy. Unit-tested (this is
  where the logic lives — the driver stays thin, per repo convention).
- `src/features/settings/CalendarTargetScreen.tsx` (new) — the picker.
- `src/features/settings/PreferencesScreen.tsx` — new first row.
- `src/features/calendar-sync/screens/CalendarPrimingScreen.tsx` —
  copy: "creates its own calendar — your other calendars are never
  touched" is FALSE once we can write into a user calendar. Replace
  with something true in both modes, e.g. "Fixtures go into a calendar
  you choose — we only ever touch events we added."
- `src/core/navigation.ts`, `App.tsx` — register the screen.
- `docs/DECISIONS.md` — supersede the M4 "dedicated calendar only"
  line; record that isolation-from-data and isolation-from-account are
  separate, and that no OAuth is used.
- `docs/PLAN.md` — M4 "Calendar choice" entry is no longer "satisfied
  by decision".

## API notes (verified in expo-calendar 57.0.1)

- `Calendar.getCalendars(EntityTypes.EVENT)` → each has
  `allowsModifications`, `source: { id, name, type }`, and on Android
  `isPrimary`, plus account fields.
- `SourceType` enum: `local | exchange | caldav | mobileme |
  subscribed | birthdays`. Treat **caldav / mobileme / exchange** as
  cloud; `local` as device-only; never write to `subscribed` or
  `birthdays`.
- iOS create: `createCalendar({ sourceId, title, color, entityType })`.
- Android create (fallback only): needs `source: { isLocalAccount:
  true, name, type: 'LOCAL' }`, `ownerAccount`, `accessLevel: OWNER`.
- `ExpoCalendar.get(id).update({ title, color })` — used by the rename
  and colour features; `ModifiableCalendarProperties = 'color'|'title'`.

## Test plan

Pure unit tests (no native modules — follow the existing
domain/data split):
- default-target choice for each row of the table above
- cloud vs local classification of every `SourceType`
- picker grouping/labelling, including two accounts with same-named
  calendars
- consequence copy is truthful for each target kind
- migration plan: every ledgered fixture creates-then-deletes; an
  interrupted migration converges on re-run
- **foreign-event safety**: prune/recovery never touch an event in the
  target calendar that lacks our tag

Device verification (both platforms, then update this doc):
- iOS: real device with iCloud — confirm the calendar is created in the
  iCloud source and appears on a second Apple device. The simulator
  CANNOT prove this (no iCloud account; only a local source).
- Android: emulator with a Google account signed in — confirm events
  land in the Google calendar and appear at calendar.google.com.
- Switch target with ~100 events and confirm the count is conserved and
  no duplicates remain in the old calendar.

## Environment lore you will need

- `npm test` runs the suite under **UTC and America/Los_Angeles** —
  keep it that way; several timezone bugs only appear in one zone.
- `app.json` changes need `npx expo prebuild -p ios --clean` (or
  `android`) — `expo run:*` does NOT re-sync config into an existing
  native project.
- Metro must run on **port 8082** (8081 is the owner's other project).
- Verify Android headlessly when the emulator UI is thrashing:
  `adb shell content query --uri content://com.android.calendar/calendars`
  then `.../events --where "calendar_id=N"`.
- Emulator DNS is captured at boot; if the host changed networks,
  reboot with `-dns-server 8.8.8.8,1.1.1.1` (add `-read-only` if a
  stale AVD lock complains).
- iOS sim calendar store, for direct verification:
  `~/Library/Developer/CoreSimulator/Devices/<UDID>/data/Library/Calendar/Calendar.sqlitedb`

## Acceptance criteria

1. A new user on iOS with iCloud gets a cloud-synced dedicated calendar
   **without touching a setting**, and sees the fixtures on a second
   Apple device.
2. A new user on Android with a Google account gets fixtures in Google
   Calendar, visible on the web, **without touching a setting**.
3. A user with no cloud account still works exactly as today.
4. Changing the target moves every existing event, conserves the count,
   and leaves no duplicates.
5. No event we did not create is ever modified or deleted — proven by
   test, not by inspection.
6. Every user-facing string about calendars is true in all three modes.
