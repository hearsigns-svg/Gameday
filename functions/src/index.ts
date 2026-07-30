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

// Shared ingest: diff fresh fixtures against the cache slice for one
// followable key, then upsert fixtures + append change records.
async function ingest(
  rawIncoming: Fixture[],
  followKey: string,
): Promise<{ fixtures: number; changes: number }> {
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
  for (const f of incoming) {
    const prev = existing.get(f.id);
    if (prev && sameFixture(prev, f)) continue;
    // firstSeenAt decides which id survives a cross-source merge — it
    // must never be reset by a re-poll.
    const record: Fixture = { ...f, firstSeenAt: prev?.firstSeenAt ?? at };
    batch.set(db.collection('fixtures').doc(f.id), record);
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
  return { fixtures: incoming.length, changes: changes.length };
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
  try {
    const teamId = Number(req.query.teamId);
    const season = Number(req.query.season);
    if (!Number.isInteger(teamId) || !Number.isInteger(season)) {
      res.status(400).json({ error: 'teamId and season are required' });
      return;
    }
    const incoming = await fetchTeamSeasonFixtures(requireKey(), teamId, season);
    res.json(await ingest(incoming, `apisports-team-${teamId}`));
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

export const pollLeague = onRequest(async (req, res) => {
  try {
    const leagueId = Number(req.query.leagueId);
    const season = Number(req.query.season);
    if (!Number.isInteger(leagueId) || !Number.isInteger(season)) {
      res.status(400).json({ error: 'leagueId and season are required' });
      return;
    }
    const incoming = await fetchLeagueSeasonFixtures(
      requireKey(),
      leagueId,
      season,
    );
    res.json(await ingest(incoming, `apisports-league-${leagueId}`));
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
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
  try {
    const teamId = Number(req.query.teamId);
    const season = Number(req.query.season);
    if (!Number.isInteger(teamId) || !Number.isInteger(season)) {
      res.status(400).json({ error: 'teamId and season are required' });
      return;
    }
    const incoming = await fetchFdTeamSeasonFixtures(requireFdKey(), teamId, season);
    res.json(await ingest(incoming, `fdorg-team-${teamId}`));
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

export const pollFdCompetition = onRequest(async (req, res) => {
  try {
    const code = String(req.query.code ?? '');
    const season = Number(req.query.season);
    if (!/^[A-Z0-9]{2,4}$/.test(code) || !Number.isInteger(season)) {
      res.status(400).json({ error: 'code and season are required' });
      return;
    }
    const incoming = await fetchFdCompetitionSeasonFixtures(
      requireFdKey(),
      code,
      season,
    );
    res.json(await ingest(incoming, `fdorg-comp-${code}`));
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

function requireTsdbKey(): string {
  const apiKey = process.env.TSDB_KEY;
  if (!apiKey) throw new Error('TSDB_KEY not configured');
  return apiKey;
}

export const pollTsdbLeague = onRequest(async (req, res) => {
  try {
    const leagueId = String(req.query.leagueId ?? '');
    const hint = String(req.query.season ?? '') || undefined;
    const sport = String(req.query.sport ?? '');
    const durationHours = Number(req.query.durationHours ?? 2);
    if (!/^\d{3,6}$/.test(leagueId) || !sport) {
      res.status(400).json({ error: 'leagueId and sport are required' });
      return;
    }
    // The season on the path is only a HINT. Follows persist their
    // pollPath at follow time, so a season baked in last year would
    // otherwise poll a finished season forever. We try the hint plus
    // the seasons the calendar says are live, and keep whichever
    // actually has upcoming fixtures — self-healing across a rollover.
    const attempts: Array<{ season: string; fixtures: Fixture[] }> = [];
    for (const season of seasonsToTry(hint)) {
      const fixtures = await fetchTsdbLeagueSeasonFixtures(
        requireTsdbKey(),
        leagueId,
        season,
        sport,
        durationHours,
      );
      attempts.push({ season, fixtures });
      // Stop early when the hint already has a live season's worth.
      if (fixtures.some((f) => f.startUtc >= new Date().toISOString())) break;
    }
    const best = bestSeason(attempts);
    if (!best) {
      res.json({ fixtures: 0, changes: 0, season: null, triedSeasons: attempts.map((a) => a.season) });
      return;
    }
    const result = await ingest(best.fixtures, `tsdb-league-${leagueId}`);
    res.json({ ...result, season: best.season });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

export const pollMlbTeam = onRequest(async (req, res) => {
  try {
    const teamId = Number(req.query.teamId);
    const season = Number(req.query.season);
    if (!Number.isInteger(teamId) || !Number.isInteger(season)) {
      res.status(400).json({ error: 'teamId and season are required' });
      return;
    }
    const incoming = await fetchMlbTeamSeasonFixtures(teamId, season);
    res.json(await ingest(incoming, `mlb-team-${teamId}`));
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

export const pollNhlTeam = onRequest(async (req, res) => {
  try {
    const abbrev = String(req.query.abbrev ?? '');
    const season = String(req.query.season ?? '');
    if (!/^[A-Z]{2,3}$/.test(abbrev) || !/^\d{8}$/.test(season)) {
      res.status(400).json({ error: 'abbrev and season (YYYYYYYY) required' });
      return;
    }
    const incoming = await fetchNhlTeamSeasonFixtures(abbrev, season);
    res.json(await ingest(incoming, `nhl-team-${abbrev}`));
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

export const pollF1 = onRequest(async (req, res) => {
  try {
    const season = Number(req.query.season);
    if (!Number.isInteger(season)) {
      res.status(400).json({ error: 'season is required' });
      return;
    }
    const incoming = await fetchF1SeasonFixtures(season);
    res.json(await ingest(incoming, 'f1-series-1'));
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
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
