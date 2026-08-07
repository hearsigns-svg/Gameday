// Seed catalogue entries that exist in CATALOGUE_SEED but not in Firestore.
//
// ADD-ONLY, DELIBERATELY. `catalogue.ts` says the collection is
// "ops-editable afterwards: `enabled: false` cools a path without a
// deploy", and `priority` / `priorityByRegion` are documented as tunable
// in the console. A seeder that reconciled every field would silently
// undo that tuning on its next run — the same shape as AGENTS rule 13,
// where a scheduled job quietly reverts an applied change and nothing
// fails. So this only ever CREATES what is missing. It never updates and
// never deletes.
//
// Why this exists at all: the sweep reads its worklist from the
// `catalogue` COLLECTION (sweep.ts::loadCataloguePaths), not from the
// seed array. Adding an entry to the code therefore does nothing on its
// own — a connector can be deployed, tested and green while the sweep has
// no idea it exists. That is how boxingdata-cards shipped inert.
//
//   node scripts/seed-catalogue.mjs            # dry run, prints the diff
//   node scripts/seed-catalogue.mjs --apply    # creates the missing docs
//
// Run from functions/ so firebase-admin resolves.

// Both of these live under functions/, and Node resolves bare specifiers
// from the IMPORTING FILE's directory — which for a script in scripts/
// walks past functions/node_modules entirely. Resolving from
// functions/package.json is what lets this script stay where AGENTS says
// it lives instead of being copied in beside its dependencies.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
const { CATALOGUE_SEED } = require('./lib/catalogue.js');

const apply = process.argv.includes('--apply');
// Seed ONE entry rather than every missing one. The seed array and the
// live collection drift apart legitimately — 57 Olympic ordering rows
// were missing when this was written, and creating them would have
// changed browse weights nobody asked to change — so the default is to
// report the difference and let the caller name what to add.
const onlyArg = process.argv.find((a) => a.startsWith('--id='));
const only = onlyArg ? onlyArg.slice('--id='.length) : null;
admin.initializeApp({ projectId: 'gameday-fixtures' });
const db = admin.firestore();

const snap = await db.collection('catalogue').get();
// A read failure must not look like an empty collection: seeding into
// what appears to be a blank catalogue would recreate 81 docs and wipe
// every ops edit on them.
if (snap.empty) {
  console.error(
    'ABORT: catalogue collection read as empty. That is either a real ' +
      'wipe or a failed read, and this script cannot tell them apart. ' +
      'Investigate before seeding.',
  );
  process.exit(2);
}

const live = new Map(snap.docs.map((d) => [d.id, d.data()]));
console.log(`live catalogue: ${live.size} docs`);
console.log(`seed in code   : ${CATALOGUE_SEED.length} entries\n`);

const allMissing = CATALOGUE_SEED.filter((e) => !live.has(e.competitionId));
const missing = only
  ? allMissing.filter((e) => e.competitionId === only)
  : allMissing;
if (only) {
  console.log(`--id=${only}: ${missing.length} of ${allMissing.length} missing entries selected\n`);
  if (missing.length === 0 && live.has(only)) {
    console.log(`${only} is already in Firestore. Nothing to do.`);
    process.exit(0);
  }
}
// Counted against ALL missing, not the filtered selection — the filter
// narrows what gets WRITTEN, not what is true of the collection.
console.log(`already present : ${CATALOGUE_SEED.length - allMissing.length}`);
console.log(`missing overall : ${allMissing.length}`);
console.log(`to write now    : ${missing.length}\n`);

for (const e of missing) {
  console.log(`  + ${e.competitionId}`);
  console.log(`      ${JSON.stringify(e)}`);
}

// Entries live in Firestore but NOT in the seed are reported, never
// removed — an ops-added row is legitimate and this script does not own
// the collection.
const extra = [...live.keys()].filter(
  (id) => !CATALOGUE_SEED.some((e) => e.competitionId === id),
);
if (extra.length) {
  console.log(`\nin Firestore but not in the seed (left alone): ${extra.length}`);
  for (const id of extra.slice(0, 10)) console.log(`  · ${id}`);
}

if (!apply) {
  console.log('\nDRY RUN — nothing written. Re-run with --apply.');
  process.exit(0);
}
if (missing.length === 0) {
  console.log('\nNothing to do.');
  process.exit(0);
}

const batch = db.batch();
for (const e of missing) {
  batch.set(db.collection('catalogue').doc(e.competitionId), e);
}
await batch.commit();
console.log(`\nAPPLIED: created ${missing.length} document(s).`);

// Read back, because a write that reports success and a document that
// exists are different claims.
for (const e of missing) {
  const d = await db.collection('catalogue').doc(e.competitionId).get();
  console.log(`  ${d.exists ? 'OK ' : 'MISSING '} ${e.competitionId}: ${JSON.stringify(d.data())}`);
}
process.exit(0);
