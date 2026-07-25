import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { diffFixtures } from './diff';
import { Fixture } from './fixture';
import { fetchTeamSeasonFixtures } from './providers/apiSports';

initializeApp();
const db = getFirestore();

// Slice: HTTP-triggered poll for one team+season. The production shape is
// a Scheduler-driven sweep over all followed followables (M2/M6); the
// adapter → diff → cache pipeline is identical.
export const pollTeam = onRequest(async (req, res) => {
  try {
    const teamId = Number(req.query.teamId);
    const season = Number(req.query.season);
    if (!Number.isInteger(teamId) || !Number.isInteger(season)) {
      res.status(400).json({ error: 'teamId and season are required' });
      return;
    }
    const apiKey = process.env.APISPORTS_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'APISPORTS_KEY not configured' });
      return;
    }

    const incoming = await fetchTeamSeasonFixtures(apiKey, teamId, season);
    const teamKey = `apisports-team-${teamId}`;
    const existingSnap = await db
      .collection('fixtures')
      .where('teamIds', 'array-contains', teamKey)
      .get();
    const existing = new Map<string, Fixture>(
      existingSnap.docs.map((d) => [d.id, d.data() as Fixture]),
    );

    const changes = diffFixtures(existing, incoming);
    const at = new Date().toISOString();
    const batch = db.batch();
    for (const f of incoming) {
      batch.set(db.collection('fixtures').doc(f.id), f);
    }
    for (const c of changes) {
      batch.set(db.collection('fixtureChanges').doc(), { ...c, at });
    }
    await batch.commit();

    res.json({ fixtures: incoming.length, changes: changes.length });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// TEST HOOK — emulator only, refuses to run in production. Simulates an
// upstream schedule change by shifting a fixture's kickoff.
export const mutateFixture = onRequest(async (req, res) => {
  if (process.env.FUNCTIONS_EMULATOR !== 'true') {
    res.status(403).json({ error: 'emulator only' });
    return;
  }
  try {
    const fixtureId = String(req.query.fixtureId ?? '');
    const shiftHours = Number(req.query.shiftHours ?? 2);
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
    const at = new Date().toISOString();
    await ref.update({ startUtc: newStartUtc, updatedAt: at });
    await db.collection('fixtureChanges').add({
      kind: 'time_changed',
      fixtureId,
      prevStartUtc: f.startUtc,
      newStartUtc,
      at,
    });
    res.json({ fixtureId, prevStartUtc: f.startUtc, newStartUtc });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});
