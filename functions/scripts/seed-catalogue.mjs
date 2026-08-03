// Seed (or re-seed) the catalogue collection from CATALOGUE_SEED.
// Idempotent: doc id = competitionId, full overwrite of seeded fields,
// EXCEPT two ops-owned fields that survive re-seeding:
//   - `enabled`  — an ops decision to cool a path
//   - `priority` — an ops-tuned ordering weight (Prompt 11); pass
//     --reset-priorities to force the seed's values over live ones
//
// Usage (from functions/): node scripts/seed-catalogue.mjs [--apply] [--reset-priorities]

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { CATALOGUE_SEED } from '../lib/catalogue.js';

const apply = process.argv.includes('--apply');
const resetPriorities = process.argv.includes('--reset-priorities');
initializeApp({ credential: applicationDefault(), projectId: 'gameday-fixtures' });
const db = getFirestore();

const existing = await db.collection('catalogue').get();
const live = new Map(existing.docs.map((d) => [d.id, d.data()]));

const finalEntry = (e) => {
  const kept = live.get(e.competitionId);
  const enabled = kept?.enabled === undefined ? e.enabled : kept.enabled;
  const priority =
    !resetPriorities && typeof kept?.priority === 'number'
      ? kept.priority
      : e.priority;
  return { ...e, enabled, ...(priority !== undefined ? { priority } : {}) };
};

const t1 = CATALOGUE_SEED.filter((e) => e.tier === 1 && !e.rankOnly).length;
const t2 = CATALOGUE_SEED.filter((e) => e.tier === 2 && !e.rankOnly).length;
const rank = CATALOGUE_SEED.filter((e) => e.rankOnly).length;
console.log(
  `${apply ? 'seeding' : 'WOULD seed'} ${CATALOGUE_SEED.length} entries ` +
    `(tier 1: ${t1}, tier 2: ${t2}, rank-only: ${rank})` +
    `${resetPriorities ? ' [RESET PRIORITIES]' : ''}`,
);
for (const e of CATALOGUE_SEED) {
  const f = finalEntry(e);
  const was = live.get(e.competitionId);
  const notes = [];
  if (!was) notes.push('NEW');
  if (was && was.tier !== e.tier) notes.push(`tier ${was.tier}→${e.tier}`);
  if (was && (was.priority ?? null) !== (f.priority ?? null)) {
    notes.push(`priority ${was.priority ?? '—'}→${f.priority ?? '—'}`);
  }
  if (was && typeof was.priority === 'number' && f.priority === was.priority && e.priority !== was.priority) {
    notes.push(`priority ${was.priority} KEPT (seed says ${e.priority ?? '—'})`);
  }
  if (!f.enabled && !e.rankOnly) notes.push('DISABLED, kept');
  console.log(
    `  ${e.rankOnly ? 'R ' : `T${e.tier}`} p=${String(f.priority ?? '—').padEnd(3)} ` +
      `${e.competitionId.padEnd(46)} ${e.label}${notes.length ? '  [' + notes.join('; ') + ']' : ''}`,
  );
}
const seedIds = new Set(CATALOGUE_SEED.map((e) => e.competitionId));
const stray = [...live.keys()].filter((id) => !seedIds.has(id));
if (stray.length > 0) {
  console.log(`  NOTE: ${stray.length} live doc(s) not in the seed (left untouched): ${stray.join(', ')}`);
}
if (!apply) process.exit(0);

let batch = db.batch();
let pending = 0;
for (const e of CATALOGUE_SEED) {
  const f = finalEntry(e);
  // set() without merge so a field the seed drops actually leaves the
  // doc — EXCEPT the two ops-owned fields finalEntry deliberately
  // carries forward (enabled always; priority unless
  // --reset-priorities, which is also the only way a live priority the
  // seed no longer sets gets removed).
  batch.set(db.collection('catalogue').doc(e.competitionId), f);
  if (++pending >= 450) {
    await batch.commit();
    batch = db.batch();
    pending = 0;
  }
}
if (pending > 0) await batch.commit();
console.log('seeded');
