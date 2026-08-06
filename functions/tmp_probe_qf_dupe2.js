// TEMP read-only probe — delete after use.
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'gameday-fixtures' });
const db = admin.firestore();
const ATH = /^athlete_\d{6}$/;

(async () => {
  const snap = await db.collection('fixtures').where('sport', '==', 'tennis').get();
  console.log('ALL tennis fixture docs (no date bound):', snap.size);

  const parents = [];
  const apps = [];
  const finalsSlots = [];
  snap.forEach((d) => {
    const f = d.data();
    const rec = {
      id: d.id,
      title: f.title,
      startUtc: f.startUtc,
      keys: f.followKeys || [],
      parent: f.parentFixtureId || null,
      competitionId: f.competitionId,
      athletes: f.athletes || null,
      timePrecision: f.timePrecision,
      confidence: f.confidence,
      status: f.status,
    };
    if (f.parentFixtureId) {
      apps.push(rec);
      if ((f.followKeys || []).some((k) => k.endsWith('-finals'))) finalsSlots.push(rec);
    } else parents.push(rec);
  });
  console.log('tennis PARENTS (no parentFixtureId):', parents.length);
  console.log('tennis APPEARANCES (parentFixtureId set):', apps.length);
  console.log('  of which finals-slot docs:', finalsSlots.length);

  // key shape census across appearances
  const shapes = {};
  for (const a of apps) {
    const shape = a.keys
      .map((k) => (ATH.test(k) ? 'athlete_*' : k.endsWith('-appearances') ? '<slice>-appearances' : k.startsWith('tennis-t-') ? (k.endsWith('-finals') ? 'tennis-t-*-finals' : 'tennis-t-*') : k))
      .sort()
      .join(' + ');
    shapes[shape] = (shapes[shape] || 0) + 1;
  }
  console.log('APPEARANCE followKeys shapes:', shapes);

  const pshapes = {};
  for (const p of parents) {
    const shape = p.keys
      .map((k) => (ATH.test(k) ? 'athlete_*' : k.startsWith('tennis-t-') ? 'tennis-t-*' : k))
      .sort()
      .join(' + ');
    pshapes[shape] = (pshapes[shape] || 0) + 1;
  }
  console.log('PARENT followKeys shapes:', pshapes);

  // Wimbledon specifically
  const wimb = [...parents, ...apps].filter(
    (r) => /wimbledon/i.test(r.title) || r.keys.some((k) => /wimbledon/i.test(k)),
  );
  console.log('Wimbledon-matching docs:', wimb.length);
  console.log(JSON.stringify(wimb.slice(0, 20), null, 1));

  // Sample live appearances with athlete keys + their sibling structure
  const withAth = apps.filter((a) => a.keys.some((k) => ATH.test(k)));
  console.log('tennis appearances carrying an athlete_ key:', withAth.length);
  console.log('sample:', JSON.stringify(withAth.slice(0, 6), null, 1));

  // Same-match twins: two appearance docs under one parent whose athletes
  // sets are the same pair
  const byParent = new Map();
  for (const a of apps) {
    byParent.set(a.parent, [...(byParent.get(a.parent) || []), a]);
  }
  let twinGroups = 0;
  const twinExamples = [];
  for (const [pid, group] of byParent) {
    const seen = new Map();
    for (const a of group) {
      const names = (a.athletes || []).map((n) => n.toLowerCase()).sort().join('|');
      if (!names || (a.athletes || []).length !== 2) continue;
      seen.set(names, [...(seen.get(names) || []), a]);
    }
    for (const [names, g] of seen) {
      if (g.length > 1) {
        twinGroups++;
        if (twinExamples.length < 5) twinExamples.push({ pid, names, docs: g.map((x) => ({ id: x.id, keys: x.keys, startUtc: x.startUtc, title: x.title })) });
      }
    }
  }
  console.log('parent groups with >1 doc for the SAME athlete pair:', twinGroups);
  console.log(JSON.stringify(twinExamples, null, 1));
  process.exit(0);
})().catch((e) => { console.error('PROBE FAILED:', e); process.exit(1); });
