import { createHash, timingSafeEqual } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { canonicalisePollPath, sweepAll } from './sweep';
import { reconcileFixtures } from './reconcile';
import { augmentFollowKeys, loadTeamAliases } from './aliases';
import {
  appearanceSliceKey,
  deriveBoutAppearances,
  retiredAppearanceIds,
} from './appearances';
import { normaliseName } from './identity';
import {
  athleteKey,
  enrichBoutParticipants,
  isFollowableName,
  namesPeople,
} from './participants';
import { searchAthletes, searchTeams } from './search';
import { TSDB_TEAM_LEAGUES } from './tsdbTeamLeagues';
import { bestSeason, seasonsToTry } from './season';
import { diffFixtures } from './diff';
import { Fixture, FixtureStatus } from './fixture';
import { loadCoverage } from './coverage';
import { loadFdSeasons } from './fdSeasons';
import {
  listReviewItems,
  ReviewItem,
  reviewItemToAppearances,
  reviewItemToFixture,
  ReviewStatus,
  submitReviewItem,
  validateSubmission,
} from './reviewQueue';
import {
  countsFrom,
  EMPTY_COUNTS,
  httpStatusFromError,
  isZeroYield,
  recordSourceRun,
  RunContext,
  RunCounts,
  RunReason,
  RunTrigger,
  TRIGGER_HEADER,
  triggerOf,
} from './sourceRuns';
import {
  fetchLeagueSeasonFixtures,
  fetchTeamSeasonFixtures,
} from './providers/apiSports';
import {
  fetchFdCompetitionSeasonFixtures,
  fetchFdCompetitionTeams,
  fetchFdTeamSeasonFixtures,
  FD_FREE_COMPETITIONS,
} from './providers/fdorg';
import { fetchTsdbLeagueSeasonFixtures, fetchTsdbLeagueTeams } from './providers/tsdb';
import { fetchMlbTeamSeasonFixtures } from './providers/mlb';
import { fetchNhlTeamSeasonFixtures } from './providers/nhl';
import { fetchF1SeasonFixtures } from './providers/f1';
import { fetchPbcCards } from './providers/pbc';
import { fetchTennisTournaments } from './providers/tennisIcs';
import { fetchWorldAthletics } from './providers/worldAthletics';
import { fetchWtaTennis } from './providers/wtaTennis';
import {
  listFdSoccerTeams,
  listMlbTeams,
  listNhlTeams,
  listSoccerLeagues,
  listTsdbTeams,
} from './directory';

initializeApp();
const db = getFirestore();

