// One-off crest backfill (Stage 4B rider): stamp homeCrestUrl /
// awayCrestUrl onto ALREADY-INGESTED upcoming fixtures, so composites
// appear immediately instead of waiting on each slice's next poll.
//
// Uses the SAME compiled join the ingest path runs (lib/crestStamp.js +
// lib/aliases.js) — one implementation, so the backfill cannot drift
// from what the next poll would write anyway. Patches ONLY the two
// crest fields (updatedAt untouched: nothing about the event changed).
//
//   node scripts/backfill-crests.mjs            # dry run, prints the diff
//   node scripts/backfill-crests.mjs --apply    # writes the patches
//
// Run from the repo root; requires `cd functions && npm run build` first.

import { createRequire } from 'node:module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { loadDirectoryJoins } = require('./lib/aliases.js');
const { stampCrests } = require('./lib/crestStamp.js');
const { normaliseName } = require('./lib/identity.js');

const apply = process.argv.includes('--apply');
admin.initializeApp({ projectId: 'gameday-fixtures' });
const db = admin.firestore();

const nowIso = new Date().toISOString();
const snap = await db.collection('fixtures').where('startUtc', '>', nowIso).get();
const fixtures = snap.docs.map((d) => d.data());
console.log(`${fixtures.length} upcoming fixtures loaded`);

const joins = await loadDirectoryJoins(db);
console.log(`directory join: ${joins.crests.size} crest-bearing names`);

const offSnap = await db.collection('catalogue').get();
const imageryOff = new Set(
  offSnap.docs
    .map((d) => d.data())
    .filter((e) => e.imagery === false && typeof e.competitionId === 'string')
    .map((e) => e.competitionId),
);
console.log(`imagery kill-switch: ${imageryOff.size} keys off`);

const stamped = stampCrests(fixtures, joins.crests, imageryOff, normaliseName);

const patches = [];
for (let i = 0; i < fixtures.length; i++) {
  const before = fixtures[i];
  const after = stamped[i];
  if (after === before) continue; // stampCrests returns the same object when nothing changes
  const patch = {};
  if (after.homeCrestUrl !== before.homeCrestUrl) {
    patch.homeCrestUrl = after.homeCrestUrl ?? FieldValue.delete();
  }
  if (after.awayCrestUrl !== before.awayCrestUrl) {
    patch.awayCrestUrl = after.awayCrestUrl ?? FieldValue.delete();
  }
  if (Object.keys(patch).length > 0) patches.push({ id: before.id, competitionId: before.competitionId, title: before.title, patch });
}

const byComp = new Map();
for (const p of patches) byComp.set(p.competitionId, (byComp.get(p.competitionId) ?? 0) + 1);
console.log(`\n${patches.length} fixtures to patch, by competition:`);
for (const [k, n] of [...byComp.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`);
console.log('\nsamples:');
for (const p of patches.slice(0, 8)) console.log(`  ${p.id} — ${p.title}`);
const named = patches.filter((p) => /Heat vs Minnesota|Mavericks vs Houston/.test(p.title ?? ''));
console.log(`\nnamed acceptance cards in patch set: ${named.length}`);
for (const p of named.slice(0, 4)) console.log(`  ${p.id} — ${p.title}`);

if (!apply) {
  console.log('\nDRY RUN — nothing written. Re-run with --apply.');
  process.exit(0);
}

let batch = db.batch();
let pending = 0;
let written = 0;
for (const p of patches) {
  batch.update(db.collection('fixtures').doc(p.id), p.patch);
  written++;
  if (++pending >= 450) {
    await batch.commit();
    batch = db.batch();
    pending = 0;
  }
}
if (pending > 0) await batch.commit();
console.log(`\nAPPLIED: ${written} fixtures patched.`);
process.exit(0);
