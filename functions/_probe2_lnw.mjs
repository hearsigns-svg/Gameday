import admin from 'firebase-admin';
admin.initializeApp({ projectId: 'gameday-fixtures' });
const db = admin.firestore();

// 1. the -finals followKey collision check
const f = await db.collection('fixtures').where('followKeys','array-contains','tennis-t-nitto-atp-finals').get();
console.log('docs carrying tennis-t-nitto-atp-finals:', f.size);
for (const d of f.docs) console.log('  ', d.id, '|', d.data().competitionId, '|', d.data().title, '|', d.data().startUtc);

// 2. ATP appearance detail: distinct matches, times, confidence
const atp = await db.collection('fixtures').where('competitionId','==','tennis-atp-appearances').get();
const pairs = new Set(); const conf = new Map(); const prec = new Map(); const days = new Map();
for (const d of atp.docs) {
  const x = d.data();
  const t = String(x.title);
  const names = t.split(' — ')[0].split(' vs ');
  pairs.add(names.slice().sort().join(' | '));
  conf.set(x.confidence,(conf.get(x.confidence)??0)+1);
  prec.set(x.timePrecision,(prec.get(x.timePrecision)??0)+1);
  days.set(String(x.startUtc).slice(0,10),(days.get(String(x.startUtc).slice(0,10))??0)+1);
}
console.log('\nATP distinct matches:', pairs.size, 'confidence:', [...conf], 'precision:', [...prec]);
console.log('ATP start days:', [...days.entries()].sort());

// 3. sourceRuns for the sheet + wta
for (const slice of ['tennis-atp-sheet','tennis-wta']) {
  const q = await db.collection('sourceRuns').where('followKey','==',slice).orderBy('at','desc').limit(3).get().catch(async e=>{
    return await db.collection('sourceRuns').limit(0).get();
  });
  console.log(`\nsourceRuns ${slice}: ${q.size}`);
  for (const d of q.docs) {
    const x=d.data();
    console.log('  ', d.id, JSON.stringify({at:x.at, rawCount:x.rawCount, ok:x.ok, appearances:x.appearances, skipped:x.skipped}).slice(0,500));
  }
}
process.exit(0);
