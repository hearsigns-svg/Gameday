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

## M1 — Proving vertical slice  [x]

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
- VERIFIED 2026-07-25 on both platforms: 63 real fixtures → both device
  calendars; re-sync 0/0/0 (idempotent); server mutation → diff change
  record → re-sync moved the event on BOTH platforms; re-poll restored
  API truth and both converged back; 12 domain tests green. API key
  received & verified (free tier = seasons 2022–24; current seasons
  need a paid tier before M5). Sim limitations hit: silent-push wake +
  BGTask + relaunch-AppState don't fire on simulators — push wiring is
  registered, REAL-DEVICE proof stays in M6.
- Carried forward: M3 — FollowScreen should subscribe to sync status
  (app-level syncs are invisible to it today) + list auto-refresh; M4 —
  concurrent-run guard beyond the in-process mutex (dev fast-refresh
  spawned zombie loops that raced the ledger AND created duplicate
  Gameday calendars; ensureGamedayCalendar must also dedupe by title,
  recovery must scan event notes tags).

## M2 — Fixture platform hardening  [x]

Adapter framework, multi-league soccer, diff edge cases (TBD, postponed,
cancelled, DST-crossing), adapter contract tests.
- Verification: contract tests green incl. DST cases; edge-case fixture
  transitions produce correct calendar mutations in emulator E2E.
- VERIFIED 2026-07-25: 35 tests green — contract suite pinned to a real
  captured payload (UK DST boundary instants exact, full status map),
  planner suite covers every transition. On-device on BOTH platforms:
  postponed → all-day placeholder, rescheduled → sharpened timed event,
  cancelled → deleted, restored → recreated; totals conserved at 63.
  Model: followKeys (team keys + competitionId) replaces teamIds;
  pollLeague lands the competition-follow data path; mutateFixture
  drives status transitions in the emulator.
- HAZARD FIXED: EventKit half-applies all-day↔timed conversion on
  update (flag flips, dates don't → title-less day-spanning block).
  Kind changes are now always delete + recreate in the engine.
- Carried forward: emulator DNS flakiness makes mount-sync unreliable
  (two occurrences) — M6 adds retry/backoff around the cache fetch.

## M3 — Follow experience  [x]

Browse/search per-sport hierarchies (config-driven), follow management,
calendar preferences (reminders, all-day, naming, F1 race-only).
- Verification: all follow types creatable/removable; preferences apply
  to newly synced events; a11y pass on new screens; typecheck/tests green.
- VERIFIED 2026-07-26 (36 tests): React Navigation shells; config-driven
  browse (soccer live: 10 curated leagues via listLeagues, team lists via
  listTeams with 24h Firestore directory cache — 1 API call per league;
  other 10 sports render "coming soon" from config); search-filter row;
  follow/unfollow from browse AND Home; sync-status pill subscribes to
  engine events (M1 carry paid). Prefs (reminder none/15/30/60, event
  style timed/all-day) thread through desiredEventFor; flip verified
  63/63 all-day → revert timed on-device. iOS: full first-run journey
  browse→follow→63 added. Android: UCL competition-follow (+214 incl.
  qualifiers), unfollow (277→63), prefs both directions.
- BUG FOUND+FIXED by E2E: sync requests during a running sync were
  silently dropped ('sync-in-progress') — an unfollow mid-sync never
  deleted. runSync now coalesces: one queued re-run after the current
  run. Test pins the planner side; engine coalescing verified on-device.
- Deferred within scope: F1 race-only pref (lands with F1 in M5);
  event-naming pref (M7 polish); directory beyond soccer (M5).

## M4 — Sync robustness  [x]

Reinstall recovery (rebuild ledger from event-embedded fixtureIds),
calendar choice, multi-device, kill-state resumption, undo-unfollow.
- Verification: delete+reinstall → no duplicates after recovery sync;
  unfollow removes exactly its events; two devices converge.
- VERIFIED 2026-07-26 (41 tests): Android uninstall→reinstall→follow
  recovered to exactly 63 events; planted duplicate "Gameday" calendar
  consolidated 2→1 with events intact; undo-unfollow (optimistic row,
  6s window) converged back to 63 with follow restored; iOS reinstall
  recovery spot-checked. Kill-state resumption: per-op ledger persistence
  + convergence unit test (M1); multi-device: iOS+Android against the
  same cache throughout M1–M4.
- BUG FOUND+FIXED by E2E: recovery scan window (-3y) missed the two
  oldest fixtures → 65 events. Window widened to -5y AND a standing
  PRUNE INVARIANT added: every sync deletes any tagged event the ledger
  does not reference (calendar ⊆ ledger) — verified 65→63 on-device.
- "Calendar choice" was ONCE satisfied by decision (dedicated calendar
  only, never user calendars). SUPERSEDED 2026-07-30 — that decision was
  quietly costing the core promise on Android, where the dedicated
  calendar was device-LOCAL and therefore invisible on the user's other
  devices and gone with the phone. Built as the calendar-target feature;
  see the M4-addendum below and docs/CALENDAR_TARGET.md.

### M4 addendum 2026-07-30 — calendar target  [~]

Fixtures now go to a CLOUD-backed calendar wherever one exists, with no
setting to touch: iOS creates the dedicated KickOffCal calendar inside a
writable cloud source, Android writes into the primary Google calendar
(an app cannot create inside a `com.google` account, only write into
one). Device-local remains the fallback and today's behaviour for anyone
with no cloud account. Existing installs keep the calendar they already
have — an existing calendar of ours always wins, so nobody's events move
on upgrade.
- Prune/recovery tightened to a pure, tested ownership gate now that the
  target can be somebody's real calendar; calendar-level acts (rename,
  recolour, delete) additionally require the calendar to be provably
  ours. 35 new domain tests: foreign-event safety, and migration
  convergence killed at every step of the move.
- Preferences → Calendar (first row) states the target and its real
  consequence; the picker groups every writable calendar by account and
  offers "new KickOffCal calendar in <source>" on iOS.
- DEVICE VERIFICATION STILL OWED (the simulator cannot prove it — no
  iCloud account, only a local source):
  - [ ] iOS real device with iCloud: calendar created in the iCloud
        source, fixtures visible on a second Apple device.
  - [ ] Android emulator/device signed into Google: fixtures land in the
        Google calendar and appear at calendar.google.com.
  - [ ] Switch target with ~100 events: count conserved, no duplicates
        left in the old calendar.
  - [ ] Measure the prune scan against a BUSY user calendar — it now
        walks -5y…+3y of somebody's real primary calendar on every sync,
        which was cheap when the calendar was only ours.

## M5 — Sport expansion  [~]

FREE-PROVIDER TRANCHE VERIFIED 2026-07-26 (50 tests): docs/PROVIDERS.md
matrix built from LIVE calls; baseball (MLB statsapi), ice hockey (NHL
api-web), F1 (Jolpica) adapters + contract tests on captured 2026
payloads; per-sport config drives all UI (static competitions, series
follow on the sport row); model gained title/duration/sessionKind;
race-weekend pref (all vs race-only) verified on-device: F1 follow 110
events → race-only 22 (88 supports deleted) → Bruins follow +88 = 173.
Data spend: $9/mo TSDB premium + free official APIs, current seasons everywhere.
REMAINING (owner decisions on the matrix): soccer current-season source
(paid API-Sports vs football-data.org), basketball/NFL source posture
(grey public endpoints vs paid), cricket/tennis/golf/UFC providers +
TheSportsDB premium sub (~$10/mo).

