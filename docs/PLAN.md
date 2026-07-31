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

