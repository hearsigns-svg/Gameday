// TEMP read-only probe 4 — delete after use.
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'gameday-fixtures' });
const db = admin.firestore();

(async () => {
  // Wimbledon anywhere in the store?
  const snap = await db.collection('fixtures').get();
  let total = 0;
  const wimb = [];
  const alcaraz = [];
  snap.forEach((d) => {
    total++;
    const f = d.data();
    if (/wimbledon/i.test(f.title || '') || (f.followKeys || []).some((k) => /wimbledon/i.test(k))) {
      wimb.push({ id: d.id, title: f.title, start: f.startUtc, keys: f.followKeys, parent: f.parentFixtureId || null });
    }
    if ((f.followKeys || []).includes('athlete_001060') || /alcaraz/i.test(f.title || '')) {
      alcaraz.push({ id: d.id, title: f.title, start: f.startUtc, keys: f.followKeys, parent: f.parentFixtureId || null, prec: f.timePrecision });
    }
  });
  console.log('TOTAL fixtures in collection:', total);
  console.log('\nWimbledon docs:', wimb.length);
  wimb.forEach((w) => console.log('  ', w.id, '|', w.title, '|', w.start, JSON.stringify(w.keys), 'parent', w.parent));
  console.log('\nAlcaraz docs (key athlete_001060 or title):', alcaraz.length);
  alcaraz.forEach((w) => console.log('  ', w.id, '|', w.title, '|', w.start, w.prec, JSON.stringify(w.keys), 'parent', w.parent));

  // exhaustive: ANY doc with both an athlete key and a tennis-t-* key, whole collection
  const ATH = /^athlete_\d{6}$/;
  let bothTennis = 0, bothAny = 0, f1Both = 0;
  const bothAnySports = {};
  snap.forEach((d) => {
    const ks = d.data().followKeys || [];
    const hasAth = ks.some((k) => ATH.test(k) || k.startsWith('athlete-'));
    if (!hasAth) return;
    if (ks.some((k) => k.startsWith('tennis-t-'))) bothTennis++;
    const comp = ks.filter((k) => !k.startsWith('athlete') && !k.endsWith('-appearances') && !k.endsWith('-main') && !k.endsWith('-finals') && !k.endsWith('-final'));
    if (comp.length) { bothAny++; bothAnySports[d.data().sport] = (bothAnySports[d.data().sport] || 0) + 1; if (d.data().sport === 'f1') f1Both++; }
  });
  console.log('\nWHOLE COLLECTION — docs with athlete key AND tennis-t-* key:', bothTennis);
  console.log('WHOLE COLLECTION — docs with athlete key AND a plain competition/series key:', bothAny, bothAnySports);

  process.exit(0);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
