import admin from 'firebase-admin';
admin.initializeApp({ projectId: 'gameday-fixtures' });
const db = admin.firestore();
const snap = await db.collection('fixtures').where('competitionId','==','tennis-wta-appearances').get();
for (const d of snap.docs) {
  if (/-slot-final$/.test(d.id) || / Final$/.test(String(d.data().title))) {
    console.log(JSON.stringify({id:d.id, ...d.data()}, null, 1));
  }
}
// any followKey ending in -finals anywhere
const all = await db.collection('fixtures').where('sport','==','tennis').get();
console.log('\ntennis fixtures total:', all.size);
const byComp = new Map(); const finalsKeys = new Map();
for (const d of all.docs) {
  const x = d.data();
  byComp.set(x.competitionId, (byComp.get(x.competitionId)??0)+1);
  for (const k of x.followKeys ?? []) if (String(k).endsWith('-finals')) finalsKeys.set(k,(finalsKeys.get(k)??0)+1);
}
console.log('by competitionId:', [...byComp.entries()].sort((a,b)=>b[1]-a[1]));
console.log('followKeys ending -finals:', [...finalsKeys.entries()]);
process.exit(0);
