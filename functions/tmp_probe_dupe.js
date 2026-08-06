// TEMP read-only probe — delete after use.
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'gameday-fixtures' });
const db = admin.firestore();

const ATH = /^athlete_\d{6}$/;
// Competition/slice-ish keys we care about
const isTennisT = (k) => k.startsWith('tennis-t-');
const isApp = (k) => k.endsWith('-appearances');

(async () => {
  const now = new Date().toISOString();
  const snap = await db.collection('fixtures').where('startUtc', '>=', '2026-07-01T00:00:00.000Z').get();
  console.log('TOTAL fixtures fetched (startUtc >= 2026-07-01):', snap.size);

  let bothAthleteAndComp = [];
  let bothAthleteAndTennisT = [];
  const bySport = {};
  let tennisTotal = 0;
  const tennisParents = [];
  const tennisAppearances = [];
  let withAthleteKey = 0;

  snap.forEach((d) => {
    const f = d.data();
    const keys = f.followKeys || [];
    const ath = keys.filter((k) => ATH.test(k));
    bySport[f.sport] = (bySport[f.sport] || 0) + 1;
    if (ath.length) withAthleteKey++;
    // "competition key" = any key that is not an athlete key and not an
    // -appearances slice key
    const comp = keys.filter((k) => !ATH.test(k) && !isApp(k));
    if (ath.length && comp.length) {
      bothAthleteAndComp.push({ id: d.id, sport: f.sport, keys, title: f.title, parent: f.parentFixtureId || null });
    }
    if (ath.length && keys.some(isTennisT)) {
      bothAthleteAndTennisT.push({ id: d.id, keys, title: f.title });
    }
    if (f.sport === 'tennis') {
      tennisTotal++;
      if (f.parentFixtureId) tennisAppearances.push({ id: d.id, keys, title: f.title, start: f.startUtc, prec: f.timePrecision, conf: f.confidence, athletes: f.athletes || null });
      else tennisParents.push({ id: d.id, keys, title: f.title, start: f.startUtc, dur: f.durationHours, prec: f.timePrecision });
    }
  });

  console.log('\nBY SPORT:', bySport);
  console.log('docs carrying >=1 athlete_* key:', withAthleteKey);
  console.log('\n--- docs carrying BOTH athlete_* AND a non-appearance (competition) key:', bothAthleteAndComp.length);
  bothAthleteAndComp.slice(0, 30).forEach((r) => console.log('  ', r.sport, r.id, JSON.stringify(r.keys), '|', r.title));
  console.log('\n--- docs carrying BOTH athlete_* AND tennis-t-*:', bothAthleteAndTennisT.length);
  bothAthleteAndTennisT.slice(0, 20).forEach((r) => console.log('  ', r.id, JSON.stringify(r.keys)));

  console.log('\nTENNIS total:', tennisTotal, 'parents:', tennisParents.length, 'appearances:', tennisAppearances.length);
  console.log('\nTENNIS PARENTS (first 15):');
  tennisParents.slice(0, 15).forEach((p) => console.log('  ', p.id, '|', p.title, '|', p.start, 'dur', p.dur, p.prec, JSON.stringify(p.keys)));
  console.log('\nTENNIS APPEARANCES (first 25):');
  tennisAppearances.slice(0, 25).forEach((p) => console.log('  ', p.id, '|', p.title, '|', p.start, p.prec, p.conf, 'athletes', JSON.stringify(p.athletes), JSON.stringify(p.keys)));

  // How many distinct athlete keys per tennis appearance doc?
  const distr = {};
  tennisAppearances.forEach((a) => {
    const n = a.keys.filter((k) => ATH.test(k)).length;
    distr[n] = (distr[n] || 0) + 1;
  });
  console.log('\nathlete-key count distribution on TENNIS appearance docs:', distr);

  // slot-final docs
  const slots = tennisAppearances.filter((a) => a.id.endsWith('-slot-final'));
  console.log('\ntennis -slot-final docs:', slots.length);
  slots.forEach((s) => console.log('  ', s.id, JSON.stringify(s.keys), s.title, s.start, s.prec, s.conf));

  process.exit(0);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
