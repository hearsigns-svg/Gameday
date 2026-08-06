// TEMP read-only probe 3 — delete after use.
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'gameday-fixtures' });
const db = admin.firestore();

(async () => {
  const one = await db.collection('athletes').limit(1).get();
  one.forEach((d) => console.log('athlete doc shape:', d.id, JSON.stringify(d.data())));

  const ath = await db.collection('athletes').where('sport', '==', 'tennis').get();
  const names = [];
  ath.forEach((d) => { const a = d.data(); names.push(`${d.id} :: ${a.displayName || a.fullName || a.name || '(no name field)'} :: ${a.grouping || ''}`); });
  console.log('\ntennis athletes:', ath.size);
  console.log(names.filter((n) => /alcaraz|sinner|djokovic|federer/i.test(n)).join('\n') || '(no ATP marquee names found)');
  const groupings = {};
  ath.forEach((d) => { const g = d.data().grouping || '(none)'; groupings[g] = (groupings[g] || 0) + 1; });
  console.log('tennis athlete groupings:', groupings);

  const snap = await db.collection('fixtures').where('startUtc', '>=', '2026-07-01T00:00:00.000Z').get();
  const all = [];
  snap.forEach((d) => all.push({ id: d.id, ...d.data() }));
  const atpApps = all.filter((f) => f.sport === 'tennis' && f.parentFixtureId && f.id.startsWith('tennis-'));
  console.log('\nATP/ICS-side tennis appearance docs:', atpApps.length);
  atpApps.slice(0, 30).forEach((a) => console.log('  ', a.id, '|', a.title, '|', a.startUtc, a.timePrecision, a.confidence, JSON.stringify(a.followKeys)));

  // combat: any doc carrying BOTH a canonical athlete key AND a card-level competition key
  const ATHC = /^athlete_\d{6}$/;
  const combat = all.filter((f) => f.sport === 'boxing' || f.sport === 'ufc');
  const cardKeys = new Set(['tsdb-league-4445', 'pbc-cards', 'tsdb-league-4443']);
  const both = combat.filter((f) => (f.followKeys || []).some((k) => ATHC.test(k)) && (f.followKeys || []).some((k) => cardKeys.has(k)));
  console.log('\ncombat docs carrying BOTH a canonical athlete key AND a card competition key:', both.length, 'of', combat.length, 'combat docs');
  const parentKeys = {};
  combat.filter((f) => !f.parentFixtureId).forEach((f) => (f.followKeys || []).forEach((k) => (parentKeys[k] = (parentKeys[k] || 0) + 1)));
  console.log('combat PARENT followKeys histogram:', parentKeys);

  process.exit(0);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
