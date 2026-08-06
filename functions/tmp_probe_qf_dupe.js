// TEMP read-only probe — delete after use.
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'gameday-fixtures' });
const db = admin.firestore();

const ATH = /^athlete_\d{6}$/;

(async () => {
  const snap = await db
    .collection('fixtures')
    .where('startUtc', '>=', '2026-01-01T00:00:00.000Z')
    .get();
  console.log('TOTAL fixtures startUtc>=2026-01-01:', snap.size);

  let withAth = 0;
  let athAndTennisT = 0;
  let athAndNonSliceOther = 0;
  const examplesBoth = [];
  const examplesAthOther = [];
  const sportCount = {};
  let tennisCount = 0;
  const tennisTKeyDocs = [];

  snap.forEach((d) => {
    const f = d.data();
    const keys = f.followKeys || [];
    sportCount[f.sport] = (sportCount[f.sport] || 0) + 1;
    const ath = keys.filter((k) => ATH.test(k));
    const tKeys = keys.filter((k) => k.startsWith('tennis-t-'));
    if (f.sport === 'tennis') {
      tennisCount++;
      if (tKeys.length) {
        tennisTKeyDocs.push({
          id: d.id,
          keys,
          parent: f.parentFixtureId || null,
          title: f.title,
          startUtc: f.startUtc,
        });
      }
    }
    if (ath.length) withAth++;
    if (ath.length && tKeys.length) {
      athAndTennisT++;
      if (examplesBoth.length < 10)
        examplesBoth.push({ id: d.id, keys, title: f.title, sport: f.sport });
    }
    // any non-athlete, non-appearance-slice key alongside an athlete key
    const others = keys.filter(
      (k) => !ATH.test(k) && !k.endsWith('-appearances'),
    );
    if (ath.length && others.length) {
      athAndNonSliceOther++;
      if (examplesAthOther.length < 15)
        examplesAthOther.push({
          id: d.id,
          sport: f.sport,
          keys,
          title: f.title,
        });
    }
  });

  console.log('sport counts:', sportCount);
  console.log('docs carrying >=1 athlete_ key:', withAth);
  console.log('docs carrying athlete_ AND tennis-t-*:', athAndTennisT);
  console.log('examples (athlete + tennis-t):', JSON.stringify(examplesBoth, null, 1));
  console.log(
    'docs carrying athlete_ AND a non-slice competition key:',
    athAndNonSliceOther,
  );
  console.log(
    'examples (athlete + other comp key):',
    JSON.stringify(examplesAthOther, null, 1),
  );
  console.log('tennis docs total:', tennisCount);
  console.log('tennis docs carrying a tennis-t-* key:', tennisTKeyDocs.length);
  console.log(
    'sample tennis-t docs:',
    JSON.stringify(tennisTKeyDocs.slice(0, 12), null, 1),
  );
  process.exit(0);
})().catch((e) => {
  console.error('PROBE FAILED:', e);
  process.exit(1);
});
