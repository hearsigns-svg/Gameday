// TEMP read-only probe — delete after use.
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'gameday-fixtures' });
const db = admin.firestore();

const norm = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

(async () => {
  const snap = await db.collection('fixtures').where('sport', '==', 'tennis').get();
  const apps = [];
  snap.forEach((d) => {
    const f = d.data();
    if (!f.parentFixtureId) return;
    apps.push({ id: d.id, title: f.title, startUtc: f.startUtc, keys: f.followKeys || [], parent: f.parentFixtureId, status: f.status });
  });
  // pair by parent + sorted normalised name pair parsed from title
  const byPair = new Map();
  let unparsed = 0;
  for (const a of apps) {
    const base = a.title.split(' — ')[0];
    const m = base.split(/\s+(?:vs\.?|v)\s+/i);
    if (m.length !== 2) { unparsed++; continue; }
    const key = `${a.parent}|${[norm(m[0]), norm(m[1])].sort().join('|')}`;
    byPair.set(key, [...(byPair.get(key) || []), a]);
  }
  let twins = 0;
  const ex = [];
  for (const [k, g] of byPair) {
    if (g.length > 1) {
      twins++;
      if (ex.length < 6) ex.push({ k, docs: g.map((x) => ({ id: x.id, title: x.title, startUtc: x.startUtc, keys: x.keys })) });
    }
  }
  console.log('tennis appearance docs:', apps.length, 'unparsed titles:', unparsed);
  console.log('distinct parent+pair groups:', byPair.size);
  console.log('groups with TWO OR MORE docs for the same match (per-player twins):', twins);
  console.log(JSON.stringify(ex, null, 1));

  // The finals-slot docs in full
  const finals = apps.filter((a) => a.keys.some((k) => k.endsWith('-finals')));
  console.log('FINALS SLOT DOCS:', JSON.stringify(finals, null, 1));
  process.exit(0);
})().catch((e) => { console.error('PROBE FAILED:', e); process.exit(1); });