// Constant-time compare over equal-length digests — avoids leaking key
// length or prefix through response timing.
function timingSafeEqualStr(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

// What one ingest did, in the terms the coverage report needs. `fetched`
// is the provider's raw row count and belongs to the caller, which is the
// only layer that has seen the wire.
export type IngestCounts = Omit<RunCounts, 'fetched' | 'futureDated'>;

// Shared ingest: diff fresh fixtures against the cache slice for one
// followable key, then upsert fixtures + append change records.
async function ingest(
  rawIncoming: Fixture[],
  followKey: string,
): Promise<{ fixtures: number; changes: number; counts: IngestCounts }> {
  // Combat cards arrive as a title with no participants; parse the
  // fighters out and give them athlete follow keys before anything else
  // looks at the fixture.
  const withPeople = enrichBoutParticipants(rawIncoming);
  // Stamp every provider's key for each club onto the fixture, so a
  // team followed via one provider still matches fixtures supplied by
  // another (league from football-data, cups from TSDB).
  //
  // No longer gated to soccer: the gate was there because only the soccer
  // directories were populated, but the alias table now covers every
  // league with a team directory, and a cross-provider club is a
  // cross-provider club whatever the sport.
  const incoming = augmentFollowKeys(withPeople, await loadTeamAliases(db));
  const existingSnap = await db
    .collection('fixtures')
    .where('followKeys', 'array-contains', followKey)
    .get();
  const existing = new Map<string, Fixture>(
    existingSnap.docs.map((d) => [d.id, d.data() as Fixture]),
  );
  const changes = diffFixtures(existing, incoming);
  const at = new Date().toISOString();
  const byId = new Map(incoming.map((f) => [f.id, f]));
  // Firestore batches cap at 500 writes — chunk (fixtures + changes can
  // exceed it on a first league-wide poll).
  let batch = db.batch();
  let pending = 0;
  const flush = async () => {
    if (pending > 0) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  };
  // Write only what actually changed: an unchanged fixture costs a read
  // we already did, not a write. (updatedAt is excluded from the compare
  // — it changes on every poll by construction.)
  const sameFixture = (a: Fixture, b: Fixture): boolean => {
    const strip = ({ updatedAt, firstSeenAt, ...rest }: Fixture) => rest;
    return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
  };
  let stored = 0;
  let unchanged = 0;
  for (const f of incoming) {
    const prev = existing.get(f.id);
    if (prev && sameFixture(prev, f)) {
      unchanged++;
      continue;
    }
    // firstSeenAt decides which id survives a cross-source merge — it
    // must never be reset by a re-poll.
    const record: Fixture = { ...f, firstSeenAt: prev?.firstSeenAt ?? at };
    batch.set(db.collection('fixtures').doc(f.id), record);
    stored++;
    if (++pending >= 450) await flush();
  }
  for (const c of changes) {
    // followKeys ride on the change record so the sweep can fan pushes
    // out to affected devices without re-reading fixtures.
    const followKeys = byId.get(c.fixtureId)?.followKeys ?? [];
    batch.set(db.collection('fixtureChanges').doc(), { ...c, at, followKeys });
    if (++pending >= 450) await flush();
  }
  await flush();
  return {
    fixtures: incoming.length,
    changes: changes.length,
    // `rejected` is 0 by construction: there is no validation stage yet
    // (Stage 6 adds one). The counter ships now so the identity
    // parsed === stored + unchanged + rejected is pinned from day one.
    counts: { parsed: incoming.length, rejected: 0, stored, unchanged },
  };
}

// The athlete directory search reads: one doc per followable athlete,
// written through whenever a poll ingests appearances. `nextStartUtc` is
// the soonest FUTURE appearance seen for the athlete this poll — search
// filters on it, so an athlete with nothing upcoming stops being
// offered rather than becoming a follow that matches nothing.
async function upsertAthleteDirectory(
  appearances: Fixture[],
  // Review-sourced appearances have no poll route — they refresh only
  // when an operator decides — so the directory entry carries no path.
  pollPath: string | null,
): Promise<void> {
  const at = new Date().toISOString();
  const byKey = new Map<
    string,
    { name: string; sportKey: string; nextStartUtc: string }
  >();
  for (const f of appearances) {
    if (f.startUtc < at) continue;
    // A cancelled bout is not an upcoming appearance — search must not
    // offer an athlete whose follow would deliver nothing.
    if (f.status === 'cancelled' || f.status === 'postponed') continue;
    for (const name of f.athletes ?? []) {
      if (!isFollowableName(name)) continue;
      const key = athleteKey(name);
      const prev = byKey.get(key);
      if (!prev || f.startUtc < prev.nextStartUtc) {
        byKey.set(key, { name, sportKey: f.sport, nextStartUtc: f.startUtc });
      }
    }
  }
  if (byKey.size === 0) return;
  // Only a sweep-valid path may reach the directory: a search hit's
  // pollPath becomes a device-registered route, and the sweep silently
  // DROPS routes the allowlist rejects (a season-less manual poll echoes
  // `season=` into runCtx.pollPath, which the allowlist refuses).
  const canonicalPath = pollPath ? canonicalisePollPath(pollPath) : null;
  let batch = db.batch();
  let pending = 0;
  for (const [key, v] of byKey) {
    batch.set(
      db.collection('athleteDirectory').doc(key),
      {
        key,
        name: v.name,
        sportKey: v.sportKey,
        searchName: normaliseName(v.name),
        ...(canonicalPath ? { pollPath: canonicalPath } : {}),
        nextStartUtc: v.nextStartUtc,
        updatedAt: at,
      },
      { merge: true },
    );
    if (++pending >= 450) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending > 0) await batch.commit();
}

// Cancel previously-stored appearances that this yield proves gone
// (opponent replaced, bout scratched) — see retiredAppearanceIds for the
// evidence guard that keeps a provider shape failure from cancelling
// real bouts. Cancellation, not deletion: 'cancelled' is the status the
// pipeline already propagates to followers as event removal, and the
// change records written here are what fan the push out to them.
async function retireAppearances(
  sliceKey: string,
  incoming: Fixture[],
): Promise<number> {
  const snap = await db
    .collection('fixtures')
    .where('followKeys', 'array-contains', sliceKey)
    .get();
  const existing = snap.docs.map((d) => d.data() as Fixture);
  const at = new Date().toISOString();
  const ids = retiredAppearanceIds(existing, incoming, at);
  if (ids.length === 0) return 0;
  const byId = new Map(existing.map((f) => [f.id, f]));
  let batch = db.batch();
  let pending = 0;
  const flush = async () => {
    if (pending > 0) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  };
  for (const id of ids) {
    const prev = byId.get(id)!;
    batch.update(db.collection('fixtures').doc(id), {
      status: 'cancelled',
      updatedAt: at,
    });
    if (++pending >= 450) await flush();
    batch.set(db.collection('fixtureChanges').doc(), {
      kind: 'status_changed',
      fixtureId: id,
      prevStatus: prev.status,
      newStatus: 'cancelled',
      at,
      followKeys: prev.followKeys ?? [],
    });
    if (++pending >= 450) await flush();
  }
  await flush();
  return ids.length;
}

// One connector invocation, instrumented. Every exit — success, provider
// failure, or an honest empty season — writes exactly one sourceRuns doc,
// so "it ran and found nothing" and "it never ran" stop looking alike.
//
// Returns the HTTP shape rather than writing it, to keep express types out
// of the helper.
interface PollWork {
  rawCount: number;
  fixtures: Fixture[];
  followKey: string;
  seasonResolved: string | null;
  // Set when a run legitimately yielded nothing: no live season, or the
  // sweep never got to it. Distinct from an error, which means a provider
  // failed us.
  reason?: RunReason;
  // Appearance docs riding the same connector invocation, ingested under
  // their own slice key so (a) promoter/series followers are never
  // flooded with per-bout events, and (b) coverage reports the
  // appearance funnel separately from the card funnel. One extra
  // sourceRuns doc per invocation that carries appearances.
  appearances?: { followKey: string; rawCount: number; fixtures: Fixture[] };
  body?: Record<string, unknown>; // extra response fields
}

async function servePoll(
  trigger: RunTrigger,
  ctx: Omit<RunContext, 'trigger'>,
  work: (trace: { seasonsTried: string[] }) => Promise<PollWork>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const startedAt = new Date().toISOString();
  const runCtx: RunContext = { ...ctx, trigger };
  // Captured rather than returned so a throw mid-way through a multi-season
  // resolution still records which seasons were actually tried.
  const trace = { seasonsTried: [] as string[] };
  try {
    const w = await work(trace);
    const ingested = await ingest(w.fixtures, w.followKey);
    const counts = countsFrom(
      { fetched: w.rawCount, ...ingested.counts },
      w.fixtures,
      startedAt,
    );
    await recordSourceRun(
      runCtx,
      {
        httpStatus: 200,
        seasonResolved: w.seasonResolved,
        seasonsTried: trace.seasonsTried,
        counts,
        error: null,
        ...(w.reason ? { reason: w.reason } : {}),
      },
      startedAt,
    );
    // Appearances are a SECOND slice of the same invocation: their own
    // ingest diff, their own run record, retirement of bouts the fresh
    // yield proves gone, and a write-through to the athlete directory
    // that search reads. The record is written EVEN ON ZERO YIELD —
    // "ran and parsed nothing" going unrecorded is exactly how the PBC
    // performer array could rot away invisibly (fetched N, parsed 0 is
    // the funnel saying so). A failure here is recorded against the
    // APPEARANCE slice — the card slice genuinely succeeded and its
    // record already says so — and fails the invocation loudly so the
    // sweep retries it.
    let appearanceBody: Record<string, unknown> = {};
    if (w.appearances) {
      const a = w.appearances;
      try {
        const aIngested = await ingest(a.fixtures, a.followKey);
        const aCounts = countsFrom(
          { fetched: a.rawCount, ...aIngested.counts },
          a.fixtures,
          startedAt,
        );
        await recordSourceRun(
          { ...runCtx, competitionId: a.followKey },
          {
            httpStatus: 200,
            seasonResolved: w.seasonResolved,
            seasonsTried: trace.seasonsTried,
            counts: aCounts,
            error: null,
          },
          startedAt,
        );
        const retired = await retireAppearances(a.followKey, a.fixtures);
        appearanceBody = {
          appearances: aIngested.fixtures,
          appearanceChanges: aIngested.changes,
          appearanceRetired: retired,
        };
      } catch (e) {
        await recordSourceRun(
          { ...runCtx, competitionId: a.followKey },
          {
            httpStatus: httpStatusFromError(e),
            seasonResolved: w.seasonResolved,
            seasonsTried: trace.seasonsTried,
            counts: EMPTY_COUNTS,
            error: String(e),
          },
          startedAt,
        );
        return { status: 502, body: { error: `appearances: ${String(e)}` } };
      }
      // The directory is a SEARCH cache, not fixture truth: its failure
      // is logged loudly and surfaced, never allowed to fail a poll
      // whose fixtures are already safely stored — and never allowed to
      // double-record the slice it follows.
      try {
        await upsertAthleteDirectory(a.fixtures, runCtx.pollPath);
      } catch (e) {
        console.error(`athleteDirectory upsert failed for ${a.followKey}:`, e);
        appearanceBody = { ...appearanceBody, athleteDirectoryError: String(e) };
      }
    }
    return {
      status: 200,
      body: {
        fixtures: ingested.fixtures,
        changes: ingested.changes,
        counts,
        zeroYield: isZeroYield(counts),
        ...appearanceBody,
        ...(w.body ?? {}),
      },
    };
  } catch (e) {
    await recordSourceRun(
      runCtx,
      {
        httpStatus: httpStatusFromError(e),
        seasonResolved: null,
        seasonsTried: trace.seasonsTried,
        counts: EMPTY_COUNTS,
        error: String(e),
      },
      startedAt,
    );
    return { status: 502, body: { error: String(e) } };
  }
}

function requireKey(): string {
  const apiKey = process.env.APISPORTS_KEY;
  if (!apiKey) throw new Error('APISPORTS_KEY not configured');
  return apiKey;
}

// Slice/M2: HTTP-triggered polls. The production shape is a Scheduler-
// driven sweep over all followed followables (M6); the adapter → diff →
// cache pipeline is identical.
export const pollTeam = onRequest(async (req, res) => {
  const teamId = Number(req.query.teamId);
  const season = Number(req.query.season);
  if (!Number.isInteger(teamId) || !Number.isInteger(season)) {
    res.status(400).json({ error: 'teamId and season are required' });
    return;
  }
  const followKey = `apisports-team-${teamId}`;
  const out = await servePoll(
    triggerOf(req.get(TRIGGER_HEADER)),
    {
      source: 'apisports',
      sport: 'soccer',
      competitionId: followKey,
      pollPath: `pollTeam?teamId=${teamId}&season=${season}`,
      seasonRequested: String(season),
    },
    async (trace) => {
      trace.seasonsTried.push(String(season));
      const r = await fetchTeamSeasonFixtures(requireKey(), teamId, season);
      return { ...r, followKey, seasonResolved: String(season) };
    },
  );
  res.status(out.status).json(out.body);
});

export const pollLeague = onRequest(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  const season = Number(req.query.season);
  if (!Number.isInteger(leagueId) || !Number.isInteger(season)) {
    res.status(400).json({ error: 'leagueId and season are required' });
    return;
  }
  const followKey = `apisports-league-${leagueId}`;
  const out = await servePoll(
    triggerOf(req.get(TRIGGER_HEADER)),
    {
      source: 'apisports',
      sport: 'soccer',
      competitionId: followKey,
      pollPath: `pollLeague?leagueId=${leagueId}&season=${season}`,
      seasonRequested: String(season),
    },
    async (trace) => {
      trace.seasonsTried.push(String(season));
      const r = await fetchLeagueSeasonFixtures(requireKey(), leagueId, season);
      return { ...r, followKey, seasonResolved: String(season) };
    },
  );
  res.status(out.status).json(out.body);
});

