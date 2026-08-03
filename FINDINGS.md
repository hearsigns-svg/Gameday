# FINDINGS

Defects and hazards noticed while doing staged remediation work, recorded
rather than fixed so that no stage widens beyond its brief. Append-only.
Each entry names where it was found and what it would cost to leave.

---

## From the coverage audit (2026-07-31), deferred by the remediation brief

### F1 — RESOLVED in Prompt 6: iOS silent push is skipped entirely
`functions/src/sweep.ts:164-173`. Only FCM registration tokens are sendable
by the Admin SDK; iOS devices register raw APNs tokens
(`deviceRegistry.ts:42` records `tokenType: 'apns'`) and are filtered out of
the fan-out. Push propagation is therefore **Android-only**. Explicitly out
of scope for this remediation (it is a propagation problem, not a coverage
one), but it is real and severe: an iOS user's calendar only corrects itself
on foreground sync or background refresh. **RESOLVED 2026-08-02
(Prompt 6): iOS now obtains a real FCM registration token via React
Native Firebase messaging (guarded lazy require — a JS refresh on a
pre-RNFB binary degrades to the honest no-token registration), so the
sweep's existing fan-out covers it. OWED: the owner uploads an APNs auth
key to Firebase console (Cloud Messaging settings) and the delivery
proof needs a physical device — simulators cannot fire silent push (M6
lore).**

### F2 — `venueTz` is the literal string `'UTC'` on 10,395 of 10,483 docs
Only the NHL adapter supplies a real IANA zone (`nhl.ts:74`). Every other
adapter hardcodes `'UTC'`. The field is vestigial: nothing reads it. NHL's
`venueTimezone` and TheSportsDB's `strTimeLocal` are both free and would
allow "2:00 AM (7:00 PM in Los Angeles)". Stage 5 notes it; nothing fixes it.

### F3 — RESOLVED in Prompt 6: F1 fixture ids bake in the round number
`functions/src/providers/f1.ts:53` — `f1-${season}-r${race.round}-${slug}`.
When Jolpica inserted a new round 16 into the 2026 calendar, Singapore
shifted 16→17 and the US GP 17→18; because ingest never deletes, four
documents survive under their old ids still carrying the old race names.
The id scheme is the root cause and a circuit ID or a stable race slug
would fix it, but changing it rewrites every user's ledger key, so it is
deliberately NOT part of Stage 4 (which only reaps the orphans). **RESOLVED
2026-08-02 (Prompt 6): ids are now `f1-<season>-<circuitId>-<session>`
(albert_park survives renumbering; a race with no circuitId throws).
The four orphans were the reaper dry-run's ONLY production candidates.
Migration = functions/scripts/clear-f1-legacy.mjs, owner-run AFTER
deploy: deletes the 64 future old-scheme docs with cancelled change
records; followers' events are replaced through the ordinary ledger
path, never orphaned (3 devices follow f1-series-1; reminders on
replaced events do not carry).**

---

## Found during Stage 0 (instrumentation)

### F4 — `cachedTeams` never expires, despite claiming a 24-hour TTL
`functions/src/directory.ts:26-39`. The comment says "Generic 24h
write-through cache for team directories" and `docs/PLAN.md` M3 says "24h
Firestore directory cache", but the implementation is:

```ts
const cached = await ref.get();
if (cached.exists) return (cached.data() as { teams: DirectoryTeam[] }).teams;
```

`cachedAt` is written and never read. A team directory fetched once is
served forever — promoted and relegated clubs never appear or disappear,
and the alias table that `aliases.ts` builds from these documents can never
improve. This matters directly to **Stage 6**, which plans to seed
`teamDirectory` from TSDB: a seed written today would be permanent.

### F5 — `?? []` remains in the TSDB directory paths
`functions/src/providers/tsdb.ts` — `fetchTsdbLeagueTeams` and
`searchTsdbTeams` both do `(body.teams ?? []).map(...)`. Stage 0 fixed this
class of bug in every *ingest* fetcher (`requireArray` in
`providers/fetchResult.ts` distinguishes a missing key from a documented
empty), but left the two directory fetchers alone to avoid widening scope.
A TheSportsDB response-shape change would silently produce an empty team
directory, which is the standing invariant's exact failure mode.

### F6 — Dead code in the acquisition layer
- `functions/src/directory.ts:105` `listApiSportsLeagues()` — no caller.
- `functions/src/directory.ts:133` `listSoccerTeams()` — no caller.
- `src/features/fixtures/data/fixturesRepo.ts:53` `requestPoll()` —
  exported, never called; hardcodes the dead API-Sports `pollTeam` route.
All three reference `ACTIVE_SEASON = 2023` and the suspended API-Sports
account. Stage 2 quarantines the adapter; these are separate.

