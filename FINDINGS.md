# FINDINGS

Defects and hazards noticed while doing staged remediation work, recorded
rather than fixed so that no stage widens beyond its brief. Append-only.
Each entry names where it was found and what it would cost to leave.

---

## From the coverage audit (2026-07-31), deferred by the remediation brief

### F1 — iOS silent push is skipped entirely
`functions/src/sweep.ts:164-173`. Only FCM registration tokens are sendable
by the Admin SDK; iOS devices register raw APNs tokens
(`deviceRegistry.ts:42` records `tokenType: 'apns'`) and are filtered out of
the fan-out. Push propagation is therefore **Android-only**. Explicitly out
of scope for this remediation (it is a propagation problem, not a coverage
one), but it is real and severe: an iOS user's calendar only corrects itself
on foreground sync or background refresh.

### F2 — `venueTz` is the literal string `'UTC'` on 10,395 of 10,483 docs
Only the NHL adapter supplies a real IANA zone (`nhl.ts:74`). Every other
adapter hardcodes `'UTC'`. The field is vestigial: nothing reads it. NHL's
`venueTimezone` and TheSportsDB's `strTimeLocal` are both free and would
allow "2:00 AM (7:00 PM in Los Angeles)". Stage 5 notes it; nothing fixes it.

### F3 — F1 fixture ids bake in the round number
`functions/src/providers/f1.ts:53` — `f1-${season}-r${race.round}-${slug}`.
When Jolpica inserted a new round 16 into the 2026 calendar, Singapore
shifted 16→17 and the US GP 17→18; because ingest never deletes, four
documents survive under their old ids still carrying the old race names.
The id scheme is the root cause and a circuit ID or a stable race slug
would fix it, but changing it rewrites every user's ledger key, so it is
deliberately NOT part of Stage 4 (which only reaps the orphans).

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

### F10 — `MAX_PATHS_PER_SWEEP = 250` is a coverage ceiling across ALL users
`functions/src/sweep.ts:37`. The sweep unions poll paths across every
registered device and then takes the first 250. Beyond that, paths are
dropped for that run — recorded as `truncated: true` in the `sweeps` doc
and nowhere else. With a growing user base the union grows, so some
followed competitions would simply stop being refreshed, arbitrarily and
invisibly. The `sourceRuns`/`coverageReport` work from Stage 0 would now
make the consequence visible (those slices stop having runs), but the
truncation itself is unaddressed. Relevant to Stage 7's catalogue design,
which changes what the sweep is driven by.

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
