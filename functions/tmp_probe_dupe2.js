// TEMP read-only probe 2 — delete after use.
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'gameday-fixtures' });
const db = admin.firestore();
const ATHC = /^athlete_\d{6}$/;

(async () => {
  const snap = await db.collection('fixtures').where('startUtc', '>=', '2026-07-01T00:00:00.000Z').get();
  const all = [];
  snap.forEach((d) => all.push({ id: d.id, ...d.data() }));

  const tennis = all.filter((f) => f.sport === 'tennis');
  const apps = tennis.filter((f) => f.parentFixtureId);
  // provider prefix of tennis appearances
  const prov = {};
  apps.forEach((a) => { const p = a.id.split('-')[0]; prov[p] = (prov[p] || 0) + 1; });
  console.log('tennis appearance provider prefixes:', prov);

  // MIRRORED PAIRS: same parent, same startUtc, titles that are A vs B / B vs A
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const pairOf = (f) => {
    const base = (f.title || '').split(' — ')[0];
    const m = base.split(/\s+(?:vs\.?|v)\s+/i).map(norm);
    return m.length === 2 && m[0] && m[1] ? [...m].sort().join('|') : null;
  };
  const groups = new Map();
  for (const a of apps) {
    const p = pairOf(a);
    if (!p) continue;
    const k = `${a.parentFixtureId}|${p}`;
    groups.set(k, [...(groups.get(k) || []), a]);
  }
  const dupes = [...groups.entries()].filter(([, v]) => v.length > 1);
  console.log('\nTENNIS mirrored-appearance groups (same parent + same normalised pair):', dupes.length);
  console.log('  total docs inside those groups:', dupes.reduce((n, [, v]) => n + v.length, 0));
  let sameStart = 0;
  dupes.slice(0, 12).forEach(([k, v]) => {
    const starts = new Set(v.map((x) => x.startUtc));
    if (starts.size === 1) sameStart++;
    console.log('  ', k);
    v.forEach((x) => console.log('      ', x.id, '|', x.startUtc, x.timePrecision, x.confidence, JSON.stringify(x.followKeys)));
  });
  const allSameStart = dupes.filter(([, v]) => new Set(v.map((x) => x.startUtc)).size === 1).length;
  console.log('  groups whose members share an IDENTICAL startUtc:', allSameStart, 'of', dupes.length);

  // athlete key SHAPES across the whole store
  const shapes = {};
  all.forEach((f) => (f.followKeys || []).forEach((k) => {
    if (ATHC.test(k)) shapes.canonical = (shapes.canonical || 0) + 1;
    else if (k.startsWith('athlete')) shapes[k.startsWith('athlete-') ? 'slug(athlete-...)' : 'other'] = (shapes[k.startsWith('athlete-') ? 'slug(athlete-...)' : 'other'] || 0) + 1;
  }));
  console.log('\nathlete follow-key shapes across all fetched fixtures:', shapes);

  // Wimbledon / any tennis-t- key present?
  const tkeys = new Set();
  tennis.forEach((f) => (f.followKeys || []).forEach((k) => { if (k.startsWith('tennis-t-')) tkeys.add(k); }));
  console.log('\ndistinct tennis-t-* keys in window:', tkeys.size);
  console.log([...tkeys].sort().join('\n'));

  // athletes directory: tennis
  const ath = await db.collection('athletes').where('sport', '==', 'tennis').get();
  let atp = 0, wta = 0, other = 0;
  const sample = [];
  ath.forEach((d) => {
    const a = d.data();
    const g = a.grouping || a.groupingKey || '';
    if (String(g).includes('atp')) atp++; else if (String(g).includes('wta')) wta++; else other++;
    if (sample.length < 8) sample.push({ id: d.id, name: a.name, grouping: g });
  });
  console.log('\nathletes(sport=tennis):', ath.size, '{atp-ish:', atp, 'wta-ish:', wta, 'other:', other, '}');
  console.log('sample:', JSON.stringify(sample, null, 1));

  // Alcaraz specifically
  const alc = [];
  ath.forEach((d) => { const a = d.data(); if (/alcaraz/i.test(a.name || '')) alc.push({ id: d.id, ...a }); });
  console.log('\nAlcaraz in athletes:', JSON.stringify(alc));

  // F1 shape: one doc, many keys
  const f1 = all.filter((f) => f.sport === 'f1');
  const f1WithBoth = f1.filter((f) => (f.followKeys || []).includes('f1-series-1') && (f.followKeys || []).some((k) => ATHC.test(k)));
  console.log('\nF1 docs carrying f1-series-1 AND >=1 canonical athlete key:', f1WithBoth.length, 'of', f1.length);

  // How many docs carry a REAL followable competition key + athlete key,
  // excluding *-appearances and *-main scoped keys
  const isSliceish = (k) => k.endsWith('-appearances') || k.endsWith('-main') || k.endsWith('-finals') || k.endsWith('-final');
  const both = all.filter((f) => {
    const ks = f.followKeys || [];
    return ks.some((k) => ATHC.test(k) || k.startsWith('athlete-')) && ks.some((k) => !k.startsWith('athlete') && !isSliceish(k));
  });
  const bySport = {};
  both.forEach((f) => (bySport[f.sport] = (bySport[f.sport] || 0) + 1));
  console.log('\ndocs carrying an athlete key AND a plain (non-slice) competition/series key:', both.length, bySport);

  process.exit(0);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