### F7 — `coverageReport` counts never-run slices as zero-yield
`functions/src/coverage.ts` — `totals.zeroYield` counts rows whose
`lastNonZeroYieldAt` is null, which is trivially true for a slice that has
never run at all. `totals.neverRun` disambiguates and both are reported, so
this is a presentation wrinkle rather than a wrong number, but a future
alerting rule must not key off `zeroYield` alone.

### F8 — Production is being mutated by concurrent app usage
Not a defect; an ops fact that affects measurement. Between the audit dump
(10:26Z) and the Stage 0 baseline (11:03Z) on 2026-07-31, 272 Premier
League fixtures entered production with `firstSeenAt: 2026-07-31T10:30`.
That is not a sweep slot (sweeps land at HH:20), so it was an interactive
`pollFdCompetition?code=PL&season=2026` from someone using the app. The
audit's `fdorg-comp-PL = 108` is therefore already superseded by 380.
Baselines taken before Stage 0 is deployed are snapshots of a moving
target; after deployment, `sourceRuns` records who caused each change.

---

## Found during Stage 1 (the follow cap)

### F9 — The device registry caps followKeys and pollPaths at 200, and fails closed
`firestore.rules` — the `devices/{uid}` write rule requires
`followKeys.size() <= 200` and `pollPaths.size() <= 200`. Stage 1 removed
the client-side 10-key read cap, but a user who crosses 200 follows will
have their entire registry write REJECTED by rules. `registerDevice`
catches the failure and only `console.warn`s
(`deviceRegistry.ts:64-68`), so the device silently stops being swept:
its follows are never re-polled and its fixtures go stale forever. The
same class of bug as the one Stage 1 fixed, one layer up, with a worse
failure mode (nothing is written at all rather than a truncated read).

### F10 — CLOSED in Prompt 7: `MAX_PATHS_PER_SWEEP = 250` is a coverage ceiling across ALL users
`functions/src/sweep.ts:37`. The sweep unions poll paths across every
registered device and then takes the first 250. Beyond that, paths are
dropped for that run — recorded as `truncated: true` in the `sweeps` doc
and nowhere else. With a growing user base the union grows, so some
followed competitions would simply stop being refreshed, arbitrarily and
invisibly. The `sourceRuns`/`coverageReport` work from Stage 0 would now
make the consequence visible (those slices stop having runs), but the
truncation itself is unaddressed. Relevant to Stage 7's catalogue design,
which changes what the sweep is driven by. **CLOSED 2026-08-02
(Prompt 7): the sweep now runs the union of device and catalogue paths
with PRIORITY drop order — device paths first (a real follower's slice
is never starved by a warming entry), then catalogue tier 1, then
tier 2; uid lexicography is only the within-band tiebreak. The full
catalogue (57) plus every registered device path (10) uses 67 of the
250 slots; the ceiling now needs ~190 distinct device-followed slices
before it can bite, and what it drops first is the catalogue's tail,
recorded per-path in sourceRuns as before.**

---

## Found during Stage 1b (carry-forward)

### F11 — RESOLVED in Stage 1c: the prune invariant never fires; 38 orphaned events survive every sync
**Root cause confirmed and fixed 2026-07-31 — see F13/F14 below.**
Measured on the iOS simulator, 2026-07-31. The KickOffCal calendar held
**1,246 tagged events for 1,208 distinct fixture ids** — 38 fixtures with
two calendar events each. For `fdorg-560772` the two events are ROWID 1182
(created 2026-07-30 22:33, UUID `9983710B…`) and ROWID 1301 (created
2026-07-31 10:15, UUID `625FA963…`); the MMKV ledger references only
`625FA963…`, so 1182 is a textbook orphan: tagged, in the target calendar,
inside the −5y…+3y scan window, and unreferenced by the ledger.

`syncEngine.ts:525-531` is supposed to delete exactly this. Two full syncs
were observed (a 748-create follow and a mount sync) and **neither recorded
a `pruned` count**, while all 38 orphans survived. Ledger-driven ops are
exact over the same period — unfollowing KHL deleted precisely 748 — so the
defect is isolated to the prune path, not to planning.

Leading hypothesis, NOT yet confirmed: `eventWindow()`
(`calendarDriver.ts:91-97`) asks EventKit for **8 years** (now−5y to
now+3y). Apple documents `predicateForEvents(withStart:end:calendars:)` as
limited to a **4-year** span. Truncated from the start date, the effective
window would be 2021-07 → 2025-07, which contains none of our fixtures —
so `listTaggedEvents` would return an empty list, prune would find nothing
to do, and **reinstall recovery would rebuild an empty ledger and duplicate
the entire calendar**. That last consequence matches the observed
duplicate pairs being created on two different days.

Cheap confirmation: narrow `eventWindow()` to under 4 years and re-run a
sync; if `pruned: 38` appears, the hypothesis holds. NOT done here —
`calendarDriver` is outside Stage 1b's five items.

