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
- "Calendar choice" is satisfied by decision: dedicated Gameday calendar
  only (never user calendars); user-selectable target deferred unless
  owner requests it.

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
  per screen); calendarChoice unset/deferred/enabled gates the engine —
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
