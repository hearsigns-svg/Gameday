import admin from 'firebase-admin';
admin.initializeApp({ projectId: 'gameday-fixtures' });
const db = admin.firestore();
const all = await db.collection('sourceRuns').get();
console.log('sourceRuns total:', all.size);
console.log('sample doc:', JSON.stringify(all.docs[0].data()).slice(0,800));
const bySource = new Map();
for (const d of all.docs) {
  const x=d.data();
  const k = x.source ?? x.sourceId ?? x.followKey ?? x.slice ?? '(?)';
  bySource.set(k,(bySource.get(k)??0)+1);
}
console.log('by source key:', [...bySource.entries()].sort((a,b)=>b[1]-a[1]).slice(0,25));
// newest atp sheet runs
const atpRuns = all.docs.map(d=>d.data()).filter(x=>JSON.stringify(x).includes('atp-sheet'))
  .sort((a,b)=>String(b.at??b.startedAt??b.finishedAt??'').localeCompare(String(a.at??a.startedAt??a.finishedAt??'')));
console.log('\natp-sheet runs:', atpRuns.length);
for (const r of atpRuns.slice(0,3)) console.log(JSON.stringify(r).slice(0,1500), '\n---');
process.exit(0);