**CONFIRMED AND FIXED in Stage 1c. See F13.** Provenance, established in
Stage 1d: the empty ledger at 10:15 was NOT my own reinstall — my first
app run in this session wrote its outcome at 13:59 UTC, nearly four hours
later. It was the concurrent session's dev builds, on a shared simulator.
So the 38 are a REPRODUCTION of F13 in a development environment, not
evidence of production users having hit it — though the mechanism would
hit any iOS user on reinstall.

### F12 — CLOSED in Stage 1c. A mid-burst kill could not be staged on iOS; the write phase is too short
748 creates take 5.0s on the iOS simulator. Two attempts to terminate the
app inside that window both landed after the op loop had already completed
(`created: 748` was written to the sync record each time). So kill-resilience
is proven for a *completed* run (a following sync planned zero ops and
created zero duplicates) but the genuine mid-loop interruption case remains
unexercised on iOS. On Android the same burst takes 48.8s, which is a wide
enough window to stage properly — worth doing there.

Note the interaction with F11: a real mid-loop kill leaves events created
but not yet ledgered. Those are exactly the orphans prune is meant to
collect — and prune does not work. So an interrupted burst would currently
leave permanent duplicates.

---

## Found during Stage 1c (F11 root cause)

### F13 — CONFIRMED AND FIXED: EventKit returns NOTHING for a long scan range
The single decisive measurement, same code and same scenario on both
platforms (ledger wiped, OS permission intact, zero follows):

| Platform | Tagged events present | `recovered` |
|---|---|---|
| Android (CalendarProvider) | 964 | **964** |
| iOS 26.5 (EventKit) | 1,790 | **0** |

`eventWindow()` asked for now−5y…now+3y — an **8-year** span. EventKit
answered with an empty list and no error. Android's CalendarProvider
answered the identical range completely, which is the free discriminator:
the defect is EventKit's range handling, not our code's logic.

Both reported symptoms follow from this one cause:
- **Non-collection.** Prune consumes the same scan, so `orphanEventIds`
  always received an empty list and `pruned` never appeared in any outcome.
- **Creation.** `entriesFromRecoveredEvents` consumes the same scan, so
  reinstall recovery rebuilt an EMPTY ledger — and the next follow then
  created events that already existed physically.

FIXED by chunking the scan into 2-year windows and concatenating
(`recovery.ts::scanWindows`, consumed by `calendarDriver.ts::scanCalendar`),
deduped by event id because window boundaries touch. After the fix, the
identical iOS test returned `recovered: 1752` — from 0.

OBSERVED, NOT DOCUMENTED: I confirmed that 8 years returns nothing and
2-year chunks return everything. **I did not bisect the exact ceiling.**
Apple documents a 4-year limit for `predicateForEvents`; 2 years was chosen
for margin, not tuned to a measured boundary.

### F14 — The creation mechanism: recovery, not concurrency
The 38 duplicates were all Liverpool's 38 Premier League fixtures — the
brief was right that a truncated prune window is indifferent to key count
and cannot explain that. The creation-time forensics do:

| Batch | Events | Reading |
|---|---|---|
| 07-30 22:33:48–49 | 117 | Liverpool follow |
| 07-31 10:15:23 | 37 | first sub-batch of the PL creation |
| 07-31 10:30:55–56, 10:31:09 | 343 | rest of it |

CORRECTED 2026-07-31 (Stage 1d): there was no discrete "37-event duplicate
batch". 10:15 + 10:30 + 10:31 = **380 = a complete Premier League season
created from scratch**, and the 38 duplicated ids are spread across it —
37 landing in the 10:15:23 sub-batch and 1 in the 10:31:09 one. The
count mismatch (37 vs 38) in the original table was the tell.

The re-creation included the 38 Liverpool fixtures already in the ledger
from the night before. The ledger was therefore empty when the PL follow
ran — recovery had rebuilt it from a scan that returned nothing (F13).

So the dual-key correlation is real but not causal: the 38 are exactly the
INTERSECTION of "already physically in the calendar" and "wanted by the
next follow". Liverpool's other 79 events were not in the PL follow's
wanted set, so they were not duplicated. Ruled out along the way:
- **Double admission** — `planSync` keys `wanted` by fixture id
  (`syncPlan.ts:174`), and pre-Stage-1 the fetch was a single Firestore
  query which cannot return a document twice. Not reachable.
- **Concurrent runs** — would duplicate the whole wanted set, not one
  follow's intersection, and would not produce two clean single-second
  batches a day apart.

### F15 — FIXED in Stage 1d: a pass is bounded by the budget PLUS one op, and one op can be very slow
Measured on Android, 2026-07-31, draining a 1,656-op plan:

| Pass | opsApplied | passMs | rate |
|---|---|---|---|
| 1 | 1,281 | 108,028 ms | 11.9 ops/sec |
| 2 | 144 | **227,161 ms** | 0.6 ops/sec |

