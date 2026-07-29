// Re-warm the teamDirectory cache so cached docs gain the crest/colour
// fields (the cache never expires on its own). Deletes every directory
// doc, then walks the followable league list through listTeams with
// rate-limit spacing (fd.org free tier: 10 req/min).
//
// Run with owner ADC (same setup as the 2026-07-23 backfill):
//   node scripts/refresh-team-directory.mjs          # dry-run: list docs
//   node scripts/refresh-team-directory.mjs --apply  # delete + re-warm

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const BASE = 'https://us-central1-gameday-fixtures.cloudfunctions.net';
const FD_COMPS = ['PL', 'ELC', 'CL', 'BL1', 'SA', 'PD', 'FL1', 'DED', 'PPL', 'BSA', 'EC', 'WC'];
const OTHER = [
  'listTeams?sport=baseball&season=2026',
  'listTeams?sport=ice-hockey',
  'listTeams?sport=basketball',
  'listTeams?sport=nfl',
  'listTeams?sport=cricket',
];
const FD_SPACING_MS = 7_000;

const apply = process.argv.includes('--apply');
initializeApp({ credential: applicationDefault(), projectId: 'gameday-fixtures' });
const db = getFirestore();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const snap = await db.collection('teamDirectory').get();
console.log(`teamDirectory docs: ${snap.docs.map((d) => d.id).join(', ') || '(none)'}`);
if (!apply) {
  console.log('Dry-run. Re-run with --apply to delete + re-warm.');
  process.exit(0);
}

for (const doc of snap.docs) {
  await doc.ref.delete();
  console.log(`deleted ${doc.id}`);
}

for (const path of OTHER) {
  const res = await fetch(`${BASE}/${path}`);
  console.log(`${path} -> ${res.status}`);
}
for (const code of FD_COMPS) {
  const res = await fetch(`${BASE}/listTeams?sport=soccer&leagueId=${code}&season=2026`);
  console.log(`fd ${code} -> ${res.status}`);
  await sleep(FD_SPACING_MS);
}
console.log('done — directories re-warmed with crests/colours.');
