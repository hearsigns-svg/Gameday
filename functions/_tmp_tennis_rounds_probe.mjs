import admin from 'firebase-admin';
admin.initializeApp({ projectId: 'gameday-fixtures' });
const db = admin.firestore();

const SLICES = ['tennis-wta-appearances', 'tennis-atp-appearances'];

for (const slice of SLICES) {
  const snap = await db
    .collection('fixtures')
    .where('competitionId', '==', slice)
    .get();
  console.log(`\n================ ${slice} : ${snap.size} docs ================`);
  if (snap.size === 0) continue;

  const fieldKeys = new Map();
  const roundTails = new Map();
  const withRoundField = [];
  const followKeyShapes = new Map();
  const parents = new Map();
  const slotFinals = [];
  const samples = [];

  for (const d of snap.docs) {
    const x = d.data();
    for (const k of Object.keys(x)) fieldKeys.set(k, (fieldKeys.get(k) ?? 0) + 1);
    if (x.round !== undefined || x.roundId !== undefined || x.roundName !== undefined) {
      withRoundField.push({ id: d.id, round: x.round, roundId: x.roundId, roundName: x.roundName });
    }
    const t = String(x.title ?? '');
    // ATP shape: "A vs B — Tournament, Round of 32"
    const comma = t.lastIndexOf(', ');
    const emdash = t.lastIndexOf(' — ');
    let tail = '(no round tail)';
    if (comma > emdash && emdash !== -1) tail = t.slice(comma + 2);
    else if (emdash !== -1) {
      const after = t.slice(emdash + 3);
      if (/ Final$/.test(after) || /^.* — Final$/.test(t)) tail = 'TITLE-ENDS-Final';
    }
    if (/ Final$/.test(t)) tail = 'ends with " Final"';
    roundTails.set(tail, (roundTails.get(tail) ?? 0) + 1);

    for (const k of x.followKeys ?? []) {
      const shape = k.startsWith('athlete_')
        ? 'athlete_*'
        : k.startsWith('tennis-t-') && k.endsWith('-finals')
          ? 'tennis-t-*-finals'
          : k.startsWith('tennis-t-')
            ? 'tennis-t-* (bare)'
            : k;
      followKeyShapes.set(shape, (followKeyShapes.get(shape) ?? 0) + 1);
    }
    if (x.parentFixtureId) parents.set(x.parentFixtureId, (parents.get(x.parentFixtureId) ?? 0) + 1);
    if (d.id.endsWith('-slot-final')) slotFinals.push({ id: d.id, title: x.title, followKeys: x.followKeys, startUtc: x.startUtc, timePrecision: x.timePrecision, confidence: x.confidence, status: x.status });
    if (samples.length < 8) samples.push({ id: d.id, title: x.title, followKeys: x.followKeys, startUtc: x.startUtc, timePrecision: x.timePrecision, confidence: x.confidence, athletes: x.athletes });
  }

  console.log('\n-- FIELD KEYS (count of docs carrying it) --');
  for (const [k, v] of [...fieldKeys].sort((a, b) => b[1] - a[1])) console.log(`   ${k}: ${v}`);

  console.log('\n-- structured round-ish fields (round/roundId/roundName) --');
  console.log(`   docs carrying any: ${withRoundField.length}`);
  for (const r of withRoundField.slice(0, 10)) console.log('   ', JSON.stringify(r));

  console.log('\n-- TITLE round tails --');
  for (const [k, v] of [...roundTails].sort((a, b) => b[1] - a[1])) console.log(`   ${JSON.stringify(k)}: ${v}`);

  console.log('\n-- followKey shapes --');
  for (const [k, v] of [...followKeyShapes].sort((a, b) => b[1] - a[1])) console.log(`   ${k}: ${v}`);

  console.log(`\n-- distinct parentFixtureId: ${parents.size} --`);
  for (const [k, v] of [...parents].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`   ${k}: ${v} docs`);

  console.log(`\n-- *-slot-final docs: ${slotFinals.length} --`);
  for (const s of slotFinals) console.log('   ', JSON.stringify(s));

  console.log('\n-- sample docs --');
  for (const s of samples) console.log('   ', JSON.stringify(s));
}

// parent slices for context
for (const c of ['tennis-wta', 'tennis-atp', 'tennis-ics']) {
  const snap = await db.collection('fixtures').where('competitionId', '==', c).get();
  console.log(`\n### parent slice ${c}: ${snap.size} docs`);
  for (const d of snap.docs.slice(0, 6)) {
    const x = d.data();
    console.log('   ', d.id, '|', x.title, '|', JSON.stringify(x.followKeys), '|', x.startUtc, x.durationHours);
  }
}
process.exit(0);
