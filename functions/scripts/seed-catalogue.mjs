// Seed (or re-seed) the catalogue collection from CATALOGUE_SEED.
// Idempotent: doc id = competitionId, full overwrite of seeded fields,
// EXCEPT `enabled` — an ops decision to cool a path survives re-seeding.
//
// Usage (from functions/): node scripts/seed-catalogue.mjs [--apply]

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { CATALOGUE_SEED } from '../lib/catalogue.js';

const apply = process.argv.includes('--apply');
initializeApp({ credential: applicationDefault(), projectId: 'gameday-fixtures' });
const db = getFirestore();

const existing = await db.collection('catalogue').get();
const existingEnabled = new Map(
  existing.docs.map((d) => [d.id, d.data().enabled]),
);

const t1 = CATALOGUE_SEED.filter((e) => e.tier === 1).length;
const t2 = CATALOGUE_SEED.filter((e) => e.tier === 2).length;
console.log(
  `${apply ? 'seeding' : 'WOULD seed'} ${CATALOGUE_SEED.length} entries (tier 1: ${t1}, tier 2: ${t2})`,
);
for (const e of CATALOGUE_SEED) {
  const kept = existingEnabled.get(e.competitionId);
  const enabled = kept === undefined ? e.enabled : kept;
  console.log(
    `  T${e.tier} ${e.competitionId.padEnd(28)} ${e.label}${enabled ? '' : '  [DISABLED, kept]'}`,
  );
}
if (!apply) process.exit(0);

let batch = db.batch();
let pending = 0;
for (const e of CATALOGUE_SEED) {
  const kept = existingEnabled.get(e.competitionId);
  batch.set(db.collection('catalogue').doc(e.competitionId), {
    ...e,
    enabled: kept === undefined ? e.enabled : kept,
  });
  if (++pending >= 450) {
    await batch.commit();
    batch = db.batch();
    pending = 0;
  }
}
if (pending > 0) await batch.commit();
console.log('seeded');