Pass 1 honoured the 108,000 ms budget to within 28 ms. Pass 2 overshot it
by 119 seconds and therefore exceeded `STALE_RUN_MS` (180 s), which is the
very condition the budget exists to avoid. The cause is structural: the
budget is checked BETWEEN ops, so a pass is bounded by `budget + one op`,
and on a degraded emulator a single native calendar write blocked for
roughly two minutes. The 60% fraction leaves 72 s of headroom, which was
not enough here.

FIXED 2026-07-31 by making the lock heartbeat-based: the running pass
refreshes `syncHeartbeatAt` in every long loop, and `STALE_RUN_MS` now
means "no heartbeat since" rather than "started before", so a slow-but-alive
pass is never taken over. A per-op timeout was explicitly NOT added —
abandoning a native calendar write leaves its commit state indeterminate,
which is how untracked events get created in the first place. The pass can
still overshoot its time budget by one slow op; that is now harmless
because overshooting no longer costs it the lock. Worth noting the emulator
runs on an 8 GB host against a 16 GB recommendation, so 0.6 ops/sec is a
pathological rather than typical rate.

---

## Found during Stage 1d/1e

### F16 — The query time-window needs one Firestore composite index, and is HELD
Verified against production 2026-07-31: `array-contains-any` on
`followKeys` combined with a `startUtc` range fails with
`FAILED_PRECONDITION — The query requires an index`. It is **one** index
for the whole query shape (`fixtures`: `followKeys` ARRAY_CONTAINS +
`startUtc` ASC), **not one per chunk** — the 30-key chunks are the same
shape with different values.

Per the Stage 1e instruction to report before writing indexes, the index
has NOT been created and the query filter is therefore NOT enabled. The
freeze rule (which is the safety-critical half) is live and needs no index;
only the read-volume saving is unrealised. Enabling the filter without the
index first would break every fetch — safely (no deletions, since a failed
fetch returns an error) but totally.

Measured saving once enabled, against live data:

| Follow set | reads/sync now | windowed | saving |
|---|---|---|---|
| 40 teams | 3,100 | 548 | 82% |
| 10 competitions | 7,112 | 3,384 | 52% |

### F17 — The scan-anomaly guard costs one extra calendar scan per sync
`runSyncInner` now scans the calendar before planning, to detect the
impossible state (empty scan, populated ledger). That is a second scan on
every sync where the ledger is non-empty — and on iOS each scan is now
four `listEvents` calls, one per window. The cost is real and was accepted
deliberately: the alternative is reusing the pre-op scan for the post-op
prune, which would report already-deleted events as orphans. Worth
revisiting if sync latency becomes a complaint.

---

## Found during Prompt 4 (source investigation, 2026-07-31)

### F18 — Four of nine boxing promoters cannot be used, for three different reasons
Investigated read-only, robots.txt first, no UA spoofing, no auth bypass.

- **Golden Boy** — `robots.txt` permits everything, but Cloudflare returns
  **HTTP 403 sitewide** to an honest client. Actively blocks automated
  access. Not a robots question; a server one.
- **MVP (Most Valuable Promotions)** — `robots.txt` names our agent
  explicitly: `User-agent: ClaudeBot` / `Disallow: /`. A stated policy, not
  a technical block; a browser can read the page. One request was made (to
  robots.txt) and nothing else.
- **DAZN** — not blocked, but categorically excluded by the owner's own
  rule. It is a BROADCASTER EPG, and it labels each boxing row with the
  actual promoter (Golden Boy, Queensberry, BOXXER, Red Owl). It is a TV
  guide filtered to carriage rights, varying by locale, interleaved with
  rallies and esports.
- **Riyadh Season** — served by `cdn.webook.com`, a third-party ticketing
  platform's Contentful gateway. The verifier reclassified it
  promoter → **aggregator**, so the owner's rule excludes it.

### F19 — ATP Tour disallows our agent; the Tennis ICS is robots-disallowed at Google
- `atptour.com/robots.txt` names ClaudeBot among nine blanket
  `Disallow: /` blocks. Not fetched beyond robots.txt.
- The TennisTV calendar the owner remembered **exists, is official and is
  current** — confirmed via Zendesk's public Help Center API on
  `support.tennistv.com` (which permits it), article "How to download the
  Tennis TV tournament calendar", updated 2025-11-05. Scope, quoted: all
  ATP Masters 1000s, 500s and 250s, the Nitto ATP Finals, Next Gen Finals
  and the United Cup.
- BUT the feed lives at `calendar.google.com`, whose robots.txt is
  `Allow: /$` / `Disallow: /` — everything except the root is disallowed.
  An ICS subscription URL is designed to be polled by calendar clients,
  which are not crawlers and do not consult robots.txt; whether a server
  fetching it every few hours is a crawler is a judgement the owner has to
  make, not one to make silently. HELD pending that decision.

