// One-shot F1 id-scheme migration (Prompt 6) — run AFTER deploying the
// circuitId-based adapter, or the very next poll re-mints what this
// removes.
//
// Deletes every FUTURE-dated old-scheme F1 doc (`f1-<season>-r<round>-…`,
// 64 measured on 2026-08-02, the four F3 orphans among them) and writes
// one cancelled change record per doc so the sweep fans the correction
// out. The next pollF1 ingests the same sessions under stable circuit
// ids; on each follower's device the old events delete and the new ones
// create through the ordinary ledger path — replaced, never orphaned.
// Reminders users set on the old events do not carry over.
//
// Past old-scheme docs are KEPT: their calendar events are frozen by the
// horizon rule and cache history costs nothing.
//
// Usage (from functions/): node scripts/clear-f1-legacy.mjs [--apply]
// Without --apply it prints what it would do.

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const apply = process.argv.includes('--apply');
initializeApp({ credential: applicationDefault(), projectId: 'gameday-fixtures' });
const db = getFirestore();
const now = new Date().toISOString();

const snap = await db.collection('fixtures').get();
const doomed = snap.docs
  .map((d) => d.data())
  .filter((f) => /^f1-\d{4}-r\d+-/.test(f.id) && f.startUtc >= now);

console.log(`${apply ? 'deleting' : 'WOULD delete'} ${doomed.length} future old-scheme F1 docs`);
for (const f of doomed) console.log(`  ${f.id}  ${f.startUtc}  ${f.title}`);
if (!apply) process.exit(0);

let batch = db.batch();
let pending = 0;
const flush = async () => {
  if (pending > 0) {
    await batch.commit();
    batch = db.batch();
    pending = 0;
  }
};
for (const f of doomed) {
  batch.delete(db.collection('fixtures').doc(f.id));
  if (++pending >= 450) await flush();
  batch.set(db.collection('fixtureChanges').doc(), {
    kind: 'status_changed',
    fixtureId: f.id,
    prevStatus: f.status,
    newStatus: 'cancelled',
    at: now,
    followKeys: f.followKeys ?? [],
  });
  if (++pending >= 450) await flush();
}
await flush();
console.log('done — trigger pollF1 (or wait for the sweep) to mint the circuit-id docs');
