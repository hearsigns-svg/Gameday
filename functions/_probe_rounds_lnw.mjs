import admin from 'firebase-admin';
admin.initializeApp({ projectId: 'gameday-fixtures' });
const db = admin.firestore();

const SLICES = ['tennis-wta-appearances', 'tennis-atp-appearances'];

const ROUND_WORDS =
  /(round of \d+|quarter[- ]?final|semi[- ]?final|final|qualif|r\d{1,3}\b|last \d+)/i;

for (const slice of SLICES) {
  const snap = await db
    .collection('fixtures')
    .where('competitionId', '==', slice)
    .get();
  console.log(`\n===== ${slice}: ${snap.size} docs =====`);
  if (snap.size === 0) continue;

  const fieldCounts = new Map();
  const tails = new Map();
  const roundFieldDocs = [];
  const sampleTitles = [];
  const followKeySuffix = new Map();
  const parentIds = new Set();
  const statusCounts = new Map();
  const idShapes = new Map();

  for (const d of snap.docs) {
    const x = d.data();
    for (const k of Object.keys(x)) fieldCounts.set(k, (fieldCounts.get(k) ?? 0) + 1);
    if (
      x.round !== undefined ||
      x.roundId !== undefined ||
      x.roundName !== undefined ||
      x.stage !== undefined
    ) {
      roundFieldDocs.push({ id: d.id, round: x.round, roundId: x.roundId, roundName: x.roundName, stage: x.stage });
    }
    const t = String(x.title ?? '');
    // Tail after the LAST comma if there is one, else the last em-dash segment
    let tail = null;
    const ci = t.lastIndexOf(', ');
    if (ci !== -1) tail = t.slice(ci + 2);
    if (tail === null || !ROUND_WORDS.test(tail)) {
      const parts = t.split(' — ');
      const last = parts[parts.length - 1];
      tail = ROUND_WORDS.test(last) ? `[em-dash tail] ${last}` : '(NO ROUND INFO IN TITLE)';
    }
    tails.set(tail, (tails.get(tail) ?? 0) + 1);
    if (sampleTitles.length < 12) sampleTitles.push(`${d.id}  ::  ${t}`);
    for (const k of x.followKeys ?? []) {
      followKeySuffix.set(k, (followKeySuffix.get(k) ?? 0) + 1);
    }
    if (x.parentFixtureId) parentIds.add(x.parentFixtureId);
    statusCounts.set(x.status, (statusCounts.get(x.status) ?? 0) + 1);
    const shape = /-slot-final$/.test(d.id) ? 'slot-final' : 'appearance';
    idShapes.set(shape, (idShapes.get(shape) ?? 0) + 1);
  }

  console.log('field presence:', [...fieldCounts.entries()].sort((a, b) => b[1] - a[1]));
  console.log('doc id shapes:', [...idShapes.entries()]);
  console.log('status:', [...statusCounts.entries()]);
  console.log('docs with an explicit round/roundId/roundName/stage FIELD:', roundFieldDocs.length);
  if (roundFieldDocs.length) console.log(roundFieldDocs.slice(0, 10));
  console.log('\ntitle round-tail histogram:');
  for (const [k, v] of [...tails.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(4)}  ${k}`);
  }
  console.log('\ndistinct followKeys (count):');
  for (const [k, v] of [...followKeySuffix.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
    console.log(`  ${String(v).padStart(4)}  ${k}`);
  }
  console.log('\nparents referenced:', parentIds.size, [...parentIds].slice(0, 12));
  console.log('\nsample titles:');
  for (const s of sampleTitles) console.log('  ', s);
}

// Also: are there any *-finals followKeys anywhere in the fixtures collection?
const finalsScoped = await db
  .collection('fixtures')
  .where('followKeys', 'array-contains-any', [
    'tennis-t-wimbledon-finals',
    'tennis-t-us-open-finals',
    'tennis-t-cincinnati-finals',
  ])
  .get()
  .catch((e) => ({ size: -1, docs: [], err: String(e) }));
console.log('\n===== sample finals-scoped probe:', finalsScoped.size, finalsScoped.err ?? '');
for (const d of finalsScoped.docs ?? []) {
  console.log('  ', d.id, JSON.stringify(d.data().followKeys), d.data().title, d.data().confidence);
}

process.exit(0);