### F20 — Top Rank publishes zero upcoming events, and their own site is broken
`api.toprank.com/api/admin/events/` is a clean, permissive, paginated JSON
API (53 published events). But `types[]=upcoming` returns HTTP 404 with an
empty body, and `toprank.com/events/upcoming` renders an empty page with a
visible console error on their own site. The connector would be correct and
would yield nothing. Worth building only when they fix their feed.

### F21 — queensberrypromotions.com is a parked domain
The real site is `queensberry.co.uk` (Shopify). The named domain returns a
114-byte GoDaddy parking redirect. Its JSON-LD `SportsEvent` blocks are
present but STALE — all four are Feb–Mar 2025 — so the live schedule has to
come from the page body, not the structured data that looks authoritative.

### F22 — ITF is behind an Incapsula challenge; WTA has no tournament calendar in JSON-LD
Both were reported usable by the Prompt 4 investigation. Building against
the real payloads showed otherwise:

- **ITF** — `TournamentApi/GetCalendar` returned 212 bytes to an honest
  client: an Imperva/Incapsula challenge page (`_Incapsula_Resource`,
  `noindex,nofollow`), not the JSON an earlier probe saw. Same class of
  barrier as Golden Boy's Cloudflare 403, so the same ruling applies —
  excluded, not circumvented.
- **WTA** — `/tournaments` carries exactly ONE JSON-LD `SportsEvent`, and
  it is the season: `"WTA Tour 2026"`, 1 Jan → 31 Dec. Not a calendar. The
  tournament list is HTML-only, so building it would mean the HTML parser
  the boxing ruling explicitly declined.

The lesson worth keeping: an investigation that reads a page is not a
substitute for building against the payload. Both of these looked usable
until a connector was actually pointed at them.

### F23 — Tennis coverage is ATP-only, and athletics is dominated by minor road races
- Tennis ships with ATP tournaments (78 upcoming) and nothing else. WTA
  and ITF are both unavailable per F22, so women's tennis has NO coverage
  at all. That is a product gap, not a bug, and it is visible: the browse
  list offers "ATP Tour" and only that.
- World Athletics carries ~1,250 meetings for a five-month window, the
  large majority minor road races and cross-country. Following the whole
  calendar would flood a calendar, so the followables are the SERIES
  (Diamond League, Continental Tour Gold, the indoor tour, championships,
  nationals) with the catch-all offered last and named honestly
  ("Everything on the calendar").

### F24 — PBC has exactly one upcoming card
319 sitemap URLs, 300 with a parseable date in the slug, and **one** dated
today or later. The connector is correct and the coverage is thin — which
is the argument for the review queue rather than against the connector.

---

## Found during Prompt 5 (individual appearances, 2026-08-02)

### F25 — RESOLVED in Prompt 5b: WTA draws/order-of-play now flow from the WTA's own API
usopen.org (the next slam, and the creator-class candidate) resets an
honest client's TCP stream after the request is sent — three attempts
(HTTP/2 and HTTP/1.1, genuine DigiCert USTA cert, request fully written)
produced zero bytes and no status, while a control fetch confirmed the
network was fine. Its robots.txt is therefore UNKNOWABLE to this client:
nothing to honour, nothing to circumvent. wtatennis.com permits crawling
(blanket allow) but its HTML carries no draw or schedule data — only a
live-scores JSON-LD snapshot with no startDate. The one concrete lead is
`api.wtatennis.com` (the Pulselive API the WTA site itself runs on),
which was NOT probed — using it needs an owner ruling first.
**RULED AND BUILT 2026-08-02 (Prompt 5b): api.wtatennis.com approved and
verified open (no key, no auth); tournaments + draws + order of play live
via `providers/wtaTennis.ts`. usopen.org stays untouched; atptour.com
stays excluded — ATP remains tournament-level from the ICS (see F33 for
what that asymmetry costs).**

### F26 — ufc.com has full bout data; the standing HTML-soup ruling walls it off
Every UFC event page server-renders the complete card — full
given+family names (`c-listing-fight__corner-given-name` /
`corner-family-name`), per-bout weight class, athlete-page URLs, and
prelims/main-card timestamps as `data-timestamp` attributes — at a
15-second crawl-delay with no bot challenge. But there is ZERO
structured payload: no JSON-LD, no __NEXT_DATA__, no bout data in
drupal-settings-json. Parsing it means the CSS-class HTML-soup the
boxing ruling declined, so the 141 surname-only cards (UFC-dominated)
cannot be fed from ufc.com under current rules despite the data visibly
existing. Reversing the ruling for this one host (the markup is
BEM-stable) is an owner decision. bkfc.com: robots.txt permits us but
sets `Crawl-delay: 86400` — one request per DAY — so its content shape
is unverified and a compliant connector impractical.