export const listLeagues = onRequest(async (_req, res) => {
  try {
    const seasons = await loadFdSeasons(db, requireFdKey());
    res.json({ leagues: listSoccerLeagues(seasons) });
  } catch (e) {
    // An empty league list would read as "soccer has no competitions".
    // Fail loudly instead so the client shows an error it can retry.
    res.status(502).json({ error: String(e) });
  }
});

// Federated search across everything followable (cached directories +
// live TSDB filtered to served leagues, plus the athlete directory the
// appearance ingest maintains).
export const searchEntities = onRequest(async (req, res) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) {
      res.json({ teams: [], athletes: [] });
      return;
    }
    const store = getFirestore();
    res.json({
      teams: await searchTeams(store, requireTsdbKey(), q),
      athletes: await searchAthletes(store, q),
    });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

export const listTeams = onRequest(async (req, res) => {
  try {
    const sport = String(req.query.sport ?? 'soccer');
    // Generic TSDB team-league branch: any league in the shared table
    // serves a team directory — rugby, WNBA, KHL, NPB, internationals —
    // the same way NBA/NFL/IPL always did (verified live: every entry
    // returns a full badge-complete team list).
    const tsdbLeague = TSDB_TEAM_LEAGUES[String(req.query.leagueId ?? '')];
    if (tsdbLeague) {
      res.json({
        teams: await listTsdbTeams(
          requireTsdbKey(),
          tsdbLeague.tsdbName,
          tsdbLeague.cacheKey,
        ),
      });
      return;
    }
    if (sport === 'baseball') {
      const season = Number(req.query.season ?? new Date().getFullYear());
      res.json({ teams: await listMlbTeams(season, optionalTsdbKey()) });
      return;
    }
    if (sport === 'ice-hockey') {
      res.json({ teams: await listNhlTeams(optionalTsdbKey()) });
      return;
    }
    if (sport === 'basketball') {
      res.json({
        teams: await listTsdbTeams(requireTsdbKey(), 'NBA', 'basketball-nba'),
      });
      return;
    }
    if (sport === 'nfl') {
      res.json({
        teams: await listTsdbTeams(requireTsdbKey(), 'NFL', 'nfl-nfl'),
      });
      return;
    }
    if (sport === 'cricket') {
      res.json({
        teams: await listTsdbTeams(
          requireTsdbKey(),
          'Indian Premier League',
          'cricket-ipl',
        ),
      });
      return;
    }
    // Soccer has two directory sources. A NUMERIC leagueId is a
    // TheSportsDB league (League One, League Two, the Scottish
    // Premiership — the ones football-data's free tier cannot reach);
    // anything else is a football-data competition code (PL, CL, …).
    const rawId = String(req.query.leagueId ?? '');
    if (/^\d{3,6}$/.test(rawId)) {
      const league = TSDB_TEAM_LEAGUES[rawId];
      if (!league) {
        res.status(404).json({ error: `no team directory for ${rawId}` });
        return;
      }
      res.json({
        teams: await listTsdbTeams(
          requireTsdbKey(),
          league.tsdbName,
          league.cacheKey,
        ),
      });
      return;
    }
    const code = rawId;
    if (!/^[A-Z0-9]{2,4}$/.test(code)) {
      res.status(400).json({ error: 'leagueId (competition code) is required' });
      return;
    }
    const seasons = await loadFdSeasons(db, requireFdKey());
    const season = seasons.get(code)?.seasonYear;
    if (season === undefined) {
      res.status(404).json({ error: `no current season for ${code}` });
      return;
    }
    res.json({ teams: await listFdSoccerTeams(requireFdKey(), code, season) });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// Badge enrichment is best-effort — a missing TSDB key must not take
// the official-team directory down with it.
function optionalTsdbKey(): string | undefined {
  return process.env.TSDB_KEY || undefined;
}

function requireFdKey(): string {
  const apiKey = process.env.FOOTBALLDATA_KEY;
  if (!apiKey) throw new Error('FOOTBALLDATA_KEY not configured');
  return apiKey;
}

export const pollFdTeam = onRequest(async (req, res) => {
  const teamId = Number(req.query.teamId);
  const season = Number(req.query.season);
  if (!Number.isInteger(teamId) || !Number.isInteger(season)) {
    res.status(400).json({ error: 'teamId and season are required' });
    return;
  }
  const followKey = `fdorg-team-${teamId}`;
  const out = await servePoll(
    triggerOf(req.get(TRIGGER_HEADER)),
    {
      source: 'fdorg',
      sport: 'soccer',
      competitionId: followKey,
      pollPath: `pollFdTeam?teamId=${teamId}&season=${season}`,
      seasonRequested: String(season),
    },
    async (trace) => {
      // Verified live: /teams/{id}/matches with NO season returns the
      // team's current season across every competition the plan can see.
      // A team spans competitions with different seasons, so there is no
      // single correct value to pass — omitting it is the correct call.
      trace.seasonsTried.push('current');
      const r = await fetchFdTeamSeasonFixtures(requireFdKey(), teamId);
      return { ...r, followKey, seasonResolved: 'current' };
    },
  );
  res.status(out.status).json(out.body);
});

export const pollFdCompetition = onRequest(async (req, res) => {
  const code = String(req.query.code ?? '');
  const season = Number(req.query.season);
  if (!/^[A-Z0-9]{2,4}$/.test(code) || !Number.isInteger(season)) {
    res.status(400).json({ error: 'code and season are required' });
    return;
  }
  const followKey = `fdorg-comp-${code}`;
  const out = await servePoll(
    triggerOf(req.get(TRIGGER_HEADER)),
    {
      source: 'fdorg',
      sport: 'soccer',
      competitionId: followKey,
      pollPath: `pollFdCompetition?code=${code}&season=${season}`,
      seasonRequested: String(season),
    },
    async (trace) => {
      // The season on the path is a HINT. Follows persist their pollPath
      // at follow time, and one global constant was wrong for CL (2025)
      // and EC (2024) from the day it was written — so the provider's own
      // currentSeason wins, which also self-heals every stored follow.
      const seasons = await loadFdSeasons(db, requireFdKey());
      const resolved = seasons.get(code)?.seasonYear;
      if (resolved === undefined) {
        // Resolvable means "has a current season that has not ended".
        // Nothing to poll, nothing wrong — say so rather than 404-ing.
        trace.seasonsTried.push(String(season));
        return {
          rawCount: 0,
          fixtures: [],
          followKey,
          seasonResolved: null,
          reason: 'no_future_events' as const,
          body: { season: null, reason: 'no_future_events' },
        };
      }
      trace.seasonsTried.push(String(resolved));
      const r = await fetchFdCompetitionSeasonFixtures(
        requireFdKey(),
        code,
        resolved,
      );
      return {
        ...r,
        followKey,
        seasonResolved: String(resolved),
        body: { season: resolved },
      };
    },
  );
  res.status(out.status).json(out.body);
});

function requireTsdbKey(): string {
  const apiKey = process.env.TSDB_KEY;
  if (!apiKey) throw new Error('TSDB_KEY not configured');
  return apiKey;
}

export const pollTsdbLeague = onRequest(async (req, res) => {
  const leagueId = String(req.query.leagueId ?? '');
  const hint = String(req.query.season ?? '') || undefined;
  const sport = String(req.query.sport ?? '');
  const durationHours = Number(req.query.durationHours ?? 2);
  if (!/^\d{3,6}$/.test(leagueId) || !sport) {
    res.status(400).json({ error: 'leagueId and sport are required' });
    return;
  }
  const followKey = `tsdb-league-${leagueId}`;
  const out = await servePoll(
    triggerOf(req.get(TRIGGER_HEADER)),
    {
      source: 'tsdb',
      sport,
      competitionId: followKey,
      pollPath: `pollTsdbLeague?leagueId=${leagueId}&season=${hint ?? ''}&sport=${sport}&durationHours=${durationHours}`,
      seasonRequested: hint ?? null,
    },
    async (trace) => {
      // The season on the path is only a HINT. Follows persist their
      // pollPath at follow time, so a season baked in last year would
      // otherwise poll a finished season forever. We try the hint plus
      // the seasons the calendar says are live, and keep whichever
      // actually has upcoming fixtures — self-healing across a rollover.
      const attempts: Array<{
        season: string;
        fixtures: Fixture[];
        rawCount: number;
      }> = [];
      for (const season of seasonsToTry(hint)) {
        trace.seasonsTried.push(season);
        const r = await fetchTsdbLeagueSeasonFixtures(
          requireTsdbKey(),
          leagueId,
          season,
          sport,
          durationHours,
        );
        attempts.push({ season, fixtures: r.fixtures, rawCount: r.rawCount });
        // Stop early when the hint already has a live season's worth.
        if (r.fixtures.some((f) => f.startUtc >= new Date().toISOString())) {
          break;
        }
      }
      const best = bestSeason(attempts);
      const chosen = best
        ? attempts.find((a) => a.season === best.season)
        : undefined;
      // bestSeason never selects a season with zero upcoming events, so a
      // null here means every candidate is finished. Ingest NOTHING — a
      // dead season fills the cache with events the horizon rule will
      // never write, and gives Stage 4's reaper a stale truth to
      // reconcile a live slice against. Recorded as a real run with a
      // reason rather than an error: the provider answered honestly.
      const chosenFixtures = chosen?.fixtures ?? [];
      // Combat leagues: the headline bout parsed from each card title
      // becomes an appearance (deriveBoutAppearances is a no-op for
      // sports whose titles do not name people). TheSportsDB publishes
      // no bout structure, so the headline is all a card here can give.
      // Only cards from the last week forward — a season poll carries
      // its finished cards too, and a finished bout needs no appearance
      // doc (the same 7-day lookback the PBC window uses).
      const nowIso = new Date().toISOString();
      const appearanceFrom = new Date(Date.now() - 7 * 86_400_000)
        .toISOString();
      const derived = deriveBoutAppearances(
        chosenFixtures.filter((f) => f.startUtc >= appearanceFrom),
        nowIso,
      );
      return {
        rawCount: chosen?.rawCount ?? 0,
        fixtures: chosenFixtures,
        followKey,
        seasonResolved: best?.season ?? null,
        ...(best ? {} : { reason: 'no_future_events' as const }),
        // Combat sports ALWAYS carry the appearance slice, zero yield
        // included — a run that parsed nothing must be recorded as such,
        // or the funnel goes dark exactly when the parse dies.
        ...(namesPeople(sport)
          ? {
              appearances: {
                followKey: appearanceSliceKey(followKey),
                // Funnel stage A for this slice: cards inside the
                // derivation window, before the parse and name gates.
                rawCount: chosenFixtures.filter(
                  (f) => f.startUtc >= appearanceFrom,
                ).length,
                fixtures: derived,
              },
            }
          : {}),
        body: {
          season: best?.season ?? null,
          triedSeasons: attempts.map((a) => a.season),
          ...(best ? {} : { reason: 'no_future_events' }),
        },
      };
    },
  );
  res.status(out.status).json(out.body);
});

export const pollMlbTeam = onRequest(async (req, res) => {
  const teamId = Number(req.query.teamId);
  const season = Number(req.query.season);
  if (!Number.isInteger(teamId) || !Number.isInteger(season)) {
    res.status(400).json({ error: 'teamId and season are required' });
    return;
  }
  const followKey = `mlb-team-${teamId}`;
  const out = await servePoll(
    triggerOf(req.get(TRIGGER_HEADER)),
    {
      source: 'mlb',
      sport: 'baseball',
      competitionId: followKey,
      pollPath: `pollMlbTeam?teamId=${teamId}&season=${season}`,
      seasonRequested: String(season),
    },
    async (trace) => {
      trace.seasonsTried.push(String(season));
      const r = await fetchMlbTeamSeasonFixtures(teamId, season);
      return { ...r, followKey, seasonResolved: String(season) };
    },
  );
  res.status(out.status).json(out.body);
});

export const pollNhlTeam = onRequest(async (req, res) => {
  const abbrev = String(req.query.abbrev ?? '');
  const season = String(req.query.season ?? '');
  if (!/^[A-Z]{2,3}$/.test(abbrev) || !/^\d{8}$/.test(season)) {
    res.status(400).json({ error: 'abbrev and season (YYYYYYYY) required' });
    return;
  }
  const followKey = `nhl-team-${abbrev}`;
  const out = await servePoll(
    triggerOf(req.get(TRIGGER_HEADER)),
    {
      source: 'nhl',
      sport: 'ice-hockey',
      competitionId: followKey,
      pollPath: `pollNhlTeam?abbrev=${abbrev}&season=${season}`,
      seasonRequested: season,
    },
    async (trace) => {
      trace.seasonsTried.push(season);
      const r = await fetchNhlTeamSeasonFixtures(abbrev, season);
      return { ...r, followKey, seasonResolved: season };
    },
  );
  res.status(out.status).json(out.body);
});

export const pollF1 = onRequest(async (req, res) => {
  const season = Number(req.query.season);
  if (!Number.isInteger(season)) {
    res.status(400).json({ error: 'season is required' });
    return;
  }
  const out = await servePoll(
    triggerOf(req.get(TRIGGER_HEADER)),
    {
      source: 'f1',
      sport: 'f1',
      competitionId: 'f1-series-1',
      pollPath: `pollF1?season=${season}`,
      seasonRequested: String(season),
    },
    async (trace) => {
      trace.seasonsTried.push(String(season));
      const r = await fetchF1SeasonFixtures(season);
      return {
        ...r,
        followKey: 'f1-series-1',
        seasonResolved: String(season),
      };
    },
  );
  res.status(out.status).json(out.body);
});

const MUTABLE_STATUSES: FixtureStatus[] = [
  'scheduled',
  'tbd',
  'postponed',
  'cancelled',
  'in_play',
  'finished',
];

// TEST HOOK — emulator only, refuses to run in production. Simulates
// upstream schedule changes: shift kickoff and/or change status.
export const mutateFixture = onRequest(async (req, res) => {
  if (process.env.FUNCTIONS_EMULATOR !== 'true') {
    res.status(403).json({ error: 'emulator only' });
    return;
  }
  try {
    const fixtureId = String(req.query.fixtureId ?? '');
    const shiftHours = Number(req.query.shiftHours ?? 0);
    const status = req.query.status as FixtureStatus | undefined;
    if (status && !MUTABLE_STATUSES.includes(status)) {
      res.status(400).json({ error: `invalid status ${status}` });
      return;
    }
    const ref = db.collection('fixtures').doc(fixtureId);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(404).json({ error: `fixture ${fixtureId} not found` });
      return;
    }
    const f = snap.data() as Fixture;
    // Instant arithmetic, not local-clock arithmetic — a test hook that
    // shifts by the wrong amount across a DST boundary would make the
    // engine look broken when it is not.
    const newStartUtc = new Date(
      new Date(f.startUtc).getTime() + shiftHours * 3_600_000,
    ).toISOString();
    const newStatus = status ?? f.status;
    const at = new Date().toISOString();
    await ref.update({ startUtc: newStartUtc, status: newStatus, updatedAt: at });
    const record: Record<string, unknown> = { fixtureId, at };
    if (newStartUtc !== f.startUtc) {
      Object.assign(record, {
        kind: 'time_changed',
        prevStartUtc: f.startUtc,
        newStartUtc,
      });
    }
    if (newStatus !== f.status) {
      Object.assign(record, {
        kind: 'status_changed',
        prevStatus: f.status,
        newStatus,
      });
    }
    // followKeys must ride along or the sweep cannot fan out pushes for
    // simulated changes — which is exactly what push verification needs.
    await db
      .collection('fixtureChanges')
      .add({ ...record, followKeys: f.followKeys ?? [] });
    res.json({
      fixtureId,
      prevStartUtc: f.startUtc,
      newStartUtc,
      prevStatus: f.status,
      newStatus,
    });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// The propagation heartbeat: re-poll everything followed, push to
// affected devices. Every 6 hours balances freshness against provider
// politeness; layer 2 (background fetch) and layer 3 (foreground sync)
// cover the gaps.
export const scheduledSweep = onSchedule(
  { schedule: 'every 6 hours', timeoutSeconds: 540, memory: '256MiB' },
  async () => {
    await sweepAll();
  },
);

// Manual trigger for verification and ops — guarded by a shared key.
// FAILS CLOSED: a deploy without SWEEP_KEY refuses every request rather
// than exposing a 540s provider-polling endpoint to the internet.
export const runSweep = onRequest(
  { timeoutSeconds: 540, memory: '256MiB', maxInstances: 2 },
  async (req, res) => {
    const expected = process.env.SWEEP_KEY;
    const provided = req.get('x-sweep-key');
    if (!expected || !provided || !timingSafeEqualStr(provided, expected)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    try {
      res.json(await sweepAll());
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  },
);

// Weekly hygiene: collapse cross-provider duplicates so one real fixture
// is one calendar entry. Runs after the sweep's usual cadence.
export const scheduledReconcile = onSchedule(
  { schedule: 'every sunday 04:00', timeoutSeconds: 540, memory: '256MiB' },
  async () => {
    await reconcileFixtures(false);
  },
);

// ─── Prompt 4: boxing (PBC), tennis, athletics ────────────────────────

export const pollPbc = onRequest(
  { timeoutSeconds: 300 },
  async (req, res) => {
    // The sitemap holds 319 cards and nearly all have happened; only
    // those on or after this date are fetched, at the crawl delay PBC's
    // robots.txt asks for.
    const from = new Date(Date.now() - 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const out = await servePoll(
      triggerOf(req.get(TRIGGER_HEADER)),
      {
        source: 'pbc',
        sport: 'boxing',
        competitionId: 'pbc-cards',
        pollPath: 'pollPbc',
        seasonRequested: null,
      },
      async (trace) => {
        trace.seasonsTried.push('current');
        const r = await fetchPbcCards(from);
        return {
          rawCount: r.rawCount,
          fixtures: r.fixtures,
          followKey: 'pbc-cards',
          seasonResolved: 'current',
          // Always attached, zero yield included: fetched-N-parsed-0 is
          // the funnel's way of saying the performer array rotted.
          appearances: {
            followKey: appearanceSliceKey('pbc-cards'),
            rawCount: r.appearanceRawCount,
            fixtures: r.appearances,
          },
        };
      },
    );
    res.status(out.status).json(out.body);
  },
);

export const pollTennis = onRequest(async (req, res) => {
  const out = await servePoll(
    triggerOf(req.get(TRIGGER_HEADER)),
    {
      source: 'tennis',
      sport: 'tennis',
      competitionId: 'tennis-atp',
      pollPath: 'pollTennis',
      seasonRequested: null,
    },
    async (trace) => {
      trace.seasonsTried.push('current');
      const r = await fetchTennisTournaments();
      return { ...r, followKey: 'tennis-atp', seasonResolved: 'current' };
    },
  );
  res.status(out.status).json(out.body);
});

// WTA tournaments + draws + order of play (owner ruling 2026-08-02:
// api.wtatennis.com approved; conditions live in the provider header).
// Women's tennis coverage exists because of this route — the ICS is
// ATP-only.
export const pollWtaTennis = onRequest(
  { timeoutSeconds: 120 },
  async (req, res) => {
    const from = new Date(Date.now() - 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const to = new Date(Date.now() + 180 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const out = await servePoll(
      triggerOf(req.get(TRIGGER_HEADER)),
      {
        source: 'wta',
        sport: 'tennis',
        competitionId: 'tennis-wta',
        pollPath: 'pollWtaTennis',
        seasonRequested: null,
      },
      async (trace) => {
        trace.seasonsTried.push(`${from}..${to}`);
        const r = await fetchWtaTennis(from, to);
        return {
          rawCount: r.rawCount,
          fixtures: r.fixtures,
          followKey: 'tennis-wta',
          seasonResolved: 'current',
          // Always attached, zero yield included — same rule as every
          // appearance slice: a run that parsed nothing is recorded.
          appearances: {
            followKey: appearanceSliceKey('tennis-wta'),
            rawCount: r.appearanceRawCount,
            fixtures: r.appearances,
          },
          body: {
            activeTournaments: r.activeTournaments,
            activeSkipped: r.activeSkipped,
          },
        };
      },
    );
    res.status(out.status).json(out.body);
  },
);

export const pollAthletics = onRequest(
  { timeoutSeconds: 300 },
  async (req, res) => {
    // A rolling window: everything from a week ago to a year out. The
    // calendar carries ~1,250 meetings for five months, so the page cap
    // in the adapter bounds the work per run.
    const from = new Date(Date.now() - 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const to = new Date(Date.now() + 365 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const out = await servePoll(
      triggerOf(req.get(TRIGGER_HEADER)),
      {
        source: 'wa',
        sport: 'athletics',
        competitionId: 'wa-calendar',
        pollPath: 'pollAthletics',
        seasonRequested: null,
      },
      async (trace) => {
        trace.seasonsTried.push(`${from}..${to}`);
        const r = await fetchWorldAthletics(from, to);
        return { ...r, followKey: 'wa-calendar', seasonResolved: 'current' };
      },
    );
    res.status(out.status).json(out.body);
  },
);

// ─── Review queue ─────────────────────────────────────────────────────
//
// Everything here is key-guarded: it writes to what users' calendars
// eventually show, so it is an operator surface, not a public one.

function reviewAuthed(req: { get(h: string): string | undefined }): boolean {
  const expected = process.env.SWEEP_KEY;
  const provided = req.get('x-sweep-key');
  return Boolean(
    expected && provided && timingSafeEqualStr(provided, expected),
  );
}

export const submitReview = onRequest(async (req, res) => {
  if (!reviewAuthed(req)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  const parsed = validateSubmission(req.body);
  if (!parsed.ok) {
    // Rejected, never repaired: a repaired record is one nobody verified.
    res.status(400).json({ error: 'invalid submission', errors: parsed.errors });
    return;
  }
  const item = await submitReviewItem(db, parsed.value, new Date().toISOString());
  res.json({ id: item.id, status: item.status });
});

export const listReview = onRequest(async (req, res) => {
  if (!reviewAuthed(req)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  const status = req.query.status as ReviewStatus | undefined;
  res.json({ items: await listReviewItems(db, status) });
});

// Approve, correct or reject. Approving is the ONLY path from the queue
// into the fixture cache.
export const decideReview = onRequest(async (req, res) => {
  if (!reviewAuthed(req)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  const id = String(req.query.id ?? (req.body as { id?: string })?.id ?? '');
  const decision = String(
    req.query.decision ?? (req.body as { decision?: string })?.decision ?? '',
  );
  if (!id || !['confirmed', 'cancelled', 'provisional'].includes(decision)) {
    res.status(400).json({ error: 'id and decision (confirmed|cancelled|provisional) required' });
    return;
  }
  const ref = db.collection('reviewQueue').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    res.status(404).json({ error: 'no such review item' });
    return;
  }
  const now = new Date().toISOString();
  // A correction may accompany the decision; it is re-validated, never
  // trusted, and a failed correction leaves the item exactly as it was.
  const corrections = (req.body as { corrections?: unknown })?.corrections;
  let base = snap.data() as ReviewItem;
  if (corrections) {
    const parsed = validateSubmission({ ...base, ...(corrections as object) });
    if (!parsed.ok) {
      res.status(400).json({ error: 'invalid correction', errors: parsed.errors });
      return;
    }
    base = { ...base, ...parsed.value };
  }
  const item: ReviewItem = {
    ...base,
    status: decision as ReviewStatus,
    decidedAt: now,
    decidedBy: String(req.query.by ?? 'operator'),
  };
  await ref.set(item);

  const fixture = reviewItemToFixture(item, now);
  if (fixture) {
    await ingest([fixture], fixture.followKeys[0]);
    // Every approved bout — undercard included — becomes an appearance
    // under its own slice, which is what makes a prelim fighter
    // followable at all. A re-decide with corrected names retires the
    // appearances the fresh set no longer contains (same evidence guard
    // as the polls). No poll route refreshes review slices, so the
    // directory entries carry no pollPath.
    const appearances = reviewItemToAppearances(item, now);
    let retired = 0;
    if (appearances.length > 0) {
      const sliceKey = appearanceSliceKey(fixture.competitionId);
      await ingest(appearances, sliceKey);
      retired = await retireAppearances(sliceKey, appearances);
      try {
        await upsertAthleteDirectory(appearances, null);
      } catch (e) {
        console.error('athleteDirectory upsert failed for review slice:', e);
      }
    }
    res.json({
      id,
      status: item.status,
      published: fixture.id,
      appearances: appearances.map((a) => a.id),
      appearancesRetired: retired,
    });
    return;
  }
  res.json({ id, status: item.status, published: null });
});

// The admin view. Served WITHOUT the key, deliberately: a browser cannot
// put a custom header on a top-level navigation, so guarding this page the
// way the data endpoints are guarded made it unreachable — 403 for
// everyone, including whoever holds the key.
//
// So the page carries NO DATA. It is markup and script: it asks for the
// operator key, keeps it in sessionStorage for the tab, and calls
// listReview/decideReview with the header. Every byte of queue content
// still comes from a guarded endpoint. Serving an empty shell reveals
// only that a review queue exists.
export const reviewAdmin = onRequest(async (_req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8').send(
    `<!doctype html><meta charset="utf-8"><title>KickOffCal review queue</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
 body{font:14px/1.55 system-ui,-apple-system,sans-serif;margin:2rem auto;max-width:1100px;padding:0 1rem;color:#111}
 table{border-collapse:collapse;width:100%;margin-top:1rem}
 td,th{border-bottom:1px solid #e5e5e5;padding:.55rem;vertical-align:top;text-align:left}
 tr.provisional{background:#fffbea} tr.cancelled{opacity:.45} tr.confirmed{background:#f0fdf4}
 button{margin-right:.4rem;padding:.3rem .7rem;cursor:pointer;border:1px solid #bbb;background:#fff;border-radius:4px}
 button.approve{border-color:#15803d;color:#15803d} button.reject{border-color:#b91c1c;color:#b91c1c}
 small{color:#666} .bar{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
 .err{color:#b91c1c;margin:1rem 0} code{background:#f4f4f4;padding:.1rem .3rem;border-radius:3px}
 @media(prefers-color-scheme:dark){
   body{background:#111;color:#eee} td,th{border-color:#333}
   tr.provisional{background:#2a2410} tr.confirmed{background:#0f2417}
   button{background:#1c1c1c;color:#eee;border-color:#444} code{background:#222}
 }
</style>
<h1>Review queue</h1>
<p><small>Nothing here reaches a calendar until it is approved, and every row
carries the source it was extracted from — check the claim against it.</small></p>
<div class="bar">
  <label>show
    <select id="filter">
      <option value="">everything</option>
      <option value="provisional" selected>provisional</option>
      <option value="confirmed">confirmed</option>
      <option value="cancelled">cancelled</option>
    </select>
  </label>
  <button onclick="forgetKey()">forget key</button>
  <span id="count"></span>
</div>
<div id="out"><p><small>loading…</small></p></div>
<script>
const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// Resolve sibling endpoints from THIS page's path, so the page works
// whether it was opened as /reviewAdmin or /reviewAdmin/ — a bare
// relative URL resolves differently in those two cases.
const BASE = location.pathname.replace(/\\/reviewAdmin\\/?$/, '');
const api = p => BASE + '/' + p;
function key(){
  let k = sessionStorage.getItem('kocKey');
  if (!k) { k = prompt('Operator key (SWEEP_KEY)'); if (k) sessionStorage.setItem('kocKey', k); }
  return k;
}
function forgetKey(){ sessionStorage.removeItem('kocKey'); location.reload(); }
async function load(){
  const k = key();
  if (!k) { document.getElementById('out').innerHTML =
    '<p class="err">No key entered. Reload to try again.</p>'; return; }
  const status = document.getElementById('filter').value;
  const r = await fetch(api('listReview') + (status ? '?status=' + status : ''),
    { headers: { 'x-sweep-key': k } });
  if (r.status === 403) {
    sessionStorage.removeItem('kocKey');
    document.getElementById('out').innerHTML =
      '<p class="err">That key was rejected. Reload to try again.</p>';
    return;
  }
  if (!r.ok) {
    document.getElementById('out').innerHTML =
      '<p class="err">Could not load the queue (HTTP ' + r.status + ').</p>';
    return;
  }
  const { items } = await r.json();
  document.getElementById('count').textContent = items.length + ' item(s)';
  if (!items.length) {
    document.getElementById('out').innerHTML =
      '<p><small>Nothing here yet. Submit a card with ' +
      '<code>POST /submitReview</code> — see docs/PLAN.md for the schema.</small></p>';
    return;
  }
  document.getElementById('out').innerHTML =
    '<table><tr><th>status</th><th>starts</th><th>card</th><th>bouts</th>' +
    '<th>source</th><th></th></tr>' + items.map(i => \`
      <tr class="\${esc(i.status)}">
        <td>\${esc(i.status)}</td>
        <td>\${esc(i.startUtc)}</td>
        <td><strong>\${esc(i.title)}</strong><br><small>\${esc(i.promoter)}\${
          i.venue ? ' — ' + esc(i.venue) : ''}\${
          i.broadcaster ? ' · ' + esc(i.broadcaster) : ''}</small></td>
        <td>\${(i.bouts || []).map(b => esc(b.first) + ' v ' + esc(b.second) +
          ' <small>(' + esc(b.cardPosition) +
          (b.titleOnTheLine ? ', ' + esc(b.titleOnTheLine) : '') + ')</small>').join('<br>')}</td>
        <td><a href="\${esc(i.sourceUrl)}" rel="noreferrer noopener" target="_blank">source</a></td>
        <td>
          <button class="approve" onclick="decide('\${esc(i.id)}','confirmed')">approve</button>
          <button class="reject" onclick="decide('\${esc(i.id)}','cancelled')">reject</button>
        </td>
      </tr>\`).join('') + '</table>';
}
async function decide(id, decision){
  const k = key();
  if (!k) return;
  const r = await fetch(api('decideReview') + '?id=' + encodeURIComponent(id) + '&decision=' + decision,
    { method: 'POST', headers: { 'x-sweep-key': k, 'Content-Type': 'application/json' }, body: '{}' });
  if (r.ok) load(); else alert('Failed (HTTP ' + r.status + '): ' + await r.text());
}
document.getElementById('filter').addEventListener('change', load);
load();
</script>`,
  );
});

// What every connector has actually delivered lately, per ingest slice.
// Read-only, but it scans the run history and every future-dated fixture,
// so it is guarded with the same shared key as the other ops endpoints and
// FAILS CLOSED — an unauthenticated unbounded scan is a cost surface, not
// a convenience.
export const coverageReport = onRequest(
  { timeoutSeconds: 120, memory: '256MiB', maxInstances: 2 },
  async (req, res) => {
    const expected = process.env.SWEEP_KEY;
    const provided = req.get('x-sweep-key');
    if (!expected || !provided || !timingSafeEqualStr(provided, expected)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    try {
      res.json(await loadCoverage(db, Date.now()));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  },
);

// Manual trigger; dry-run by default so it can be inspected safely.
export const runReconcile = onRequest(
  { timeoutSeconds: 540, memory: '256MiB', maxInstances: 2 },
  async (req, res) => {
    const expected = process.env.SWEEP_KEY;
    const provided = req.get('x-sweep-key');
    if (!expected || !provided || !timingSafeEqualStr(provided, expected)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    try {
      res.json(await reconcileFixtures(req.query.apply !== 'true'));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  },
);