MIXED PROVIDER STRATEGY (owner-approved 2026-07-26): per-sport provider
matrix, not API-Sports-everywhere. Free official APIs where excellent
(MLB statsapi, NHL official, F1 via Jolpica, soccer top comps via
football-data.org), one cheap aggregator sub (TheSportsDB ~$10/mo, all
sports) as gap-filler, paid API-Sports only where quality demands.
Target total data cost ~$10–50/mo, independent of user count (central
cache). NO multi-account free-tier farming — ToS violation and useless
anyway (free tier's binding limit is the season lock, not volume).
- Task 1 (before any adapter code): full provider matrix with VERIFIED
  current pricing, season coverage, and ToS posture per sport; owner
  signs off the matrix. Note: pages 403 automated fetches — check in a
  real browser.
- Sequence within M5: free-provider sports first (baseball, hockey, F1 —
  NO owner unlock needed), then soccer current-season source decision,
  then aggregator-backed sports, then tennis/golf/UFC (hardest data,
  exercise placeholders most).
- Verification: per-sport quality bar (spot-check vs official schedules);
  span/session/placeholder rendering correct per taxonomy; contract
  tests pinned to a captured real payload PER PROVIDER.
- Gate change: the paid API-Sports tier now blocks only the API-Sports-
  dependent sports, not the whole milestone.

## M6 — Propagation & observability  [~]

PARTIAL 2026-07-26: bounded retry+backoff around cache fetch; staleness
metric (syncStalenessHours); Firebase project gameday-fixtures created
(Spark). REMAINING (needs Blaze): function+rules deploy, real FCM silent
push verified on a physical device, entitlement scaffold deploy.

Real FCM silent push + background fetch tuning, staleness metric,
entitlement scaffold (server-side, no UI).
- Verification: staleness measured on real devices; push-triggered
  background sync observed on iOS device (not just simulator).

## M7 — Design system & polish  [~]

Owner UI brief accepted 2026-07-29 ("the gallery provides the app; the
favourites provide the identity" — ten rules now in DESIGN_SYSTEM.md).
Sequenced: (1) tokens + docs → (2) teamTheme() with CI contrast
guarantees → (3) three-tab restructure + fixture-first Home →
(4) onboarding + skippable calendar permission + follow-time scope
controls with volume preview → (5) composition: Schedule polish,
federated global search, crest/colour data plumbing, motion pass.
Then store readiness: privacy manifests + purpose strings, store
listings, screenshots, name availability check.
- DONE 2026-07-29 (steps 1–3): warm-shell tokens + motion tokens;
  teamTheme() OKLCH tone-mapper (44 contrast tests — no raw team hex
  reaches a UI slot); sport accent hues as config data; upcoming-fixture
  snapshot persisted at sync (presentation-only engine touch); tabs
  Home/Following/Schedule; HeroCard/EventRow/GlyphTile/SportPill/
  SectionHeader/CountdownBadge/SyncStatusChip; humanized sync voice;
  dev ThemeGallery pinned to worst-case identities.
- DONE 2026-07-29 (step 4): onboarding = choosing favourites (Welcome →
  sport pills → first follow → PRIMED calendar ask, one primary action
  per screen). STEP ORDER SUPERSEDED 2026-07-31 by the owner ruling —
  the calendar now comes FIRST (Welcome → calendar → pick teams), still
  skippable, still primed. Everything else in this entry stands;
  calendarChoice unset/deferred/enabled gates the engine —
  fixtures-only sync keeps Home/Schedule live with zero calendar
  permission, and the OS dialog can only ever follow the primed screen;
  calendar-off banner + chip/footer copy stays honest in every state;
  post-follow toast with the real created-count + Undo is the flooding
  guard; race-only is the conservative default for NEW installs (stored
  prefs untouched); denied-permission path ends at Open Settings, never
  a nag loop. First-run E2E on a virgin sim: Welcome → F1 one-tap
  follow → priming ("11 fixtures ready — about 1 in the next month",
  desiredEventFor-filtered count) → Not now → populated Home + banner →
  Add → OS dialog (purpose string) → 11 events in the dedicated
  Gameday calendar (sqlite-verified). Existing devices migrate to
  'enabled' via non-empty ledger.
- DONE 2026-07-29 (step 5, 033b1b1): federated global search (owner
  ruling: no sport scoping) — searchEntities CF over the teamDirectory
  cache + live TSDB filtered to served team-followable leagues, grouped
  client results, route table drift-test-pinned to sportsConfig;
  crest/colour identity plumbing end-to-end (capture at follow time,
  teamTheme the only gate, SVG skipped, broken art falls back);
  follow-moment haptic. DEPLOY PENDING owner:
  `npx firebase deploy --only functions:searchEntities,functions:listTeams`
  then `node scripts/refresh-team-directory.mjs --apply`. Client
  degrades cleanly until then. Deferred: Schedule polish, Following
  swipe-actions, per-follow scope beyond race-only.
- Verification: review checklist clean; EAS production builds submitted
  to TestFlight/closed track.

## Pre-launch: physical-device-only verification (simulators structurally cannot prove these)

Recorded 2026-08-03 (Prompt 11c close-out) so neither gets mistaken
for done. Both need a PHYSICAL device with a real iCloud or Google
account attached; both sit beside the APNs auth key upload (owner,
Firebase console → Cloud Messaging) that iOS push already owes.

- [ ] **iOS push delivery on hardware.** Silent push cannot fire on
      the iOS simulator (M6 lore), so the RNFB messaging work —
      registration, onTokenRefresh, the background handler — is
      UNPROVEN end to end. The standing caution: its first version
      compiled cleanly while being dead code (Prompt 6 review; the
      modular-only import). Proof = a real device receiving a sweep's
      silent push and correcting a calendar event without foreground.
- [ ] **Cloud-backed calendar write throughput.** Simulator calendars
      are device-local: no write in this project's history has ever
      crossed a sync adapter. Every throughput figure we have (iOS
      ~150 ops/s, Android ~15 ops/s) and the 60% time-budget fraction
      derived from them are calibrated against a best case real users
      will not have. Measure a first-sync burst and a scope-change
      drain against an iCloud calendar and a Google calendar; retune
      passBudgetMs if the real rates demand it. (Same debt as the M4
      calendar-target addendum's unticked device items.)

## External lead times (facts, not schedule)

- Apple organisational enrolment (D-U-N-S): commonly 1–4 weeks — owner
  should start now.
- If Play account is personal: 12-tester/14-day closed test required
  before production; organisational account avoids this.

### M6 deploy addendum 2026-07-26
Blaze enabled by owner; Firestore (default) eur3; rules + 10 functions
live at us-central1-gameday-fixtures; mutateFixture refuses in prod;
cache seeded (F1 110, BOS 88, LIV 63; APISPORTS_KEY env OK). Remaining:
client prod switch, FCM rebuild, physical-device push, scheduler.

### Timezone audit carry-forward (2026-07-29)

Deep audit (37 agents, 16 confirmed findings) prompted by the owner's
"this is a potential massive issue" flag. Architecture verdict: SOUND —
fixtures carry true UTC instants, so timed events render correctly in any
viewer's zone. TSDB's zone-less strTimestamp empirically confirmed UTC
against strTimeLocal across six NBA venues.

FIXED: all-day placeholders landed a day early west of UTC (5addd70);
TSDB midnight-UTC ambiguity downgrading 254/1380 real NBA fixtures, and
eventEndUtc local-clock arithmetic breaking DST-night end times (9ccbced).

STILL OPEN, in priority order:
- [ ] HIGH: NHL cancelled/postponed/TBD games are invisible — the adapter
      reads gameState but api-web carries those states elsewhere, so
      called-off NHL games are never removed from calendars.
- [ ] HIGH: client day-labelling — date-only fixtures are labelled from
      the midnight-UTC sentinel, so Home/Schedule can show the wrong day
      west of UTC (same root as the fixed write-path bug, display side).
- [ ] MED: all-day endUtc is next-day UTC midnight (Android's exclusive
      convention); EventKit treats the end day as INCLUSIVE, so iOS may
      render a 2-day banner. Needs a device check, may be platform-split.
- [ ] MED: reconcile tie-break — a fd.org noon placeholder can overwrite
      a confirmed kickoff because no adapter sets `confidence`, leaving
      poll order to decide. Rank time precision above freshness. The
      kindFlip delete+recreate also destroys the user's reminder.
- [ ] MED: recovery reads all-day events back as LOCAL midnight, so
      entryMatches never matches and every recovered placeholder is
      rewritten on every sync after a reinstall.
- [ ] MED: several tautological tests (MLB startUtc, F1 session instants,
      the "DST boundary" contract test) cannot fail — they gave false
      confidence and should be rewritten to pin real behaviour.
- [ ] LOW: venueTz is vestigial ('UTC' in 5 of 6 adapters). NHL
      (venueTimezone) and TSDB (strTimeLocal) hand us the real local time
      free — would let us show "2:00 AM (7:00 PM in Los Angeles)".
- [ ] LOW: timeLabel collapses 'postponed' into 'Time TBC', so the app
      never actually says a match was called off.
CI LESSON: run the suite under TZ=America/Los_Angeles as well as UTC —
every one of these hid behind a UTC-only test run.

## Coverage remediation (staged, from 2026-07-31)

Driven by the read-only coverage audit of 2026-07-31, which traced where
events are lost between a provider and a user's calendar. Findings that
each stage does not fix are recorded in `FINDINGS.md`, not carried in
chat. Stages are independently revertible, one commit each.

Standing invariant from Stage 1 onward: **a read failure must never be
indistinguishable from an empty result.** No new `?? []`, no new
"2xx means it worked"; each stage fixes the instances in code it touches.

### Stage 0 — Instrumentation  [x]

Nothing later is verifiable without it: the County Championship poll path
had been dropped from every sweep since it was written, and was found by
hand-replaying a validator.
- `sourceRuns` collection, one doc per connector invocation, written by
  the poller wrapper + `ingest()` (never by the sweep, which sees only an
  aggregate 2xx). Carries trigger, slice, seasons tried/resolved, HTTP
  status, the six counts, error, and `zeroYield`. 90-day `expiresAt`.
- `coverageReport` HTTP function (shared-key guarded, fails closed): per
  ingest slice, last run, last run WITHOUT an error, last run that yielded
  a future-dated fixture, hours since each, and the stored future-dated
  count. No UI, no alerting.
- Provider fetchers now return `{ rawCount, fixtures }` so funnel stage A
  (fetched) and stage B (parsed) stop being the same number, and
  `requireArray` makes a missing response key an error instead of an
  empty season.
- VERIFIED 2026-07-31 against the Firebase emulator with real providers:
  10 connector calls → 10 run docs; idempotent re-poll recorded
  stored=0/unchanged=115; FA Cup recorded HTTP 200, 873 rows, zeroYield
  true, error null, while fd.org CL recorded httpStatus 404 with an error
  — the two cases that used to be identical. A 400 writes no run record.
  `coverageReport` 403s without the key. 320 tests green under UTC and
  America/Los_Angeles; `tsc --noEmit` and the functions build clean.
- OWNER ACTIONS OWED: deploy (`firebase deploy --only functions`), and
  enable the Firestore TTL policy on `sourceRuns.expiresAt` — the field is
  written but TTL is a project-level policy, so retention is not enforced
  until it is turned on. `sweeps.expiresAt` may never have been enabled
  either; worth checking at the same time.
- BASELINE (production, 2026-07-31T11:03Z, before deploy): 10,755 stored
  fixtures, 5,199 future-dated across 43 competition slices; every slice
  reads never-run because nothing is deployed yet. Recorded in the Stage 0
  report as the datum every later stage is measured against.

### Stage 1 — The follow cap  [x]

`fetchFixturesForFollows` truncated to `followedKeys.slice(0, 10)`. Not a
display bug: planSync deletes any ledgered event it cannot find a fixture
for, so every follow past the tenth had its real calendar events pruned on
the next sync.
- New pure module `src/features/fixtures/domain/fixtureQuery.ts`: chunks
  follow keys 30 at a time (Firestore's real ceiling), retries per chunk,
  unions by fixture id — and is ALL-OR-NOTHING. One failing chunk fails the
  whole fetch; the failure shape has no `fixtures` field, so a partial
  union is unrepresentable rather than merely unreturned.
- `data/fixturesRepo.ts` keeps only the Firestore closure and the error
  classification. `getDocsFromServer` (never `getDocs`) is unchanged.
- VERIFIED 2026-07-31 against PRODUCTION Firestore, read-only: 30
  comparison values accepted, 31 rejected ("'ARRAY_CONTAINS_ANY' supports
  up to 30 comparison values"). With 40 real production team follows the
  old truncation returned 1,113 fixtures and the chunked fetch returns
  3,100 — 1,987 recovered, and ZERO fixtures present under the old path
  are missing from the new one, so the change can only create, never
  delete. Composed with the real planner: 40 follows in steady state
  planned 30 deletions under truncation and zero operations after the fix.
- Circuit breaker (`syncEngine.ts:445-451`) deliberately unchanged: a
  partial fetch can no longer reach it, because `fetchFixturesForFollows`
  returns `err` and `syncEngine.ts:439` bails before planning.
- 341 tests green under UTC and America/Los_Angeles; typecheck and the
  functions build clean.

### Stage 1b — carry-forward  [~]

Closes what Stage 1 skipped. Two items were deploy/build blockers.

- **requireArray (item 1) — RESOLVED.** Verified live against all six
  providers: only TheSportsDB uses the `null`-for-empty convention
  (`eventsseason` for FA Cup 2026-2027, and for a league id that does not
  exist); football-data, NHL, MLB and Jolpica all return an empty ARRAY.
  Documented-empty is correctly recorded as `zeroYield: true, error: null`.
  Found and fixed a real overshoot: the guard only checked `undefined`, so
  a present-but-non-array body passed through and reported its character
  count as a row count. Now three-way: missing key throws, null is empty,
  non-array throws.
  A throw inside the season loop ABORTS the poll; it does not continue to
  the next candidate. Kept deliberately (see DECISIONS).
- **Re-creation burst (item 2) — MEASURED, and one blocker found.**
  iOS simulator 150 ops/sec, Android emulator 15 ops/sec; 748 creates took
  5.0s and 48.8s respectively. Ops are applied SERIALLY, one native write
  each, sharing one calendar object; there was no cap and no budget.
  Capped at 1,500/pass (see DECISIONS) because Android crosses
  STALE_RUN_MS at ~2,700. The Stage 1 recovery figure is corrected: 1,987
  recovered FIXTURES is only **212 extra calendar creates** for a 40-team
  user, because planSync drops past-dated fixtures; the genuinely large
  bursts are competition follows (10 comps = 3,369 creates).
  BLOCKER: 38 orphaned events survive every sync and prune never fires —
  see FINDINGS.md F11. The app build stays blocked on that.
- **Instrumentation (item 3) — DONE.** `SyncOutcome` gained
  `followKeyCount` and `queryChunks`; confirmed on-device on BOTH
  platforms (iOS `followKeyCount: 3`, Android `followKeyCount: 6`).
- **Query window (item 4) — NOTE ONLY**, docs/QUERY_WINDOW.md. A windowed
  query would delete 2,571 past events for a 40-team user. Recommends
  option (b), not before Stage 4.
- **Sweep truncation (item 5) — DONE.** `sweeps` records `pathsSeen`,
  `skippedByCap`, `skippedByDeadline`, the skipped paths themselves (capped
  at 200, and says so) and a `truncationReason`. Drop order is arbitrary
  and unchanged.
- 362 tests green under UTC and America/Los_Angeles; typecheck and the
  functions build clean.

### Stage 1c — F11: calendar-sync integrity  [x]

Root-caused and fixed. One defect, not two.

- **The scan, not the logic.** Identical code and scenario on both
  platforms (ledger wiped, permission intact, no follows): Android
  recovered 964 of 964 tagged events; iOS recovered **0 of 1,790**. An
  8-year `predicateForEvents` returns an empty list from EventKit with no
  error. Android's CalendarProvider answers the same range in full — the
  free discriminator, no code change needed to prove it.
- Both symptoms follow from that one cause: prune consumed the empty scan
  (so `pruned` never appeared in any outcome), and recovery consumed it
  too (so a reinstalling iOS user rebuilt an EMPTY ledger and had their
  whole calendar re-created, not 38 events of it).
- **Creation mechanism identified** — recovery, not concurrency. The 38
  duplicates are exactly the intersection of "already in the calendar
  from the Liverpool follow" and "wanted by the Premier League follow";
  creation-time forensics show a complete 380-event PL season written from
  scratch over an empty ledger. Double admission is unreachable
  (`planSync` keys `wanted` by fixture id); concurrency would have
  duplicated the whole wanted set. See FINDINGS F14.
- FIXED: `recovery.ts::scanWindows` splits the span into 2-year windows,
  `calendarDriver.ts::scanCalendar` concatenates and dedupes by event id.
  iOS `recovered` went 0 → 1,752, and the 38 duplicates were collected
  naturally as recovery surplus — no one-off migration needed.
- **Op cap replaced by a TIME budget** (60% of STALE_RUN_MS = 108s),
  corrections before creates, with `opsApplied` and `passMs` on the sync
  outcome so real-world throughput becomes visible. Multi-pass drain
  exercised on Android: a 1,656-op plan drained over three passes to 1,656
  events with zero duplicates.
- CAVEAT, FINDINGS F15: the budget is checked between ops, so a pass is
  bounded by budget + one op. On the emulator one native write blocked
  ~119s and that pass reached 227s, exceeding STALE_RUN_MS. Not fixed —
  the fix is in the lock, which this stage was not authorised to touch.
- UNMEASURED: throughput against a CLOUD-backed calendar. Neither
  simulator has an iCloud or Google account attached, so every figure here
  is device-local. Not estimated.
- 371 tests green under UTC and America/Los_Angeles; typecheck and the
  functions build clean. App build still held pending checkpoint approval.

### Stage 1d — F11 close-out  [x]

- **Recovery trigger, confirmed:** `entriesFromRecoveredEvents` runs ONLY
  when the ledger is empty (`syncEngine.ts`, guarded on
  `Object.keys(loadLedger()).length === 0`), and it POPULATES rather than
  replaces or merges — there is nothing to merge with by construction. So
  F13's severity is "every reinstalling iOS user", not "every iOS user,
  every sync". The 38 duplicates were a reproduction of F13 on a shared
  dev simulator driven by the concurrent session, not production damage.
- **Scan anomaly guard:** an empty scan against a populated ledger is
  impossible under correct operation. `isScanAnomaly` detects it, the pass
  records `scanAnomaly`/`scannedTagged`/`ledgerEntries` and FAILS before
  planning, so no deletion can be planned on a calendar we cannot read.
  This is Stage 0's standing invariant applied to the scan surface — the
  one place it was still exempt — and it holds whatever Apple does to the
  range ceiling next. Costs one extra scan per sync (FINDINGS F17).
- **`surplusDeleted`** is now counted apart from `deleted`, so the one-time
  corrective pass is distinguishable in the wild from an unfollow. Largest
  measured surplus: 38 (iOS, Stage 1c).
- **F15 fixed:** the lock is heartbeat-based. A slow-but-alive pass is
  never taken over. No per-op timeout, deliberately.

### Stage 1e — the future horizon  [~]

Owner's product rule: KickOffCal only ever creates, updates or deletes
events for fixtures that have NOT YET FINISHED. Supersedes the options in
docs/QUERY_WINDOW.md.

- `isPast` in `fixtures/domain/horizon.ts` is the one definition —
  END-based, 6h grace. Consumers: (1) `planSync`'s wanted loop, which
  freezes past fixtures; (2) `planSync`'s delete loop via `isEndPast` on
  the ledger entry; (3) `entriesFromRecoveredEvents`, which no longer
  collects surplus for finished fixtures; (4) `queryHorizonUtc`, ready for
  the query filter. The reaper joins as a fifth from Stage 4.
- The freeze is in the LEDGER, not the query — a crossing fixture leaves
  the fetch and must not therefore be deleted. Pinned by a direct crossing
  test: sync while future, advance the clock past `endUtc + grace`, re-sync
  with the fixture absent, assert zero ops and the event still present.
- **Query filter HELD** pending one Firestore composite index — see
  FINDINGS F16. The saving once enabled: 40 teams 3,100 → 548 reads/sync
  (82%), 10 competitions 7,112 → 3,384 (52%).
- Opt-in removal of past events: off by default, fixed 30-day retention,
  tagged-and-ledgered only, drains under the existing time budget.
  Largest first-enable deletion constructible from live data: 2,324
  (40 teams), 3,431 (10 competitions), 4,710 (all 43 competitions).
- Past duplicates now stay permanently — owner's explicit decision,
  recorded in DECISIONS.md so nobody "fixes" it later.
- 402 tests green under UTC and America/Los_Angeles; typecheck and the
  functions build clean. Android regression check: 1,656 events, 0
  duplicates, 0 ops, guard silent. App build still held.

### Stage 1e completion + deployment audit  [~]

DEPLOYMENT GROUND TRUTH, established from the live project 2026-07-31T21:01Z
(not from this file):
- All 17 Cloud Functions in the working tree are deployed, including
  `coverageReport` — Stage 0 IS live. Whether the Stage 1b function-side
  changes (sweep truncation fields, requireArray hardening) are included
  cannot be determined from outside; the fix is a redeploy, which is
  idempotent and needed anyway.
- Composite indexes: NONE. `firestore.indexes.json` did not exist.
- TTL: ENABLED on `sourceRuns.expiresAt`; NOT enabled on `sweeps.expiresAt`.
- `sourceRuns` populated: 17 runs, 2026-07-31T16:20:10Z → 19:59:55Z (the
  first scheduled sweep after deploy, plus device-driven follows). The dead
  API-Sports account is already visible in coverage as a slice that has
  never succeeded.
- No app build has been cut since 166bfdd — debug/simulator artifacts only,
  no EAS config, no release APK.

DONE:
- `firestore.indexes.json` written: the one composite index the windowed
  query needs, plus the existing `sourceRuns` TTL override preserved
  verbatim so deploying indexes cannot clobber it.
- Query filter ENABLED (`fixturesRepo.ts`), gated on that index existing.
- Circuit breaker now counts LIVE ledger entries. The filter made an
  out-of-season follow fetch legitimately zero documents against a ledger
  full of frozen events; the old breaker would have failed every sync for
  a hockey fan in July.
- POSTPONEMENT ACROSS THE HORIZON: works, no exemption needed. The freeze
  is asymmetric — the wanted loop keys on the FIXTURE's pastness (new date
  → live → update emitted) while the delete loop keys on the LEDGER
  ENTRY's (old date → frozen → no delete) — so a rescheduled fixture moves
  its event while a genuinely finished one stays put. Now pinned by five
  tests including the all-day banner variant and the cancellation
  counterpart.
- 409 tests green under UTC and America/Los_Angeles.

OWED (owner commands, see the Stage 1e report): deploy indexes, redeploy
functions, optionally enable the `sweeps` TTL, cut the app build.

### Prompt 2 — Acquisition foundation  [x]

Prerequisites for adding any new sport. Deployment state verified first:
the composite index is LIVE, TTL is on for both `sourceRuns` and `sweeps`,
all 17 functions deployed, `sourceRuns` carrying real runs.

- **durationHours regex** widened to `/^\d{1,3}(\.\d)?$/`. Replayed
  `canonicalisePollPath` over all 50 configured paths: 50 accepted, ZERO
  dropped. The County Championship (96h) is back in the sweep.
- **API-Sports quarantined.** `pollTeam`/`pollLeague` out of `POLL_ROUTES`
  and out of `pollPathFor`; the adapter, its contract test and the two
  endpoints are kept (a paid tier revives them unchanged). No browse
  surface produced an `apisports-*` follow — `listApiSportsLeagues` and
  `listSoccerTeams` were already dead code (F6).
- **football-data per-competition seasons.** `SOCCER_FD_SEASON` is gone.
  `fdSeasons.ts` resolves every competition from the provider's own
  `currentSeason` in ONE call a day for all of them, cached in Firestore.
  A competition resolves only if its current season has not already ended
  — determined from `endDate`, so it costs no extra request. CL and EC
  stop 404-ing and start being hidden honestly.
- **NHL/MLB "Follow all" removed** (`followable: false`). Both are served
  team-by-team with no league route; the button built
  `pollNhlTeam?abbrev=1` (400) and `pollMlbTeam?teamId=1` (empty 200).
  Browsing their teams is unaffected.
- **`bestSeason` never selects a dead season.** No candidate with upcoming
  events ⇒ ingest nothing, record `reason: 'no_future_events'`.
- **F4 fixed:** `cachedTeams` honours the documented 24h TTL, and a
  refresh failure serves the stale copy rather than emptying a directory.
- **F9 fixed:** `registerDevice` detects the 200-key rule ceiling BEFORE
  writing, fails loudly, persists the reason and surfaces it in
  Preferences.
- **F10:** every path the sweep skips now gets a `sourceRuns` record with
  `reason: 'skipped_sweep_cap'` or `'skipped_sweep_deadline'`, so a slice
  that stopped being refreshed appears in `coverageReport` instead of
  vanishing into a boolean. Drop order still uid-lexicographic, unchanged.
- 441 tests green under UTC and America/Los_Angeles.

### Prompt 3 — Time and confidence model  [x]

The schema the next three sports depend on. Deployment verified first:
Prompt 2 is live (listLeagues returns 20 leagues carrying a resolved
season; CL/EC/WC hidden).

- **`timePrecision: 'exact' | 'nominal' | 'date_only'`** added, separate
  from `status`. `tbd` conflated "no time" with "time not settled" and
  startUtc carried a midnight sentinel meaning either.
- **`confidence` populated in all six adapters** (it was 0% populated
  across 10,483 docs while two code paths branched on it).
- **`nominal` renders as a TIMED event** at the nominal time, with the
  uncertainty in the event DESCRIPTION and `confidence: 'provisional'`.
  All-day is reserved for `date_only` and for postponements.
- Measured on identical fresh payloads: **all-day drops from 3,203 to
  192**, a 94% reduction. Premier League 380 → 0, Championship 552 → 0,
  La Liga 380 → 0, Serie A 380 → 0. The 3,011 fixtures that changed all
  gain a kick-off time AND a reminder, which an all-day banner never had.
- **The 45 midnight-UTC-but-scheduled fixtures** are now explicitly
  `exact`: strTimeLocal proved the time real, so they are no longer a
  sentinel that merely looks like one.
- **`venueTz` is honest.** Optional now, populated only where the provider
  supplies a real IANA zone (NHL's `venueTimezone`, API-Sports' non-UTC
  timezone). TheSportsDB gives a venue-local TIME but no zone name, and an
  offset is not an IANA zone — so it is omitted rather than recorded as
  the literal 'UTC', which it was on 10,395 of 10,483 documents.
- **Cross-fill** implemented as a ranking in `mergeCluster`: precision
  joins confidence ahead of freshness, so a settled kick-off beats a
  placeholder that polled later. MEASURED IMPACT TODAY: **0 fixtures**.
  football-data and TheSportsDB cover disjoint competitions in the current
  config, so there is nothing to cross-fill until they overlap. The
  mechanism is in place and tested for when they do.
- Three superseded tests updated in place, not deleted: fd SCHEDULED→tbd,
  the provisional→all-day rule, and bestSeason's dead-season fallback.
- 460 tests green under UTC and America/Los_Angeles.

### Prompt 4/4b — Boxing, tennis and athletics at event level  [x]

Sources investigated read-only, robots.txt first, no UA spoofing, no auth
bypass. Owner rulings recorded in DECISIONS.md with their reasoning.

BUILT:
- **PBC** (`providers/pbc.ts`) — JSON-LD `SportsEvent` + the 319-URL
  sitemap, card level, honouring the published `Crawl-delay: 10`. Slug
  dates skip past cards without fetching them. ONE upcoming card exists
  (FINDINGS F24).
- **Tennis** (`providers/tennisIcs.ts`) — the ICS Tennis TV publishes for
  subscription: 340 VEVENTs, 78 upcoming, tournament level with correct
  multi-day spans (US Open 15 days). Fields only; the DESCRIPTION text is
  never read. Once daily, honest UA.
- **Athletics** (`providers/worldAthletics.ts`) — World Athletics
  `__NEXT_DATA__`, ~1,250 meetings, paginated. Follow keys are per
  COMPETITION GROUP so following athletics does not mean following every
  parkrun.
- **Review queue** (`reviewQueue.ts` + `submitReview`/`listReview`/
  `decideReview`/`reviewAdmin`) — the boxing strategy for Golden Boy, MVP,
  Matchroom, BOXXER, Queensberry and whatever comes next. Strict
  validation that rejects rather than repairs, a mandatory source URL on
  every record, nothing reaching a calendar until a human approves it.

NOT BUILT, and why: WTA (no calendar in its JSON-LD), ITF (Incapsula
challenge), ATP site and MVP (robots refusal), Golden Boy (Cloudflare),
Matchroom/BOXXER/Queensberry (HTML parsers declined by ruling). See
FINDINGS F18–F24.

ALSO: `MAX_FIXTURE_DURATION_HOURS` widened 96h → 3 weeks, because a
15-day Grand Slam must not fall out of the query window halfway through.
The cost is a wider read lookback; correctness first.

OWED: the extractor that feeds the review queue is an operator or agent
session POSTing to `submitReview`. Running extraction IN the cluster needs
an LLM provider key and a budget decision — not made here.

501 tests green under UTC and America/Los_Angeles.

### Prompt 5 — Individual appearances  [x]

One model, three consumers. Deployment verified first: all 24 functions
live, the composite index live, both TTLs on.

- **The appearance model** (`functions/src/appearances.ts`): a named
  athlete competing within a parent event, as an ORDINARY fixtures doc.
  Id = `<parentId>-app-<athlete-slugs>` — born final, so provisional →
  confirmed is always an in-place update against the same ledger entry;
  first id segment stays the parent's provider, which keeps the
  reconcile same-provider guard and coverage source attribution for
  free. Athlete followKeys (`athlete-<slug>`, full names only) live ONLY
  on appearances; combat cards keep parsed participants but SHED their
  athlete keys — a fighter's follower gets the bout, never bout + card.
  Each appearance slice ingests under `<competitionId>-appearances`
  (non-followable, rides followKeys so the slice diff and coverage join
  work unchanged) and writes its own sourceRuns record.
- **Boxing** — PBC card pages already carried one JSON-LD SportsEvent
  PER BOUT (four on the banked Aug 22 card); every bout is now an
  appearance, named from `performer` givenName+familyName (the node
  name abbreviates: "Antonio Russell" vs performer "Gary Antonio
  Russell" — caught by the banked capture). Zero extra requests. The
  review queue converts every APPROVED bout — undercard included — via
  `reviewItemToAppearances`. TSDB combat slices derive the headline
  bout from full-named titles (UFC's surname titles honestly yield
  nothing), windowed to now−7d forward so season re-polls never mint
  appearances for finished bouts. PBC contract test now exists, pinned
  to the banked capture (a Prompt 4 gap).
- **Tennis and athletics** — the MODEL is live and tested for both
  (provisional parent-window banner → confirmed exact slot); live
  acquisition is NOT IMPLEMENTED: tennis draws/order-of-play have NO
  approved source (F25 — usopen.org drops honest clients at the TCP
  edge; api.wtatennis.com is the candidate, needs an owner ruling), and
  World Athletics start-list/timetable ROUTES exist keyed by our own
  `wa-<id>` but their populated payload shapes are unverified (F27 —
  building the parser blind is the exact F22 mistake; one 2-request
  probe near a meeting day closes it).
- **Multi-day date_only fixtures now span their real days.** Before
  this stage `fixtureEndUtc` collapsed every day sentinel to ONE day:
  a 15-day US Open froze (and left the query window) six hours after
  day one ended. Now the banner spans the window (multi-day spans drop
  the "— time TBC" suffix — a span is not claiming a missing kick-off),
  `entryMatches` gained endUtc (duration-only changes propagate; they
  silently never did), and the iOS all-day end maps to the last day of
  the span. Postponed stays a one-day banner, and `fixtureEndUtc`
  matches the planner's end in every case (pinned). 172 future-dated
  banners widen on next sync (78 tennis, 64 athletics, 30 cricket).
- **Athlete follows exist in the UI**: `searchEntities` gained an
  athletes group backed by an `athleteDirectory` collection written
  through at appearance ingest (server-only, filtered to athletes with
  a future appearance); SearchScreen shows an Athletes section and
  opens/creates `type: 'athlete'` follows carrying the parent slice's
  pollPath. Zero athlete follows existed before this stage (the type
  was declared, unpopulated), so the card→appearance key migration
  strands nobody.
- MEASURED against production 2026-08-02T16:07Z, read-only: 234 combat
  cards (42 upcoming), 78 cards carrying 141 distinct athlete keys that
  will shed to appearances as each slice re-polls, 0 appearance docs
  yet, 5,642 future-dated fixtures. Past PBC cards outside the 7-day
  fetch window keep their stale athlete keys until they age out of the
  510h query lookback — harmless (horizon gates), noted.
- ADVERSARIAL REVIEW ROUND (pre-commit, 7 lenses / 27 findings / all
  verified): caught one genuine horizon-rule violation the first cut
  introduced — collapsing a POSTPONED fixture's freeze to one day while
  its ledger entry spanned the window made planSync DELETE a live
  tournament's banner on a mid-span postponement flip. Fixed (freeze
  keeps the span; banner stays one day; regression-pinned) along with:
  the create gate and Home/Schedule snapshot now judge all-day spans by
  their END (a mid-span follow creates the live tournament; day five of
  a Slam no longer vanishes from Home); appearances the fresh yield
  proves gone are RETIRED to 'cancelled' with change records fanning
  the push (evidence-guarded — an empty yield proves nothing; misses
  recorded as F30); zero-yield appearance polls now write their run
  record (fetched-N-parsed-0 is how PBC performer-array rot stays
  visible); cancelled bouts no longer feed the athlete directory;
  directory pollPaths are canonicalised (a season-less manual poll
  could seed a sweep-rejected route); athlete follows never fire the
  one-shot preview poll (opening a fighter's page must not launch a
  2-minute PBC crawl); the iOS all-day end is clamped ≥ start+1h
  (degenerate recovered entries); the all-day pref spans multi-day
  TIMED fixtures to their real final day; Home's search copy includes
  athletes.
- 548 tests green under UTC and America/Los_Angeles; typecheck and the
  functions build clean.
- OWED (owner commands, see the Prompt 5 report): redeploy functions.
  No new indexes, no rules changes, no new routes (POLL_ROUTES
  unchanged — appearances ride existing polls).

### Prompt 5b — rulings, WTA draws/OOP, funnel verification  [x]

Rulings recorded in DECISIONS.md: api.wtatennis.com APPROVED (does not
reopen atptour.com); ufc.com HTML DECLINED (A/B/C stay open).

- **FUNNEL VERIFIED against prod** (post-redeploy, 2026-08-02 ~17:20Z):
  `tsdb-league-4445-appearances` live with 10 future-dated appearance
  docs; athlete keys SHED from 78 carrier cards down to 3 (all on
  slices no device follows — F29 class). The verification then caught a
  real coverage bug the instrumentation exists to catch:
  `pbc-cards-appearances` ran twice with fetched-15-parsed-15-stored-15
  but futureDated 0 — **the August 22 card had NEVER been fetched**.
  The sitemap carries 19 undated URLs ahead of the one dated upcoming
  card, and `slice(0, maxCards)` took the first 12 in document order:
  twelve past cards, upcoming card starved, since the day the connector
  shipped. FIXED: `candidateOrder` puts dated upcoming cards (soonest
  first) before undated slugs, and appearances are only derived for
  cards inside the window (the 15 stored past-bout appearance docs are
  inert clutter — past-dated, never fetched by clients). Live-verified
  post-fix: the card is candidate #1 and its 4 bouts mint with the
  exact ids the contract test pins. Regression-pinned.
- **THE 172 WIDENED BANNERS verified against prod data**: all 172
  future multi-day date_only fixtures (78 tennis, 64 athletics, 30
  cricket) replayed through the REAL client planner under both UTC and
  America/Los_Angeles — every one plans as a full-width all-day span
  (34×2d … 49×7d … 4×15d), no TBC suffix on spans, freeze end equal to
  the planner's end, day-boundary starts. NOT device-verified this
  round: the on-device write is the engine's ordinary update path; the
  replay verifies the data and the plan, not EventKit itself.
- **WTA TENNIS BUILT** (`providers/wtaTennis.ts`, `pollWtaTennis`,
  slice `tennis-wta` + `tennis-wta-appearances`): tournament parents
  `wta-<id>-<year>` (date_only spans; 49 ingested-shape live including
  the US Open — slam coverage without touching usopen.org), draws from
  the matches feed (full names; still-in = named in an undecided
  singles match; Winner '0' is the only undecided value observed),
  order of play from the /oop feed (venue-local times with explicit
  offsets; follow-on matches carry a day but no time and become
  CONFIRMED date_only — never an invented instant). One rolling
  appearance per player per tournament: provisional parent window →
  confirmed slot updating in place on the same id — the
  appearanceLifecycle mechanism, now fed by real data and pinned by a
  contract test on banked real payloads (timed final, ATP skeletons at
  joint events, dict-shaped single-match courts, empty-time qualifying
  rounds). SINGLES ONLY; doubles are a different churn model. Active
  tournaments capped at 5 fetches/poll with the skip count REPORTED.
  Live end-to-end: 49 parents, 6 active (1 skipped), 145 draw records
  → 30 appearances (24 provisional, 6 confirmed timed).
- **ATHLETICS STAYS NOT IMPLEMENTED** (F27 updated, per the ruling's
  "wait for real data"): 0 of 593 meetings scanned (2026-08-02→09-15)
  carry hasStartlist:true; the flag is TRANSIENT and appears reserved
  for World Athletics Series championships (the completed World Indoors
  shows false post-event with hasResults true; Diamond League legs
  never show it at all). The entry-list SURFACE shape was captured —
  day-paged, a first-class `startList: null` slot beside `results` on
  every race, competitor shape verbatim — and no per-discipline times
  exist on that surface at all. The populated startList row remains
  unseen; the parser waits for the next WA Series meeting's live week.
- **ADVERSARIAL REVIEW ROUND on the 5b diff** (three lenses + refuting
  verifiers, every confirmed finding probe-executed): 7 confirmed, 9
  refuted. Fixed in-round: (1) HIGH — slot liveness was START-based, so
  a confirmed match demoted to a week-long provisional banner mid-match
  and a played morning slot shadowed the same payload's evening final;
  now END-based (timed start+3h, day-only sentinel+36h for venue-local
  days, 6h feed-lag grace), regression-pinned. (2) HIGH — appearance
  RETIREMENT's future-only guard could never retire an eliminated
  player's week-long provisional doc after day 1 (its startUtc is the
  parent's first day); now end-based on the same freeze boundary as the
  client ledger. (3) isActive treated status 'past' tournaments as
  active (a finished draw occupied a fetch slot while Warsaw, starting
  the next day, was starved every poll); actives now exclude 'past' and
  sort newest-start-first under the cap. (4) Tournament pagination:
  page 0 was trusted alone; now accumulates pages against
  pageInfo.numEntries with id-dedup and a no-progress stop. (5) A
  Schedule missing its Day KEY now throws (shape rot ≠ empty schedule).
  Recorded, not fixed: F34 — name-collision athlete identity (needs the
  canonical-identity work of ruling 2; WTA numeric ids banked as
  input).
- 566 tests green under UTC and America/Los_Angeles; typecheck and the
  functions build clean.
- OWED: redeploy functions (again — includes the PBC fix and
  pollWtaTennis, a NEW function). DONE by owner 2026-08-02 (deployed
  and seeded).

### Prompt 6 — hygiene  [x]

Branch state settled first: every stage since 2026-07-30 had landed on
`calendar-target` (main froze at the calendar-target spec, 17 commits
behind); main fast-forwarded to e55d287, work continues on main.

- **SLICE-CLASS AUDIT** (any connector taking a fixed slice of an
  unordered candidate list) — found the PBC bug's twin, WORSE:
  worldAthletics walked offsets 0..3 of a calendar that sorts
  DESCENDING by date, so a year-long window stored the FURTHEST-future
  400 meetings and nothing near today. Production held 406 athletics
  fixtures with ZERO inside 30 days (soonest Oct 17) — in peak outdoor
  season, clean runs throughout. FIXED: `tailOffsets` spends the page
  budget on the tail, highest offset first; live-verified 71 meetings
  inside 30 days (was 0). Full inventory in the Prompt 6 report: every
  other cap is either deliberately ordered (PBC dated-first since 5b,
  WTA newest-first actives, review/coverage/athlete-search orderBy) or
  not binding (WTA pagination 300 vs 49; sweep union 250 vs 10 paths,
  the F10 lexicographic drop unchanged, Stage 7's catalogue).
- **THE REAPER** (`reaper.ts` + ingest integration): per
  (source, competitionId, season) — source-scoped by id prefix (a
  cross-provider merged doc is never a candidate), season-scoped by the
  fetched date envelope ±7d (fixtures carry no season field; adjacent
  seasons sit months apart, a season-edge withdrawal days), armed ONLY
  by routes whose fetch is the slice's complete truth
  (`PollWork.sliceComplete` — capped fetches like athletics/PBC prove
  absence of nothing), soft-cancel with change records for push
  fan-out, strict 20% ceiling as broken-fetch detector (consequence: a
  slice of ≤5 live docs can never reap a single withdrawal), and
  appearances untouched by absence (retirement owns them) but CASCADED
  when their parent reaps — a withdrawn card never yields again, so
  retirement alone could never clear its bouts. DRY-RUN BY DEFAULT:
  every successful fetch records candidates/guardTripped/sampleIds in
  sourceRuns; nothing applies until REAPER_ENABLED=true is deployed.
  DRY-RUN AGAINST PRODUCTION (twice, ~25min apart, intersected —
  identical): across all 11 armed slices the ONLY candidates anywhere
  were the four F3 orphan F1 docs. Zero guard trips. F30's systemic
  half closed.
- **BAD DATA CLEARED** (executed 2026-08-02 ~20:50Z, measured first,
  re-checked at execution): 63 apisports-legacy + 1,380 stale NBA +
  873 dead FA Cup (26-27 NOT yet populated — verified zero future) +
  15 inert PBC past-bout appearances = 2,331 docs deleted, all
  past-dated, zero future-dated members in any group, zero calendar
  impact (frozen ledger entries are untouchable). Store 11,665 → 9,334.
  The 4 F1 orphans ride the id migration below instead.
- **F1 STABLE IDS** (F3): `f1-<season>-<circuitId>-<session>` —
  albert_park survives renumbering; missing circuitId throws (shape
  rot, never a silent fallback to round ids). Impact measured before
  changing: 3 devices follow f1-series-1 × 64 future old-scheme
  session docs; events are REPLACED through the ordinary ledger path
  (delete + create on the next sync), never orphaned — the stop-gate
  does not trip; user-set reminders on those events do not carry.
  Migration = `functions/scripts/clear-f1-legacy.mjs` (dry-run default,
  --apply), owner-run AFTER deploy or the next poll re-mints old ids.
- **PER-FIXTURE DURATIONS**: PBC now uses the card's published
  startDate–endDate window (2h on the banked Aug 22 card) instead of a
  hardcoded 4h; appearances inherit it. Survey: tennis/WA/WTA spans
  already real; fdorg/TSDB/MLB/NHL/Jolpica publish no end times —
  their per-league constants stay, honestly.
- **iOS PUSH FIXED IN CODE** (F1): iOS now obtains a real FCM
  registration token via @react-native-firebase/messaging (guarded
  lazy require — a JS refresh on a pre-RNFB binary degrades to the
  honest no-token registration; Android path unchanged), RNFB app +
  expo-build-properties (static frameworks) plugins added, prebuild +
  pod install clean, iOS compile verified. The sweep needs no change —
  tokenType 'fcm' flows through the existing fan-out. OWED: owner
  uploads an APNs auth key (Firebase console → Cloud Messaging), and
  the delivery proof needs a PHYSICAL device — simulators cannot fire
  silent push (M6 lore). Registry self-heals: next app launch on a
  rebuilt binary re-registers with the FCM token.
- **ADVERSARIAL REVIEW ROUND on the 6 diff** (three lenses, refuting
  verifiers, every finding probe-executed): 9 confirmed, 0 refuted,
  all fixed in-round. The big one: the iOS FCM fix was DEAD CODE —
  RNFB v26 is modular-only, `.default` was undefined, the TypeError
  swallowed by the simulator catch, the device registered token-null
  and the compile proved nothing (rewritten to getMessaging/getToken;
  plus an onTokenRefresh re-registration subscribed BEFORE the token
  attempt, closing the APNs cold-start race, and a background message
  handler releasing RNFB's 25-second completion hold per silent push).
  Also fixed: the reap ceiling's denominator was the whole slice
  rather than the in-envelope docs the fetch can testify about (a
  truncated F1 fetch beside pre-announced 2027 docs read 10% missing
  when it was 93%); the appearance cascade was invisible to dry runs
  and uncounted in `applied` (now enumerated before the apply
  decision); F1 circuit ids collided on double-header weekends (2020:
  85 fixtures, 70 distinct ids — second visits now take an occurrence
  suffix); the athletics tail walk inherited a break-on-empty that
  aborted the NEAREST pages when hits shrank mid-walk; `hits` was
  unvalidated (NaN → silent one-page walk — the exact quiet
  starvation just recovered from, now a named throw); PBC durations
  accepted any endDate after start (a year-typo would mint a
  year-long un-freezable event; now clamped 0.5–24h else 4).
- 578 tests green under UTC and America/Los_Angeles; both typechecks
  and the functions build clean; iOS compiles with RNFB.

### Prompt 7 — catalogue and observability  [x]

The original defect, closed: nothing was polled unless a registered
device already followed it — a sport nobody follows was never fetched,
a league froze when its last follower left, browse could offer a
competition with no data behind it.

- **THE CATALOGUE** (`catalogue.ts` + collection + seed script):
  57 entries = every competition/series row browse offers. Tier 1
  (18, every sweep): big-five soccer + UCL, NBA, NFL, NHL, MLB, F1,
  UFC, both boxing routes, both tennis tours, athletics, IPL. Tier 2
  (39, daily 00–06 UTC sweep): the rest of browse. Teams are NEVER
  catalogued — the unbounded, follower-driven set. Entries are
  ops-editable, allowlist-validated, idempotently seeded with
  `enabled` preserved. The sweep unions device + catalogue paths with
  PRIORITY drop order (device → tier 1 → tier 2; F10 CLOSED), and
  consecutive fd.org requests are spaced 6.5s (13 fd routes on the
  daily sweep vs a 10/min licence).
- **PROJECTED VOLUME** (net of the 9 already-device-followed slices):
  ~84 added route invocations/day — TSDB ~42/day (vs a 100/req-MINUTE
  premium rate; sweep bursts ≤2.5/sec), fd.org ≤13/sweep spaced
  inside 10/min, WTA ~4 invocations (~44 API calls), WA 4×≤14 pages,
  PBC 4. Firestore ≈ +20–30k reads/day (slice diffs; ~45k when NBA
  26-27 lands), writes near-zero at steady state. Comfortably inside
  every quota; the binding constraint was fd.org's rate, handled by
  spacing. The daily sweep's wall time ≈ 4–6 min of the 8-min
  deadline.
- **RUNTIME COMPLETENESS**: athletics narrowed to a 120-day window
  with a 14-page budget and now MEASURES whether its pages covered
  every meeting the feed claimed — only a complete run arms the
  reaper (rule unchanged; completeness became a per-run fact). PBC
  stays permanently unreapable — the undated-slug allowance means an
  upcoming card can always hide in an unfetched slug — stated, not
  papered over.
- **ALERTING** (`alerts.ts`, sweep-evaluated): no_success_24h on
  demanded slices; yield_died (succeeding runs, nothing future-dated
  for 72h, no honest-empty reason — the exact PBC/athletics shape).
  State in opsAlerts with open/resolve transitions; a stable-prefix
  console.error per open alert per sweep for Cloud Error Reporting to
  group and notify on. OWNER STEP, once: verify Error Reporting
  notifications are enabled for the project. Off-season slices
  (reason no_future_events) can never page.
- **FRESHNESS IN THE APP**: the sweep maintains world-readable
  status/coverage (path → last confirmed success; rules block added);
  the client's chip now distinguishes device-sync age from DATA age
  (sources quiet >48h → the chip stops being green), a freshness read
  failure renders unknown-never-fresh, and Preferences gained a Sync
  health line wiring syncStalenessHours (device) beside source age.
  Per-sport coverageNote labels render on browse (tennis ATP/WTA
  asymmetry, athletics' absent athlete level, combat broadcast-start
  times, golf/cricket bounds).
- **ADVERSARIAL REVIEW ROUND on the 7 diff** (three lenses, refuting
  verifiers, live probes against prod where needed): 16 confirmed, 2
  refuted, all confirmed findings fixed in-round. The two big ones,
  both probe-proven: (1) the sweep's 20s fetch timeout could never
  accommodate the 14-page athletics crawl it now triggers (live: 23.8s
  in season) — crawl-style routes (athletics, PBC) now get a 120s
  budget, so freshness can actually confirm them; (2) the reaper's
  envelope did not know a window-clipped fetch's boundary — a live
  prod replay showed the first armed athletics run soft-cancelling 20
  REAL December meetings just past the 120-day edge at 9.9%, silently
  under the guard. The request window's end now caps the envelope
  (athletics AND the WTA 180-day window). Also fixed: alert
  RESOLUTION now requires the same evidence as opening (a sweep that
  never demanded a slice proves nothing — tier-2 alerts were flapping
  open/resolved daily); sweep-skip records no longer count as
  successes in coverage (they were refreshing lastSuccessAt and
  masking no_success_24h for slices being skipped to death); alert
  logs are Error objects (a bare string may never reach Cloud Error
  Reporting on gen-2); a catalogue read failure degrades to a
  device-only sweep instead of killing polling and fan-out; a
  deadline-truncated sweep no longer pages about paths it never
  reached; the client freshness fetch is throttled to hourly. Known
  bounds accepted and stated: yield_died self-extinguishes past the
  5,000-run coverage window (~5 weeks — after five weeks of paging);
  appearance slices are not alert-demanded (parents are); UNKNOWN
  freshness is quiet on the chip and explicit in Preferences — chip
  nagging every user on the summary doc's first day would be worse,
  and dead-source detection lives server-side where the evidence is.
  Alert evaluation adds a loadCoverage scan per sweep (~10k reads/
  sweep at today's store, ~40k/day — cents, included in projections).
- 595 tests green under UTC and America/Los_Angeles; both typechecks
  and the functions build clean.

### Prompt 8 — canonical athlete identity and individual-sport browse  [~]

The last modelling gap: an athlete existed only as a side effect of
being named on a fixture, so "Usyk" between fights returned nothing and
could never be followed. Deployment state verified first — Prompt 7's
code was NOT live (catalogue seeded, sweep pre-catalogue, alertsOpen
absent from sweep docs); direct deploy from this session was blocked by
the environment's permission layer, so deploys are owner-run commands
in the Prompt 8 report.

- **THE ATHLETES COLLECTION** (`athletes.ts` + `rosterStore.ts`):
  canonical ids (`athlete_000184`, transactional counter), provider
  identity map with per-identity source/lastSeenAt, aliases,
  provenance (roster/fixture_derived/review), explicit `nameKeyed`,
  active/missedRefreshes (mark-inactive-never-delete). Follow keys ARE
  the canonical ids; verified zero legacy `athlete-<slug>` follows on
  any production device, so the cut is clean and the name-keyed
  athleteDirectory is retired unread.
- **MATCHING** (`matchAthlete`/`resolveDrafts`): certain by provider
  id, confident by unique full name (recorded), ambiguous mints
  nothing; surname rule unrelaxed. Providers emit DRAFTS
  (fixture + AthleteRefs); resolution is the one place keys are
  decided, with per-run counts (certain/confident/ambiguous/created/
  collisions) on the appearance slice's sourceRuns record. F31 closed
  (directory membership replaces the word-count gate; title-parsed
  names never create). F34 detection closed (WTA numeric ids threaded
  draw+OOP end to end; doc-id collisions refused loudly);
  representation needs an id-scheme extension gated on an owner ruling.
- **ROSTERS**: WTA singles top 200 (numeric ids; rank-contiguity
  verified), Jolpica F1 drivers (total-verified), IBF ratings via the
  site's own wp-json API (17 male + 16 female classes, crawl-delay 10
  honoured, all-or-nothing) carrying WBA/WBC/WBO champions as IBF's
  own fields. WBC robots-refuses (ClaudeBot Disallow /) — dropped;
  WBA/WBO are HTML-only — declined under standing rule (F35). WA world
  rankings are NOT on the __NEXT_DATA__ surface (F36) — athletics
  roster not built, coverageNote says so. Rosters refresh on their own
  weekly scheduler (`scheduledRoster`/`runRoster`) with roster-*
  sourceRuns slices and a sweep-evaluated `roster_stale` alert.
- **F1 DRIVERS**: stamped onto session fixtures (no per-driver
  appearance docs — every entrant runs every session); driver follows
  ride the ordinary query path and the existing race-only preference.
- **BROWSE** (client): AthleteList screen — search-first over the
  canonical directory, curated groups (boxing by weight class
  champion-first men-then-women, tennis top 50, F1 grid), competing-
  soon row; athletes entry row on LeagueList for tennis/boxing/F1;
  athlete page = Team route with the honest empty state ("No scheduled
  events. We'll add them when announced."); coverageNotes updated
  (ATP players absent while ATP tournaments present; MMA and athletics
  athlete-following honestly unsupported, and why).
- **§5 VERIFIED END TO END on the emulator** with real providers: a
  zero-fixture store served Sabalenka from search (findable with no
  scheduled event — the Usyk failure closed); a device following ten
  canonical keys with NO pollPaths; the catalogue alone (tennis-wta
  enabled, all else disabled via the ops mechanism) drove the sweep;
  133 fixtures minted (49 parents + 84 appearances, ALL canonical-
  keyed, resolution 66 certain + 18 created WITH wta ids); the change
  record fanned to the follower; the client-shaped query returned the
  followed player's confirmed appearance and the REAL compiled planner
  emitted its create op. Re-poll after the review fixes: 78 certain, 0
  created (the created athletes now resolve by stored id), 0 retired —
  idempotent. The EventKit write itself is the engine's ordinary
  ledgered create path, unchanged and not re-device-verified.
- **RESOLUTION TABLE measured against production** (read-only replay,
  2026-08-03): tennis 39/54 appearance names certain now, 15 created-
  with-id at next draw poll; boxing 16/32 confident vs the IBF-fed
  directory, 16 display-only; upcoming combat cards: boxing 14
  confident + 6 ambiguous + 8 unmatched of 28 names; UFC 9 ambiguous +
  3 unmatched of 12 (23 of 26 upcoming UFC cards have no parseable
  bout). Would-be directory: 728 athletes (200 WTA + 31 F1 + 497 IBF).
- **ADVERSARIAL REVIEW ROUND on the 8 diff** (three lenses, refuting
  probes, every confirmed finding probe-executed): ~14 confirmed
  across the lenses, all fixed in-round. The two big ones: (1)
  retirement ran against the RESOLVED appearance set, so a draft
  dropped by a directory-state change (a new same-named athlete)
  cancelled a REAL stored bout while a sibling satisfied the evidence
  guard — retirement evidence is now the DRAFT set (resolution decides
  followability, drafts are the provider's testimony of existence);
  (2) roster_stale keyed on coverage rows that age out of the
  5,000-run window, so the alert auto-resolved exactly when the roster
  died and could never fire before the first refresh — replaced with a
  dedicated status/rosters marker evaluated against a static expected
  list. Also fixed: an id arriving for a name-keyed athlete now
  UPGRADES instead of minting a twin that poisons the name; WTA
  name-collisions get no confirmed slot (the surviving doc could carry
  the refused player's match); zero-entry rosters throw (a January F1
  page would have deactivated the grid and stripped session keys);
  IBF empty classes throw (half-fetched roster absence); IBF merge is
  gender-scoped; jolpica total is required; absence accounting scoped
  to roster-PLACED athletes (draw players and already-inactive left
  alone); createAthletes duplicate-checks fresh + batch.create (never
  overwrites a real athlete on counter drift, which also throws);
  nextStartUtc writes only improvements (no churn, no single-card
  regression); deterministic collision tiebreak; client error state no
  longer renders "No athletes here yet" from a 404. Accepted + stated:
  F34 representation gated on the id-scheme ruling; a seconds-wide
  create race window; mid-January partial grids deactivate absent
  drivers after two refreshes (self-heals on reactivation).
- 637 tests green under UTC and America/Los_Angeles; both typechecks
  and the functions build clean. Deploy + roster seed are owner-run
  (see the Prompt 8 report's Run these). DEPLOYED + SEEDED by owner
  2026-08-03 (verified: 29 functions, 749 athletes, roster marker
  fresh, catalogue sweep polling 55 paths). Post-ship same-day fixes:
  7e6c8ca (F39 — pre-RNFB binary RedBox on follow; native-reported
  TurboModule miss despite JS catch; rnfbPresence non-throwing gate,
  device-verified) and d3bc696 (one real fight one calendar entry —
  client dedupeSameBout collapses cross-provider bout pairs;
  device+sqlite verified).

### Prompt 9 Part A — tennis browse: tournaments as competitions  [x]

- **A1 NOT REPRODUCIBLE**: the ATP Tour row exists in config
  (staticCompetitions, unchanged since Prompt 4), renders on-device
  beside WTA (screenshot-verified), its slice is live (78 future
  tournaments, soonest Aug 13) and its follow path is the ordinary
  static-competition path. The one genuinely WTA-only surface is the
  tennis ATHLETES screen — honest, no ATP player feed, and the
  coverageNote on that screen says so. Same-shape sweep across the
  store: every slice with future fixtures maps to a browse surface
  except athletics' non-curated wa-* groups, which are covered by the
  deliberate "Everything on the calendar" catch-all row (F23 design).
- **A2 BUILT**: tournaments are followable competitions. Canonical
  YEAR-AGNOSTIC key `tennis-t-<slug>` stamped into followKeys by both
  providers (competitionId untouched — ingest/reaper/coverage
  unaffected; probe: 0 fixtureChanges from the one-time rewrite of
  existing docs, then stable poll-over-poll). JOIN = name+dates
  heuristic, stated plainly (no shared id exists): exact normalised
  title + window overlap auto-joins; curated alias table for evidenced
  sponsor variants (DC Open; Toronto canonicalised sponsor-light
  before any follows exist). MEASURED against prod through the real
  code: 99 tournament rows — 4 joint (Toronto, Cincinnati, US Open,
  Beijing), 57 ATP-only, 38 WTA-only. `listTournaments` endpoint +
  client rows under the tour rows (UTC-formatted inclusive spans);
  tournament follows carry NO pollPath (tier-1 catalogue warmth).
  Joint pairs collapse client-side in dedupeSameEvent (WTA doc wins —
  draws/OOP hang off it), which also closes F33's two-events case for
  both-tour followers; SAME-PROVIDER GUARD added so a feed quirk can
  never delete a real event (review round). Review round: 7 findings,
  2 fixed pre-commit (caption UTC/inclusive-end; same-provider guard)
  + Toronto alias + empty-slug guard; stated bounds: flagship rows
  read "ATP" with 2027 dates until the WTA window reaches them; the
  45-day edition window can cosmetically fuse two same-slug events'
  browse dates (0 live cases; calendar unaffected). Fixture id scheme
  UNCHANGED (the stop-gate never tripped). 659 tests, both TZs.
  DEPLOYED 2026-08-03 under the NEW deploy rule (agent-run): 99 rows
  live, 4 joint, Toronto canonical.

### Prompt 9b — crests out, generated identity in  [x]

Owner rulings executed. THE DEPLOY RULE CHANGED: the agent deploys
(AGENTS.md updated — gate: full suite + both typechecks + build +
review round; incremental only; migrations/destructive scripts remain
owner-approved; reaper/TTL/console untouchable).

- **CRESTS REMOVED** everywhere — rendering (browse, search, rail,
  hero watermark, team pages), requesting and storing (fdorg `crest`,
  TSDB `strBadge`; badge-by-name enrichment deleted; `strLeagueBadge`
  never requested). Old stored follows tolerate their dead crestUrl
  key; `identityFollow` ranks on brandColour alone.
- **GENERATED TREATMENTS shipped in the same change**: `monogramOf`
  initials as the entity mark (GlyphTile/rail/rows/team header), a
  typographic hero watermark, and `sportPattern.tsx` — court / pitch /
  ring / track / diamond line geometry as app-owned Views, rendered
  over the teamTheme gradient, suppressed over photos. The emoji is no
  longer an entity fallback; it remains only as SPORT identity.
  Sim-verified: boxing hero shows ring ropes + "AM" watermark; rail
  shows MF/WD/AR/PL monogram circles on palette tints.
- **COLOUR WIRING**: fd.org kit colours now theme search rows AND
  persist onto the follow; athletes gained `accentHue` (deterministic
  golden-angle hash of the canonical id — review round caught the
  1°-apart neighbours of a plain modulo; changed before any value was
  stored), stored on new docs, derived at serve time for the 749
  existing, rendered on athlete browse + search and persisted to
  follows/page theme as hex.
- **PHOTOGRAPHY**: fetch-time verification (`verifiedArt`) — allowed
  licence AND named artist required, artist/licence/Commons source
  page/verifiedAt recorded per image; Credits screen links per-image
  sources and carries the TSDB data attribution their terms require.
  `docs/IMAGERY.md`'s wrong "safe TSDB fields" claim corrected.
- **VENUES**: TSDB `strVenue` → `fixture.venue` (141/148 PGA rounds
  live-checked) with a DIRECT entity→P18 resolver in its own `place:`
  cache namespace — the review round proved the team resolver's P115
  hop dead for venue names before it could poison caches. TENNIS venue
  photography HELD at the owner gate: ICS LOCATION is city+country,
  not venues (proposal pending: tournament-name Wikidata lookup).
- Review round: 7 findings, all fixed pre-deploy (venue resolver,
  golden-angle hues, athlete colour through to follows/page,
  Following-tile fallback, place-namespace credits, dead typings).
  665 tests both TZs; deployed `--only functions`, confirmed live
  (accentHue serving, crest fields absent from search).


### Prompt 11 — competition ranking and follow granularity  [x]

Working-tree state settled first: this round INHERITED an unreported,
uncommitted server-side start (catalogue priority/rankOnly,
listPriorities, the WTA final slot, the -main/-final scoped keys) with
five failing tests and no client half. Adopted after adversarial
reading, then finished; the review round confirmed one CRITICAL defect
in the inherited design (below).

- **PART A — priority is catalogue data.** `priority` (0–100) beside
  `tier` — related, not identical (the World Cup: top priority, dormant
  schedule ⇒ two fields). Ranking-only rows (`rankOnly`, inert thrice
  over) carry weights for keys the sweep never polls: 4 slams + 6
  athletics groups, keys drift-pinned to tournamentKey and
  sportsConfig. `sport` on every entry feeds `sportWeightsOf` (max per
  sport — the best competition speaks for its sport; derived, not a
  second knob). Server: listLeagues + listTournaments sort by the
  5-min-cached map; NEW `listPriorities` serves {priorities,
  sportWeights}. Client: hourly-cached (MMKV) STABLE sorts on the Home
  sports grid, the sport picker, the 12 static per-sport lists, and
  search's Competitions + Sports groups; bundled config order is the
  offline floor; search MATCHING untouched. The seed script now
  PRESERVES ops-tuned `enabled` AND `priority` (--reset-priorities
  forces) and prints a live→seed diff. THE RANKING ITSELF = the seed
  dry-run in the Prompt 11 report, awaiting owner review; deployed
  code changes no visible ordering until the seed is applied.
- **PART B, the confirmed baseline** (production-measured 2026-08-03):
  tennis tournament follow = ONE date_only banner per edition (joint
  events collapse client-side); tour follows = every banner (ATP ~60
  live, WTA ~40); boxing/MMA = cards only (13 boxing future; bouts
  reach calendars via athlete follows); athletics = meeting banners
  (catch-all 1,372 future); golf = FOUR date_only round docs per
  tournament; F1 = per-session docs behind the GLOBAL race-only pref
  (60 future: 12 race + 48 support); county cricket = one 4-day span.
- **GRANULARITY = SCOPED FOLLOW KEYS** — no follow-model or ledger
  change; the brief's stop-gate never tripped. Server stamps
  `tennis-t-<slug>-finals` on ONE per-tournament FINAL SLOT doc
  (provisional on the parent's LAST day → OOP-confirmed
  opponent-checked slot → frozen once decided; the appearanceLifecycle
  mechanism reused), `<golf league>-final` on provider-titled Final
  Round docs (\b-anchored), `-main` on headline bouts (stamped, not
  offered — a TSDB card's title IS its main event, so the option would
  change nothing; argued in the report). Client: optional
  `Followable.scope`; followQueryKeys expands the fixture query;
  registry registers scoped keys (push fan-out reaches slot changes);
  Following counts and the Home rail re-keyed per follow. F1 scope =
  per-follow OVERRIDE of seriesSessions inside desiredEventFor
  (explicit beats global; most-permissive among explicit), aligning
  with the existing mechanism instead of a second one; tapping the
  global-default chip clears the override. TeamScreen grows the
  selector; the ATP asymmetry is stated ON the tennis finals option
  and in the tennis coverageNote. Options shipped: tennis
  block / block+final, golf all-rounds / final-round, F1 all /
  race-only. NOT SHIPPED, argued: semis-onward (no semi marker in any
  banked payload — the F22 rule), boxing main-event scope, athletics
  anything (no event-level or athlete-level data exists).
- **TWO PRODUCTION DEFECTS found by the Part B probes** (F40/F41):
  ZERO of 78 future ATP parents carried a tennis-t-* key — every
  ATP-only tournament follow (57 of 99 rows) delivered nothing,
  because the only post-Prompt-9 ICS fetches were HTTP 429s: the
  tier-1 catalogue was polling a feed the owner ruled ONCE DAILY, and
  Prompt 9's "99 rows live" verification measured serve-time rows, not
  stored keys. FIXED: pollTennis enforces a 22h cadence floor at the
  connector (status/tennisIcs marker; skips recorded; marker-read
  failure fails closed; zero-VEVENT bodies throw); tennis-atp stays
  tier 1 for same-day retry capacity. The key stamp lands with the
  first successful daily fetch.
- **VOLUME CHECK**: no new option exceeds 2 events per tournament
  edition (tennis block+final) or reduces below 1; every >20 figure is
  a PRE-EXISTING baseline (tour follows ~40–60 banners, F1
  all-sessions 60, a golf season ~190 rounds, athletics catch-all
  1,372 — the deliberate F23 flood row, unpriced so it sorts last).
- **ADVERSARIAL REVIEW ROUND** (three lenses, refuting verifiers,
  every finding trace-confirmed): 12 confirmed. The big one, caught by
  two lenses independently: the inherited "decided final returns null"
  design let appearance RETIREMENT soft-cancel the slot doc on the
  night of the final (the finalists' still-graced rolling appearances
  satisfied the per-parent evidence guard) — the push would have
  DELETED the final from finals-scoped calendars during the trophy
  ceremony. Fixed: a decided final keeps emitting its confirmed shape
  exactly as long as its OOP slot is live-or-graced (the rolling
  appearances' proven exposure; same grace, same strict compare as the
  retirement freeze), and only then stops — regression-pinned both
  sides of the boundary. Also fixed: an UNWANTED twin appearance
  (dragged into the fetch by a pin's slice key) could eat the followed
  slot — dedupeFinalSlots now requires the twin to be followed or
  pinned, and stands down entirely without follow-key context; scope
  UI state derived from the store (unfollow→refollow showed a dead
  scope); Undo after unfollow restores the scope (in-session memory);
  golf's Final Round regex \b-anchored to the title end ("Semifinal
  Round" was scoping); tier-2 demotion reverted (above); zero-VEVENT
  marker arming; Home-rail next-fixture join uses scoped query keys;
  seed-script comment contradiction. Accepted + recorded: yield_died
  can be suppressed for tennis-atp under a specific off-sweep success
  pattern (monitoring gap only); exclusion-vs-dedupe acts on the
  fetched doc, not the calendar event (pre-existing class shared with
  bout pairs); a 200-follow device's registry write can be blocked by
  one scope change (F9 class). Golf scope-key transition: stored golf
  docs gain -final keys on their first post-deploy poll — closed
  operationally by manual re-polls right after deploy, and no client
  UI exists on devices until the next app build anyway.
- 709 tests green under UTC and America/Los_Angeles; both typechecks
  and the functions build clean. Deployed --only functions (Prompt 11
  report has the verification); catalogue seed dry-run AWAITS owner
  review — nothing user-visible reorders until --apply.

### Prompt 11b — ranking revisions before seeding  [x]

Discovered at the dry-run: the 11a seed had ALREADY been applied to the
live catalogue — not by this session, and against the brief's own
"do not seed until resolved". Verified exactly the untuned 11a values
(0 mismatches across 67 docs), so nothing ops-owned exists to lose and
`--apply --reset-priorities` lands the revision cleanly. Reported, not
reverted (the standing effect is benign — no client build consumes the
weights yet — and the 11b apply supersedes it). The owner's new
standing rules from this episode are in AGENTS.md: one session per
feature area + commit before switching windows, and verify the layer
the feature READS, not a layer that happens to agree (the F40 lesson).

- **SPORT WEIGHT IS ITS OWN KNOB** (`sport:<key>` rows, rankOnly +
  sportRow): deriving from the best competition conflated "has one
  giant event" with "is a big sport" — Wimbledon put tennis second
  globally. sportWeightsOf prefers explicit rows; derived max survives
  only as the missing-row fallback (a sport without a row degrades to
  the old behaviour, never to zero; order-independence pinned). Seeded
  order is UK-leaning by owner direction: soccer 100, F1 88, cricket
  86, rugby 84, tennis 82, boxing 80, athletics 76, golf 74, NFL 70,
  MMA 66, basketball 62, motorsport 58, baseball 54, ice hockey 50.
  Labels mirror the client's (drift-pinned). County Championship 24→34
  within cricket. The rest of the 11a competition data stands —
  cross-sport oddities dissolved once sport order stopped deriving
  from it.
- **DORMANT COMPETITIONS SORT BELOW LIVE ONES, never hide.** Census at
  revision time: 7 of 67 keys dormant — World Cup, Euros, Champions
  League, IPL, FA Cup, T20 World Cup, World Athletics Championships
  (the owner expected more than the WC; correct). Dormancy = aggregate
  counts on the SAME composite index the client fixture query uses,
  computed inside the 5-minute priority cache and served in
  listPriorities (`dormant`); the brief's stop-condition (serve-time
  fixture reads that can't be cached) was not tripped. END-based, not
  start-based: zero future STARTS falls back to a lookback-window
  fetch judged by appearanceEndMs — a slam mid-fortnight or a 4-day
  County match mid-span is live (upcoming means NOT YET FINISHED; the
  start-based first cut would have demoted exactly the events that
  are ON). A count failure degrades to LIVE — a read failure must
  never be read as "no fixtures". Client: byPriorityLive (live band,
  then dormant band, weight within, stable) on the static competition
  lists and search's Competitions group; listLeagues sorts the same
  way server-side; listTournaments needs nothing (rows derive from
  live docs).
- **yield_died GAP CLOSED** (was accepted-and-recorded in 11): coverage
  rows' lastReason/lastError now come from the latest NON-skip run — a
  `skipped_ics_daily_cap` landing after the real daily fetch carried
  no fetch evidence yet read as an honest empty, suppressing the alert
  F40 just proved load-bearing. lastRunAt stays the literal latest.
  Pinned both ways (skip supplies nothing; a real honest-empty still
  reads through a later skip).
- **LOCALE — analysed, not built** (owner to choose): the mechanism
  extends cleanly (optional per-region overlay field, region param on
  listPriorities, per-region cache — ~a day of code); the real cost is
  CURATION — every region is a second full ranking to maintain and
  review. Recommended: this one UK-leaning default now; the overlay is
  purely additive later, no schema break.
- ATP keys re-verified surviving the post-deploy sweeps (78/78; the
  16:30 sweep recorded skipped_ics_daily_cap instead of fetching — the
  guard's first live encounter behaved exactly as designed).
- 714 tests green under UTC and America/Los_Angeles; both typechecks
  and the functions build clean. Focused adversarial review on the 11b
  diff (findings recorded in the 11b report). Deployed
  --only functions; the REVISED seed dry-run (delta: 14 sport rows NEW
  + County 24→34) awaits owner approval —
  `node scripts/seed-catalogue.mjs --apply --reset-priorities`.

### Prompt 10/10b — ATP players from Wikidata  [~]

Phase 1 (investigation, allowed surfaces only): Wikidata CC0 verified
verbatim; per-player richness confirmed via the explicitly-allowed
Special:EntityData (P536 ATP ids, P597 WTA ids in OUR stored numeric
namespace, P599 ITF ids on BOTH tours, P1146 WA ids, P18 Commons
images, career dates, historical rankings); enumeration surfaces sat
under crawler-aimed robots Disallows that Wikimedia's own bot docs
invite clients through — the Tennis-TV-ICS shape, put to the owner
rather than judged here. ITF re-probed: GetCalendar still serves the
byte-identical Incapsula challenge — exclusion stands, and P599 makes
it unnecessary; daviscup.com is open (no challenge, robots allow) but
a rebuilt Next.js app-router site — parked by ruling. Stale brief
premises corrected from the record: ITF was never approved, tennis
venue photos shipped in 9c, F34 closed in 9b.

10B RULING EXECUTED (WDQS + Action API approved as documented
programmatic services; crawler-vs-client reasoning + citation nuance
recorded in DECISIONS): ONE lean enumeration query (6,559 distinct
P536 humans, ~6.5MB, ~12–18s; the aggregate-subquery form 502s and is
banned in-code). THRESHOLD VALIDATED BEFORE MINTING per the owner
gate: (plausibly-current ∩ sitelinks≥3) ∪ ever-top-10 ∪ curated
singles-No. 1 ⇒ **1,513 of 6,559**; checked against the live Toronto
ATP draw (111 men playing THIS WEEK): 110 matched, **110/110 pass,
zero threshold drops** — the one miss has no Wikidata item at all
(universe bound, the WTA-qualifier class). The sitelinks arm never
fired against a current player.

BUILT (mint GATED on the owner reading the counts —
ATP_ROSTER_ENABLED=false; the source neither runs on the scheduler
nor is roster_stale-expected until flipped):
- providers/wikidataAtp.ts — the enumeration + threshold + mapping;
  MIN_UNIVERSE 4,000 truncation guard, selected-band [800, 4,000]
  drift bounds; athletes minted source 'wikidata' (Q-id) with atp +
  itf extraIdentities — three namespaces certify identity, NO schema
  change (the identity map was built for this), canonical
  athlete_NNNNNN keys untouched.
- THE CURATED No. 1 LIST: P1352 cannot carry "Former world No. 1s"
  honestly in either direction — it includes doubles No. 1s and
  pre-ranking retrospectives (Jamie Murray, Arthur Gore) and MISSES
  four singles No. 1s with no =1 statement (Agassi, Murray, Năstase,
  Ríos). The 29 singles No. 1s are a closed, world-news-on-change set:
  curated Q-id constant (DC-Open-alias class, cited, extracted
  2026-08-03), membership also imports (the historically-notable arm
  anchored). It is the ONLY men's browse group — no live rank exists
  to cut the other ~1,480 honestly, so they are search-first; "Grand
  Slam champions" deferred: P2522 covers 32 of 6,559 and the
  edition-series linkage is inconsistently modelled, and the Wikipedia
  list article mixes winners with finalists in extractable shape.
- reconcileRoster POPULATION GUARD: every existing tennis athlete is a
  WTA-id-backed woman; a confident cross-gender name match must mint a
  second athlete (making draw matching honestly ambiguous), never
  attach a man's identity and honours to a woman's follow —
  nameMatchExcludesSources ['wta'], pinned both with and without.
- normaliseName TRANSLITERATION FOLDS (đ→dj ø ł æ ß þ ð): đ never
  NFD-decomposes, so 'Hamad Međedović' searchName'd as 'hamad me
  edovi' — unfindable by anything a user types. Caught by the emulator
  E2E probe BEFORE any prod doc carried one (verified 0 of 757
  affected — no backfill exists to owe); client sameBout mirror synced
  by hand as documented.
- E2E on the emulator through the real apply path: 1,513 created, 0
  ambiguous; searchEntities finds Međedović/Đere by typed
  transliteration, Năstase and Alcaraz from a ZERO-fixture store (the
  entire point — findable with nothing scheduled); browse group
  exactly the 29 (Agassi in, Jamie Murray out), after the WTA top 50;
  competingSoon honestly empty. Client follow flow + empty state are
  Prompt 8 behaviour, unchanged and not re-device-verified. Men's
  appearances have NO minting source today (F33 stands) — a follow
  delivers events the moment a draws source exists, and the tennis
  coverageNote now says exactly that.
- Roster functions to 512MiB (the 6.5MB answer fans to ~6,600 row
  objects; 256MiB left no honest headroom beside the IBF crawl).

- ADVERSARIAL REVIEW (one lens, live prod + live Wikidata probes): 2
  confirmed. The real one: the population guard keyed on
  providerIds.wta and MISSED name-keyed tennis women (a blank-PlayerID
  draw mint has no id to check) — fixed: an id-less confident name
  match is excluded whenever the guard is active, pinned. Ops note
  encoded in the flip procedure: the roster_stale expectation arrives
  at deploy time, so the flip MUST be followed immediately by
  runRoster or it pages within 6h. Survived attack, worth keeping:
  all 29 curated Q-ids verified against live Wikidata (the banked
  sample alone could not catch a typo); zero prod carriers of the
  folded letters anywhere a normaliseName output persists; live
  fetchAtpRoster one-shot 4.5s / 109MB RSS; import graph cycle-free
  (the athletes import is type-only); future note — MAX_SELECTED
  4,000 sits within 250 of the 5,000 athlete scan-cap tripwire.
- 726 tests green under UTC and America/Los_Angeles; both typechecks
  and the functions build clean; deployed --only functions (the gated
  source is inert in prod). MINT AWAITS the owner's read of the
  counts: on approval I flip ATP_ROSTER_ENABLED, deploy, and invoke
  runRoster in the same action — then the Tuesday scheduler owns it.

### Prompt 12 — tennis athlete groups: labels, the men's split, retirement  [x]

Owner report: the women's group read "WTA Tour" with no indication it
was women, the men's read "Former world No. 1s" with no indication it
was men or the ATP — and, the real problem, the men's group was
RETIRED PLAYERS in an app about upcoming events.

- DIAGNOSIS (six read-only agents, live prod + live WDQS). The men's
  group was worse than reported: with no `rank` the comparator falls
  to `displayName`, so it opened Agassi, Murray, Roddick, Borg, Becker
  with Alcaraz sixth, and all 29 rows captioned with the group name
  because 0 of 29 carry rank, countryCode or nextStartUtc (F41).
  Confirmed the owner's model of the sources exactly: WTA top 50 from
  the live rankings API, men's 29 from a curated Wikidata-derived
  constant, no approved ATP ranking source.
- THE ACTIVE/RETIRED MEASUREMENT, re-derived through the repo's own
  parser: universe 6,559 → selected 1,513. Wikidata records a career
  end for 117 (7.7%) and a death for 9; union 119 (7.9%). Newest end
  year anywhere is 2024 — ZERO carry 2025 or 2026. Of the 29 No. 1s,
  25 retired and 4 still playing (Djokovic, Alcaraz, Sinner,
  Medvedev), and P2032 is 100% correct in both directions on exactly
  that population. Everything else measured is unusable: P1344 is
  ANTI-correlated with currency (Alcaraz 0, Sinner 0, retired Murray
  23), P1352-with-dates is retrospective (Djokovic's newest is 2019),
  P1317 covers 0 of 1,513, P793 covers 10, P5027 is an unrelated
  property. Our own store holds ZERO men's participation records
  (F42). VERDICT: a high-precision retired MARKER is buildable; a
  trustworthy active PARTITION of 1,513 is not.
- SHIPPED: group titles state their population and resolve from
  `groupingKey` server-side (a rename is a deploy, not a migration);
  the 29 split into still-playing and retired on recorded retirement;
  `careerStatus`/`careerEndYear` first-class on athlete docs, browse
  cards and search hits for all 1,513; retired caption, honest empty
  state and a follow WARNING (not a block) from one pure client module;
  the tennis coverageNote extended and now rendered on the athlete
  screen too. DECISIONS carries the naming convention and the
  boxing-not-restyled hold.
- ADVERSARIAL REVIEW (4 dimensions, 19 raised, 8 confirmed after a
  refutation pass): four distinct root causes, all fixed before
  deploy. The severe one was mine and is now F44 — reusing `atp-no1`
  for the narrowed "retired" meaning put Alcaraz under a "retired"
  header for up to eight days, demonstrated by running the new shaper
  over live production documents. Also F45 (three new consumers, and
  the one map building their input dropped the field — dead code that
  typechecks) and F46 (a fact about a person read from follow state,
  so Unfollow restored the false promise).
- 750 tests green under UTC and America/Los_Angeles; both typechecks
  and the functions build clean.
- OWNER RULINGS (2026-08-04, in the report): (a) the active men's
  group STAYS AT THE FOUR that are known — no heuristic extension into
  the 1,394 unmarked men; (b) runRoster authorised and EXECUTED rather
  than waiting for the Tuesday scheduler.
- ROSTER REFRESH EXECUTED 2026-08-04 (owner-authorised): roster-atp
  1,513 entries, 0 created, 1,513 updated, 0 ambiguous; roster-wta
  200/203 updated/3 deactivated; roster-ibf 497; roster-f1 31. Live
  browse then verified: "WTA Tour — Women" 50, "Men's world No. 1s —
  still playing" 4 (Alcaraz, Medvedev, Sinner, Djokovic), "Men's world
  No. 1s — retired" 25 with per-row years (Agassi 2006, Murray 2024,
  Roddick 2012, Borg 1993, Becker 1999). searchEntities returns
  Federer with careerStatus retired / careerEndYear 2022. Confirmed on
  the Release simulator build.
- OBSERVED, NOT FIXED: a browse row whose only caption material is its
  grouping echoes the section header ("Men's world No. 1s — still
  playing" under a header saying the same). Pre-existing fallback
  behaviour (captionFor's last branch), now visible on the 4-row
  group because those athletes carry no rank, country or date. The
  retired rows read "Retired 2006" instead, so the echo is confined to
  the still-playing four. Left alone — suppressing the fallback in
  browse mode is a caption-policy change nobody asked for.