### F27 — World Athletics start-list/timetable payload shapes are unverified
The routes exist and join our own ids: the calendar payload the
connector already fetches carries per-meeting `hasStartlist` /
`hasResults` flags (free discovery), `/competition/calendar-results/
<id>/entry-list` is a first-class __NEXT_DATA__ route on the same id our
`wa-<id>` fixtures embed, and championship timetable pages carry
`eventTimetable` plus real UTC datetimes and a `venueTimezone` the
calendar lacks. But every meeting reachable during the probe had
hasStartlist:false and the one in-window championship's timetable was
unpublished — the POPULATED per-athlete/per-slot shapes were never
captured, and F22's lesson is that building against an unseen payload is
how connectors get invented rather than written. Needs one 2-request
probe in the days before a hasStartlist:true meeting; then the athletics
consumer can be wired to the appearance model that already handles it.
**UPDATED 2026-08-02 (Prompt 5b probe, 10 requests): 0 of 593 meetings in
the 2026-08-02→09-15 window carry hasStartlist:true. The flag is
TRANSIENT (the completed World Indoor Championships shows false
post-event while hasResults is true) and appears reserved for World
Athletics Series championships — Diamond League legs and national champs
never show it, even with results present. The entry-list SURFACE was
captured from the World Indoors: day-paged pageProps, 28 disciplines, a
first-class `startList: null` slot beside `results` on every race, and a
verbatim competitor shape (id, name "Jordan ANTHONY", urlSlug,
birthDate) — and NO per-discipline times anywhere on that surface, so
even a built entries layer stays date_only. The populated startList row
shape remains unseen. Per the owner's Prompt 5b ruling: stays NOT
IMPLEMENTED until a WA Series meeting's live week supplies real data.**

### F28 — PARTIALLY CLOSED 2026-08-03: cross-source combat appearances would not deduplicate
`isSameFixture` requires the same competition string; a PBC bout
appearance (`competition: 'Premier Boxing Champions'`) and a
review-queue bout for the same real fight (`competition: <promoter>`)
would not merge, so an athlete follower could get two events if both
sources ever covered one card. Today the overlap is empty by
construction (PBC cards are not submitted to review), so this is
recorded rather than engineered around. **OBSERVED ON-DEVICE
2026-08-03 in a wider variant: a "Major fight cards" (TSDB) follow
plus fighter follows put the SAME fight in the carousel twice —
the TSDB card ("Time TBC") beside the PBC bout ("23:00") — and both
in the calendar. CLOSED at the CLIENT: dedupeSameBout
(fixtures/domain/sameBout.ts) collapses person-sport fixtures whose
normalised participant pair matches within 36h to the best-informed
doc (exact > nominal > date_only, appearance over card, pinned never
dropped), applied before both the planner and the snapshot — verified
on-device, carousel and sqlite calendar both converged to one entry.
The SERVER-side merge remains unbuilt: relaxing the same-competition
guard for person sports, and a parent-vs-appearance merge, both need
their own brief.**

### F29 — Stale athlete keys persist on past cards outside re-poll windows
Prompt 5 moves athlete followKeys from cards to appearances as each
slice re-polls, but past PBC cards are never re-fetched (the connector's
7-day lookback) and dead-season TSDB cards are never re-ingested — 78
cards carried athlete keys at migration time, 10 of them upcoming. The
stale keys are harmless: the planner's horizon gate never creates events
for past-start fixtures, frozen ledger entries are never deleted, and
the cards age out of the 510-hour query lookback on their own. Noted so
nobody reads the residue as the migration having failed.

### F30 — PARTIALLY CLOSED in Prompt 6: appearance retirement's chosen misses
Retirement (cancel bouts the fresh yield proves gone) is deliberately
evidence-guarded: a parent retires old appearances only when its fresh
yield carries ≥1 appearance for that parent. Three gaps follow. (a) A
withdrawal that empties a one-bout card is never caught — the empty
yield is indistinguishable from a shape failure, and the guard chooses
the safe reading. (b) Only parents inside the current fetch window can
retire (PBC: now−7d forward, ≤12 cards; TSDB: the derivation window) —
a bout scratched from a card that has left the window keeps its doc.
(c) Cross-source: a PBC bout and a review-queue bout for the same real
fight never merge (different competition strings — recorded at F28), so
retirement on one source cannot touch the other's doc. The systemic
answer to all three remains Stage 4's reaper. Also noted in passing: a
decideReview decision of 'cancelled' on a PREVIOUSLY-CONFIRMED item
publishes nothing and leaves the earlier card fixture scheduled —
pre-existing, not introduced by Prompt 5. **PROMPT 6: the reaper now
exists (reaper.ts, ingest-integrated, dry-run until REAPER_ENABLED) and
is the systemic answer for PARENT fixtures. It never judges appearances
by absence-from-yield (that stays retirement's alone — two actors on
one doc would fight), but a reaped parent CASCADES: its future
appearances are cancelled with it, because a withdrawn card never
yields again and retirement could otherwise never fire for its bouts.
Gap (c) and the one-bout-card case remain, still bounded by the guard's
safe reading. The decideReview cancelled-after-confirmed miss also
remains.**

