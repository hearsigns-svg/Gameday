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
