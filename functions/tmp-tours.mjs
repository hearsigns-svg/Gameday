import admin from 'firebase-admin';
admin.initializeApp({ projectId: 'gameday-fixtures' });
const db=admin.firestore();
const norm=(t)=>String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,'-');
const R=(await db.collection('fixtures').where('sport','==','tennis').get()).docs.map(d=>d.data()).filter(f=>f.competitionId==='tennis-atp'||f.competitionId==='tennis-wta');
const m=new Map();
for(const f of R){const k=norm(f.title);const e=m.get(k)??{tours:new Set(),eds:[]};e.tours.add(f.competitionId==='tennis-wta'?'wta':'atp');e.eds.push(f.startUtc.slice(0,10));m.set(k,e);}
const slams=['wimbledon','us-open','roland-garros','australian-open'];
console.log('ALL-TIME tour evidence for the four slams:');
for(const s of slams){const e=m.get(s);console.log(' ',s.padEnd(18), e?[...e.tours].join('+'):'ABSENT', e?`editions=${[...new Set(e.eds)].sort().join(',')}`:'');}
const both=[...m.entries()].filter(([,e])=>e.tours.size===2);
console.log('\nkeys with BOTH tours anywhere in the store:', both.length);
for(const [k,e] of both) console.log('  ', k.padEnd(46), [...new Set(e.eds)].sort().join(','));
const atpOnly=[...m.entries()].filter(([,e])=>e.tours.size===1&&e.tours.has('atp'));
console.log('\natp-only keys:', atpOnly.length, ' wta-only keys:', [...m.entries()].filter(([,e])=>e.tours.size===1&&e.tours.has('wta')).length);
process.exit(0);