### F31 — isFollowableName is a word-count proxy, and compound surnames defeat it
"Machado Garry" is one fighter's compound surname in a UFC title, but
two words pass `isFollowableName` and mint `athlete-machado-garry` —
a followable key built from surname-only information, now surfaced in
search rather than latent on card docs. Fixing it needs name knowledge
(the fighter-directory work the brief explicitly kept out of this
stage); until then the conservatism rule has this known hole, inherited
from Prompt 4 unchanged.

### F32 — One-time rewrites after reinstall and the endUtc compare
entryMatches now compares endUtc, so ledger entries whose stored end
differs from the freshly derived one produce one update op each: the
172 widening multi-day banners (intended), any fixture whose duration
data changed since its event was created (intended), and — after an iOS
reinstall — recovered all-day entries whose ends read back in platform
conventions (unintended but convergent: one rewrite, then the ledger
holds canonical values). The recovery all-day read-back is the existing
open MED item from the timezone audit; this widens its one-time cost,
not its class. The athleteDirectory's `nextStartUtc` is also
last-write-wins per poll: a multi-promoter athlete's entry reflects
whichever source polled last — ordering noise in search, nothing more.


### F33 — Joint ATP/WTA events are two parents, and men's tennis has no appearances
The WTA API carries first-class tournament records for joint events the
Tennis TV ICS already serves (US Open, Cincinnati, Toronto). Their
parents cannot merge: the ICS fixture (`tennis-<uid>`) and the WTA
fixture (`wta-<id>-<year>`) share no participants, so `isSameFixture`'s
empty-participants guard keeps them apart — a user following BOTH tours
gets two tournament events for a joint event. And the asymmetry runs
deeper: WTA players get draws and order of play, while ATP players get
nothing (the ICS is fields-only by ruling, and the ATP entries inside
the WTA order-of-play feed are skeletons with no player detail) — men's
tennis remains tournament-level only, with atptour.com permanently
excluded. Both are structural facts of the approved sources, not bugs.


### F34 — Two players with one rendered name collapse into one appearance
The whole athlete layer keys identity by normalised display name —
`athleteKey(name)`, appearance ids, the WTA draw↔OOP join — so two
distinct players whose romanised names render identically (a realistic
event in a 128-player qualifying draw) become ONE appearance doc: one
player's slot wins, the other's schedule is never represented, and a
follower of the shared `athlete-<slug>` key gets whichever survived.
Verified by probe against the WTA pipeline with two synthetic players
sharing a name. The WTA feeds carry numeric player ids in BOTH the draw
(PlayerIDA/B) and the order of play (Player.id) that would disambiguate
— but the followable key itself is name-built, so an internal id fix
alone still merges the two for followers. This is the same class as the
141 surname-only cards: it needs the canonical athlete identity the
owner ruled must be done once, properly (Prompt 5b, ruling 2), and the
WTA ids are recorded here as an input to that work, not papered over
per-connector now.

---

## Found during Prompt 8 (canonical athlete identity, 2026-08-03)

### F31 — CLOSED in Prompt 8: the word-count gate is gone
Directory membership is the followability test now. Title-parsed names
resolve against the canonical directory (confident only when the full
name is unique in the sport) and may NEVER create a directory entry —
"Machado Garry" parses, drafts, and dies at resolution with the drop
counted, because he is in no roster and a parsed title is not allowed
to invent an identity. The cost is honest: a full-named bout between
two unrated fighters from a TSDB title is display-only until a
structured source (PBC performer nodes, the review queue) vouches for
them. Pinned in appearances.test.ts.

### F34 — CLOSED 2026-08-03 (re-verified on owner instruction; no suffix mechanism built)
Re-tested against the CURRENT pipeline (Prompt 9b state) with the
original probe shape — two players, one rendered name, distinct WTA
ids: the bug AS FILED no longer reproduces. The players stay two
drafts with their own ids; the name-keyed slot join is SUPPRESSED for
the collided name, so neither player can receive the other's match,
time or opponent; resolution stores one doc carrying ONLY the first
player's canonical key, with nameCollisions counted and detailed in
the run record. The silent misattribution — another player's schedule
in a follower's calendar — is structurally gone. RESIDUAL, accepted:
in the collision case the second player has NO appearance doc for
that tournament — a loud, counted coverage gap with zero live
occurrences (0 collisions across every real draw polled to date). The
collision-suffix id extension is NOT built, per the owner's ruling.
Original history below.

### F34 (history) — DETECTION CLOSED in Prompt 8; representation was gated on a ruling
Two distinct provider ids rendering to one name inside one parent no
longer silently collapse: the WTA pipeline carries PlayerIDA/B and
Player.id end to end, resolution keys players by id, and the doc-id
collision (appearance ids are name-built) REFUSES the second ref —
counted as `nameCollisions` in the appearance slice's run record and
error-logged for Cloud Error Reporting. The surviving doc carries only
the surviving player's key, so the other player's follower gets nothing
rather than someone else's schedule — and because the WTA slot join is
name-keyed, a collided name gets NO confirmed slot at all (both players
stay at the provisional parent window): the review round proved the
surviving doc could otherwise carry the REFUSED player's match, time
and opponent. REPRESENTING both players needs
the appearance id scheme to gain an identity-aware component, which the
brief explicitly gates on an owner ruling — asked in the Prompt 8
report. Zero live collisions exist in production today.

