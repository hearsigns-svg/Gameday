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

### F11 — BLOCKING: the prune invariant never fires; 38 orphaned events survive every sync
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

### F12 — A mid-burst kill could not be staged on iOS; the write phase is too short
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
