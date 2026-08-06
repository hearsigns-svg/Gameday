import admin from 'firebase-admin';
admin.initializeApp({ projectId: 'gameday-fixtures' });
const db = admin.firestore();

const all = await db.collection('fixtures').get();
const docs = all.docs.map((d) => ({ id: d.id, ...d.data() }));
const prec = (f) =>
  f.timePrecision ?? (f.status === 'tbd' || f.status === 'postponed' ? 'date_only' : 'exact');
const spanDays = (h) => Math.max(1, Math.round((h ?? 2) / 24));

// ---- A. The 23 provisional appearances: do they inherit a multi-day parent window?
const apps = docs.filter((f) => f.parentFixtureId);
console.log('=== PROVISIONAL appearances (inherit parent window) ===');
for (const f of apps.filter((x) => x.confidence === 'provisional')) {
  console.log(
    `  ${f.id}\n     ${f.startUtc} | dur=${f.durationHours} (${spanDays(f.durationHours)}d) | prec=${f.timePrecision} | parent=${f.parentFixtureId} | fk=${JSON.stringify(f.followKeys)} | "${f.title}"`,
  );
}

// ---- B. National Bank Open 2026: the live "matches delivered" case
console.log('\n=== National Bank Open 2026 — parents + children ===');
const nboParents = docs.filter((f) =>
  (f.followKeys ?? []).includes('tennis-t-national-bank-open'),
);
for (const p of nboParents) {
  console.log(
    `PARENT ${p.id} | ${p.startUtc} | dur=${p.durationHours} (${spanDays(p.durationHours)}d) | prec=${p.timePrecision} | conf=${p.confidence} | comp=${p.competitionId} | fk=${JSON.stringify(p.followKeys)} | "${p.title}"`,
  );
  const kids = apps.filter((a) => a.parentFixtureId === p.id);
  const byPrec = {};
  const byDay = {};
  for (const k of kids) {
    byPrec[prec(k)] = (byPrec[prec(k)] ?? 0) + 1;
    const day = String(k.startUtc).slice(0, 10);
    byDay[day] = (byDay[day] ?? 0) + 1;
  }
  console.log(`   children=${kids.length} precision=${JSON.stringify(byPrec)}`);
  console.log(`   children by day: ${JSON.stringify(byDay)}`);
  for (const k of kids.slice(0, 6)) {
    console.log(
      `     ${k.id}\n        ${k.startUtc} | dur=${k.durationHours} (${spanDays(k.durationHours)}d) | prec=${k.timePrecision} | conf=${k.confidence} | fk=${JSON.stringify(k.followKeys)} | "${k.title}"`,
    );
  }
}

// ---- C. how many PARENT banners does one tennis-t-* follow deliver, per season?
console.log('\n=== tennis-t-* keys with MORE THAN ONE parent banner in the same window ===');
const byKey = {};
for (const f of docs) {
  if (f.parentFixtureId) continue;
  for (const k of f.followKeys ?? []) {
    if (!k.startsWith('tennis-t-') || k.endsWith('-finals')) continue;
    (byKey[k] ??= []).push(f);
  }
}
let dupKeys = 0;
for (const [k, list] of Object.entries(byKey)) {
  // group by start day
  const byStart = {};
  for (const f of list) (byStart[String(f.startUtc).slice(0, 10)] ??= []).push(f);
  for (const [day, fs] of Object.entries(byStart)) {
    if (fs.length > 1) {
      dupKeys++;
      if (dupKeys <= 12) {
        console.log(
          `  ${k} @ ${day}: ${fs.length} banners -> ` +
            fs
              .map((f) => `${f.id}(${f.competitionId},dur=${f.durationHours})`)
              .join(' + '),
        );
      }
    }
  }
}
console.log(`  TOTAL (key, start-day) pairs with >1 parent banner: ${dupKeys}`);

// ---- D. calendar-days-covered arithmetic for the UPCOMING window only
const now = Date.now();
const upcoming = docs.filter((f) => Date.parse(f.startUtc) > now);
const upBanners = upcoming.filter((f) => prec(f) === 'date_only' && spanDays(f.durationHours) > 1);
console.log(`\nUPCOMING (startUtc > now) docs: ${upcoming.length}`);
console.log(`  of which multi-day date_only banners: ${upBanners.length}`);
const bySport = {};
let totalBannerDays = 0;
for (const f of upBanners) {
  bySport[f.sport] = (bySport[f.sport] ?? 0) + 1;
  totalBannerDays += spanDays(f.durationHours);
}
console.log(`  by sport: ${JSON.stringify(bySport)}  total banner-days: ${totalBannerDays}`);

// ---- E. what the appearance slice keys actually are
const sliceKeys = {};
for (const a of apps) for (const k of a.followKeys ?? []) sliceKeys[k] = (sliceKeys[k] ?? 0) + 1;
console.log('\nappearance followKeys histogram:', JSON.stringify(sliceKeys, null, 1));

// ---- F. athlete-followKey appearances: how many days does one athlete's tournament span
console.log('\n=== sample: appearances carrying an athlete key ===');
const athleteKeyed = apps.filter((a) => (a.followKeys ?? []).some((k) => k.startsWith('athlete-')));
console.log(`count with athlete- key: ${athleteKeyed.length}`);
for (const a of athleteKeyed.slice(0, 10)) {
  console.log(
    `  ${a.id} | ${a.startUtc} | dur=${a.durationHours} | prec=${a.timePrecision} | conf=${a.confidence} | fk=${JSON.stringify(a.followKeys)} | "${a.title}"`,
  );
}

process.exit(0);
