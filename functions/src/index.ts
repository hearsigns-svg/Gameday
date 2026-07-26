import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { diffFixtures } from './diff';
import { Fixture, FixtureStatus } from './fixture';
import {
  fetchLeagueSeasonFixtures,
  fetchTeamSeasonFixtures,
} from './providers/apiSports';
import { fetchMlbTeamSeasonFixtures } from './providers/mlb';
import { fetchNhlTeamSeasonFixtures } from './providers/nhl';
import { fetchF1SeasonFixtures } from './providers/f1';
import {
  listMlbTeams,
  listNhlTeams,
  listSoccerLeagues,
  listSoccerTeams,
} from './directory';

initializeApp();
const db = getFirestore();

// Shared ingest: diff fresh fixtures against the cache slice for one
// followable key, then upsert fixtures + append change records.
async function ingest(
  incoming: Fixture[],
  followKey: string,
): Promise<{ fixtures: number; changes: number }> {
  const existingSnap = await db
    .collection('fixtures')
    .where('followKeys', 'array-contains', followKey)
    .get();
  const existing = new Map<string, Fixture>(
    existingSnap.docs.map((d) => [d.id, d.data() as Fixture]),
  );
  const changes = diffFixtures(existing, incoming);
  const at = new Date().toISOString();
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
  for (const f of incoming) {
    batch.set(db.collection('fixtures').doc(f.id), f);
    if (++pending >= 450) await flush();
  }
  for (const c of changes) {
    batch.set(db.collection('fixtureChanges').doc(), { ...c, at });
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

export const listTeams = onRequest(async (req, res) => {
  try {
    const sport = String(req.query.sport ?? 'soccer');
    if (sport === 'baseball') {
      const season = Number(req.query.season ?? new Date().getFullYear());
      res.json({ teams: await listMlbTeams(season) });
      return;
    }
    if (sport === 'ice-hockey') {
      res.json({ teams: await listNhlTeams() });
      return;
    }
    const leagueId = Number(req.query.leagueId);
    if (!Number.isInteger(leagueId)) {
      res.status(400).json({ error: 'leagueId is required' });
      return;
    }
    res.json({ teams: await listSoccerTeams(requireKey(), leagueId) });
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
    const shifted = new Date(f.startUtc);
    shifted.setHours(shifted.getHours() + shiftHours);
    const newStartUtc = shifted.toISOString();
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
    await db.collection('fixtureChanges').add(record);
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
