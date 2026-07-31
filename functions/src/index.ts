import { createHash, timingSafeEqual } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { sweepAll } from './sweep';
import { reconcileFixtures } from './reconcile';
import { augmentFollowKeys, loadTeamAliases } from './aliases';
import { searchTeams } from './search';
import { TSDB_TEAM_LEAGUES } from './tsdbTeamLeagues';
import { bestSeason, seasonsToTry } from './season';
import { diffFixtures } from './diff';
import { Fixture, FixtureStatus } from './fixture';
import { loadCoverage } from './coverage';
import {
  countsFrom,
  EMPTY_COUNTS,
  httpStatusFromError,
  isZeroYield,
  recordSourceRun,
  RunContext,
  RunCounts,
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
  // Stamp every provider's key for each club onto the fixture, so a
  // team followed via one provider still matches fixtures supplied by
  // another (league from football-data, cups from TSDB).
  const incoming =
    rawIncoming[0]?.sport === 'soccer'
      ? augmentFollowKeys(rawIncoming, await loadTeamAliases(db))
      : rawIncoming;
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
      },
      startedAt,
    );
    return {
      status: 200,
      body: {
        fixtures: ingested.fixtures,
        changes: ingested.changes,
        counts,
        zeroYield: isZeroYield(counts),
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
  res.json({ leagues: listSoccerLeagues() });
});

// Federated team search across everything followable (cached
// directories + live TSDB filtered to served leagues).
export const searchEntities = onRequest(async (req, res) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) {
      res.json({ teams: [] });
      return;
    }
    res.json({
      teams: await searchTeams(getFirestore(), requireTsdbKey(), q),
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
    // Soccer: leagueId is a football-data competition code (PL, CL, …).
    const code = String(req.query.leagueId ?? '');
    const season = Number(req.query.season ?? 2026);
    if (!/^[A-Z0-9]{2,4}$/.test(code)) {
      res.status(400).json({ error: 'leagueId (competition code) is required' });
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
      trace.seasonsTried.push(String(season));
      const r = await fetchFdTeamSeasonFixtures(requireFdKey(), teamId, season);
      return { ...r, followKey, seasonResolved: String(season) };
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
      trace.seasonsTried.push(String(season));
      const r = await fetchFdCompetitionSeasonFixtures(
        requireFdKey(),
        code,
        season,
      );
      return { ...r, followKey, seasonResolved: String(season) };
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
      // No candidate season had anything at all. Recorded as a real run
      // with zero yield rather than an error — it is a true statement
      // about the upstream, and the run doc is what makes it visible.
      return {
        rawCount: chosen?.rawCount ?? 0,
        fixtures: chosen?.fixtures ?? [],
        followKey,
        seasonResolved: best?.season ?? null,
        body: {
          season: best?.season ?? null,
          triedSeasons: attempts.map((a) => a.season),
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