### F35 — WBC refuses; WBA and WBO publish ratings only as HTML
Probed individually 2026-08-03, robots.txt first. wbcboxing.com names
`ClaudeBot` with `Disallow: /` — the atptour/MVP class, permanently
excluded. www.wbaboxing.com and wboboxing.com permit crawling but their
ratings/champions pages are WordPress HTML tables/lists with only
Organization/WebPage JSON-LD, and both lock their WP REST APIs
(`rest_login_required` / `rest_forbidden`, HTTP 401). HTML-soup —
declined under the standing rule, not built. The boxing roster is fed
by the IBF's own JSON API instead (see DECISIONS), which also publishes
the WBA/WBC/WBO champions per class as IBF's own fields — so all four
bodies' CHAMPIONS are covered; the missing residue is WBA/WBO/WBC's
*rated contenders* (15 per class per body), reachable only via HTML.

### F36 — World Athletics world rankings are NOT on the __NEXT_DATA__ surface
The brief's premise ("same __NEXT_DATA__ surface as the calendar") does
not hold for rankings: /world-rankings/<event>/<sex> is the LEGACY
RequireJS/Knockout app — the ranking table is server-rendered HTML rows
(plain URL; adding query params returns an empty shell), with athlete
profile links carrying numeric ids. The Next.js route manifest
(extracted from the athlete-profile buildId) confirms no rankings route
exists. Athlete PROFILE pages ARE Next.js (`competitor._id`,
worldRankings, personalBests in pageProps), but profiles cannot
enumerate a roster. So an athletics roster needs either an owner ruling
that a semantic HTML `<table>` with id-carrying hrefs is acceptable
(the ufc.com F26 precedent says such rulings go to the owner), or a
structured surface not yet found. Athletics athlete-following stays
NOT IMPLEMENTED, said in its coverageNote; the identity frame is ready
(source 'wa', numeric profile ids) the day either unblocks. F27's
entry-list surface remains the fixture-side supplement when it finally
populates.

### F37 — Golf roster postures, recorded for the follow-on stage
pgatour.com: robots permits (targeted query-param disallows only, no
named agents) — and the site is Next.js, so a structured surface is
plausible; NOT probed further this stage. lpga.com: blanket allow.
owgr.com: `Disallow: /ranking/`, `/players/`, `/en/Ranking/`,
`/en/Players/`, `/en/Events/` — the ranking surface itself is refused;
OWGR is out. dpworldtour.com: robots.txt request timed out (connection
timeout to the host, twice) — unverifiable posture, treat as
unavailable (the usopen.org class: nothing to honour, nothing to
circumvent). Golf build deferred to the follow-on per the brief's
scope-split provision.

### F38 — ufc.com's roster surfaces are as structured-data-free as its event pages
/rankings served 271KB with ZERO JSON-LD, no __NEXT_DATA__, and a 3KB
drupalSettings carrying no fighter data; fighters exist only in Drupal
views HTML (`view-athlete-rankings` blocks). No internal JSON/API
routes are referenced by the page. F26's verdict extends to the roster
surface: nothing structured exists on ufc.com to rule on, so MMA
athlete-following stays unsupported with an honest coverageNote, and
the 141 surname-only cards remain unresolvable — acceptable per the
brief ("do not reach for an aggregator to close it").

### F39 — FIXED same-day: a pre-RNFB binary RedBoxes on follow despite the guarded requires
Surfaced on-device 2026-08-03: tapping Follow for a boxer raised
"Uncaught Error: Native module NativeRNFBTurboApp is not registered"
from backgroundSync.ts's require — which IS inside try/catch, as is
deviceRegistry's. On the new architecture that guard is insufficient:
RNFB's TurboModule lookup failure is REPORTED THROUGH THE NATIVE
EXCEPTION PIPELINE as an uncaught error (a full dev LogBox) even
though the JS catch fires and the app continues. Trigger timing —
follow-tap rather than launch — is the lazy import of deviceRegistry
in followActions. FIXED: rnfbPresence.ts asks first with the
non-throwing lookup (TurboModuleRegistry.get + NativeModules) and both
sites skip the require entirely on a pre-RNFB binary, degrading to the
honest token-less registration as always promised. Device-verified:
unfollow + follow both clean post-fix. The BINARY note stands: any
install predating Prompt 6's prebuild lacks the RNFB pods, so iOS push
still needs `npx expo prebuild -p ios --clean` + a rebuild — until
then the device registers token-less by design.
