import admin from 'firebase-admin';
admin.initializeApp({ projectId: 'gameday-fixtures' });
const db = admin.firestore();

const all = await db.collection('fixtures').get();
console.log(`TOTAL fixtures docs: ${all.size}`);

const docs = all.docs.map((d) => ({ id: d.id, ...d.data() }));

const prec = (f) => {
  if (f.timePrecision) return f.timePrecision;
  return f.status === 'tbd' || f.status === 'postponed' ? 'date_only' : 'exact';
};
const spanDays = (h) => Math.max(1, Math.round((h ?? 2) / 24));

// 1. timePrecision distribution
const byPrec = {};
for (const f of docs) byPrec[prec(f)] = (byPrec[prec(f)] ?? 0) + 1;
console.log('timePrecision (resolved):', JSON.stringify(byPrec));

const rawPrec = {};
for (const f of docs)
  rawPrec[String(f.timePrecision)] = (rawPrec[String(f.timePrecision)] ?? 0) + 1;
console.log('timePrecision (raw field):', JSON.stringify(rawPrec));

// 2. multi-day date_only banners
const banners = docs.filter((f) => prec(f) === 'date_only' && spanDays(f.durationHours) > 1);
console.log(`\nMULTI-DAY date_only docs (span>1): ${banners.length}`);
const bySport = {};
const bySpan = {};
for (const f of banners) {
  bySport[f.sport] = (bySport[f.sport] ?? 0) + 1;
  const s = spanDays(f.durationHours);
  bySpan[s] = (bySpan[s] ?? 0) + 1;
}
console.log('  by sport:', JSON.stringify(bySport));
console.log('  by spanDays:', JSON.stringify(bySpan));

const withParent = banners.filter((f) => f.parentFixtureId);
console.log(`  of which are APPEARANCES (parentFixtureId set): ${withParent.length}`);
console.log(`  of which are PARENTS/standalone: ${banners.length - withParent.length}`);

console.log('\n-- 20 longest multi-day date_only PARENT docs --');
for (const f of banners
  .filter((x) => !x.parentFixtureId)
  .sort((a, b) => (b.durationHours ?? 0) - (a.durationHours ?? 0))
  .slice(0, 20)) {
  console.log(
    `  ${f.id} | ${f.sport} | comp=${f.competitionId} | ${f.startUtc} | dur=${f.durationHours} (${spanDays(f.durationHours)}d) | prec=${f.timePrecision} | conf=${f.confidence} | status=${f.status} | fk=${JSON.stringify(f.followKeys)} | "${f.title}"`,
  );
}

console.log('\n-- multi-day date_only APPEARANCE docs (sample 15) --');
for (const f of withParent.slice(0, 15)) {
  console.log(
    `  ${f.id} | ${f.sport} | ${f.startUtc} | dur=${f.durationHours} (${spanDays(f.durationHours)}d) | prec=${f.timePrecision} | conf=${f.confidence} | parent=${f.parentFixtureId} | athletes=${JSON.stringify(f.athletes)} | "${f.title}"`,
  );
}

// 3. Wimbledon specifically
console.log('\n=== Wimbledon docs ===');
for (const f of docs.filter(
  (x) => /wimbledon/i.test(x.id) || /wimbledon/i.test(x.title ?? ''),
)) {
  console.log(
    `  ${f.id} | comp=${f.competitionId} | ${f.startUtc} | dur=${f.durationHours} | prec=${f.timePrecision} | conf=${f.confidence} | status=${f.status} | parent=${f.parentFixtureId ?? '-'} | fk=${JSON.stringify(f.followKeys)} | "${f.title}"`,
  );
}

// 4. appearances overall
const apps = docs.filter((f) => f.parentFixtureId);
console.log(`\nTOTAL appearance docs: ${apps.length}`);
const appPrec = {};
const appConf = {};
for (const f of apps) {
  appPrec[prec(f)] = (appPrec[prec(f)] ?? 0) + 1;
  appConf[String(f.confidence)] = (appConf[String(f.confidence)] ?? 0) + 1;
}
console.log('  appearance timePrecision:', JSON.stringify(appPrec));
console.log('  appearance confidence:', JSON.stringify(appConf));

// per-parent appearance counts, top 15
const perParent = {};
for (const f of apps) perParent[f.parentFixtureId] = (perParent[f.parentFixtureId] ?? 0) + 1;
const top = Object.entries(perParent).sort((a, b) => b[1] - a[1]).slice(0, 15);
console.log('\n-- parents with the most appearances --');
for (const [pid, n] of top) {
  const p = docs.find((d) => d.id === pid);
  console.log(
    `  ${pid} -> ${n} appearances | parent: ${p ? `${p.startUtc} dur=${p.durationHours} prec=${p.timePrecision} "${p.title}"` : 'PARENT DOC MISSING'}`,
  );
}

// 5. tennis tournament parents (tennis-t-*) inventory
console.log('\n=== tennis-t-* parent docs (competition-follow deliverables) ===');
const tennisParents = docs.filter(
  (f) => !f.parentFixtureId && (f.followKeys ?? []).some((k) => k.startsWith('tennis-t-')),
);
console.log(`count: ${tennisParents.length}`);
for (const f of tennisParents
  .sort((a, b) => String(a.startUtc).localeCompare(String(b.startUtc)))
  .slice(0, 30)) {
  console.log(
    `  ${f.id} | ${f.startUtc} | dur=${f.durationHours} (${spanDays(f.durationHours)}d) | prec=${f.timePrecision} | status=${f.status} | fk=${JSON.stringify(f.followKeys)} | "${f.title}"`,
  );
}

// 6. how many docs carry a -finals scoped key
const finalsKeyed = docs.filter((f) => (f.followKeys ?? []).some((k) => k.endsWith('-finals')));
console.log(`\ndocs carrying a *-finals scoped key: ${finalsKeyed.length}`);
for (const f of finalsKeyed.slice(0, 10)) {
  console.log(
    `  ${f.id} | ${f.startUtc} | dur=${f.durationHours} | prec=${f.timePrecision} | fk=${JSON.stringify(f.followKeys)} | "${f.title}"`,
  );
}

process.exit(0);
