// Boxing gender backfill (Round 3 B7 realignment, fix 3) — shrink the
// unclassed fighter set at the source.
//
// A4 measured: boxing-data's /v2/fighters documents an explicit
// per-fighter `gender` field (plus division) that the connector never
// calls, priced against the 100/month quota. This script spends a
// BUDGETED number of calls on that endpoint, matches returned fighters
// against the directory's UNCLASSED boxing athletes by the house
// matching discipline (unique folded full-name match only — F31: a
// surname or an ambiguous match mints/patches NOTHING), and stamps
// grouping/groupingKey ONLY where BOTH gender and a mappable division
// arrive — full class placement, riding every existing browse rule.
// Gender-without-division matches are REPORTED, not written: a sex
// fact with no class has no honest home in the current model.
//
// QUOTA DISCIPLINE: refuses to start unless the vendor's
// x-ratelimit-requests-remaining exceeds --budget + RESERVE (the daily
// pollBoxingData cadence needs the rest of the month). Every response
// prints the remaining quota. Dry-run by default; --apply writes.
//
// Run from the repo root (ADC must be configured):
//   node scripts/backfill-boxing-gender.mjs --budget 12
//   node scripts/backfill-boxing-gender.mjs --budget 12 --apply

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');

const HOST = 'boxing-data-api.p.rapidapi.com';
// Keep at least this many calls for the daily poller's remainder of
// the month — the backfill must never starve ingestion.
const RESERVE = 35;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const budgetIx = args.indexOf('--budget');
const BUDGET = budgetIx >= 0 ? Number(args[budgetIx + 1]) : 10;
if (!Number.isInteger(BUDGET) || BUDGET < 1 || BUDGET > 40) {
  console.error('--budget must be 1..40 (calls to spend)');
  process.exit(1);
}

const key = (() => {
  const env = readFileSync(new URL('../functions/.env', import.meta.url), 'utf8');
  const m = /^BOXING_VENDOR_KEY=(.+)$/m.exec(env);
  if (!m) throw new Error('BOXING_VENDOR_KEY not found in functions/.env');
  return m[1].trim();
})();

admin.initializeApp({ projectId: 'gameday-fixtures' });
const db = admin.firestore();

const fold = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

let spent = 0;
async function vendorGet(path) {
  if (spent >= BUDGET) throw new Error('budget spent');
  const res = await fetch(`https://${HOST}${path}`, {
    headers: { 'x-rapidapi-host': HOST, 'x-rapidapi-key': key },
  });
  spent++;
  const remaining = res.headers.get('x-ratelimit-requests-remaining');
  console.log(`  call ${spent}/${BUDGET} ${path} → ${res.status} (vendor remaining: ${remaining})`);
  if (res.status === 429) throw new Error('vendor quota exhausted');
  if (!res.ok) throw new Error(`vendor http ${res.status}`);
  return { body: await res.json(), remaining: Number(remaining) };
}

// "super middleweight" → catalogue class slug; division names arrive
// in unknown casing/shape, folded before lookup. Unknown divisions →
// no write (reported).
const CLASS_SLUGS = new Set([
  'heavyweight','cruiserweight','light heavyweight','super middleweight',
  'middleweight','super welterweight','welterweight','super lightweight',
  'lightweight','super featherweight','featherweight','super bantamweight',
  'bantamweight','super flyweight','flyweight','light flyweight',
  'minimumweight','light middleweight','light welterweight',
]);
const classSlug = (division) => {
  const f = fold(String(division ?? ''));
  return CLASS_SLUGS.has(f) ? f.replace(/ /g, '-') : null;
};

(async () => {
  // 1. The unclassed set: boxing athletes with no groupingKey.
  const snap = await db.collection('athletes').where('sport', '==', 'boxing').get();
  const unclassed = snap.docs.filter((d) => !d.data().groupingKey);
  console.log(`boxing athletes: ${snap.size}, unclassed: ${unclassed.length}`);
  const byName = new Map();
  for (const d of unclassed) {
    const n = fold(d.data().displayName ?? '');
    if (!n) continue;
    byName.set(n, byName.has(n) ? 'AMBIGUOUS' : d);
  }

  // 2. Probe page 1 to learn the shape, then page within budget.
  const first = await vendorGet('/v2/fighters?page_num=1&page_size=100');
  if (spent === 1 && first.remaining < BUDGET - 1 + RESERVE) {
    console.error(`REFUSING: vendor remaining ${first.remaining} < budget ${BUDGET - 1} + reserve ${RESERVE}`);
    process.exit(1);
  }
  const pageOf = (body) => (Array.isArray(body) ? body : (body?.fighters ?? body?.data ?? []));
  let fighters = pageOf(first.body);
  console.log('page 1 size:', fighters.length, '| sample:', JSON.stringify(fighters[0] ?? null)?.slice(0, 300));
  for (let p = 2; spent < BUDGET; p++) {
    const page = pageOf((await vendorGet(`/v2/fighters?page_num=${p}&page_size=100`)).body);
    if (page.length === 0) break;
    fighters = fighters.concat(page);
  }
  console.log('fighters fetched:', fighters.length);

  // 3. Match + classify.
  let matched = 0, classed = 0, genderOnly = 0, ambiguous = 0;
  const writes = [];
  for (const f of fighters) {
    const name = fold(f.name ?? [f.first_name, f.last_name].filter(Boolean).join(' '));
    if (!name) continue;
    const hit = byName.get(name);
    if (!hit) continue;
    if (hit === 'AMBIGUOUS') { ambiguous++; continue; }
    matched++;
    const g = String(f.gender ?? '').toLowerCase();
    const sex = g.startsWith('f') ? 'w' : g.startsWith('m') ? 'm' : null;
    const slug = classSlug(f.division?.name ?? f.division);
    if (!sex) continue;
    if (!slug) { genderOnly++; continue; }
    classed++;
    const groupingKey = sex === 'w' ? `boxing-w-${slug}` : `boxing-${slug}`;
    const classLabel = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const grouping = sex === 'w' ? `Women’s ${classLabel}` : classLabel;
    writes.push({ ref: hit.ref, name: hit.data().displayName, groupingKey, grouping });
  }
  console.log(`matched (unique name): ${matched} | full class placements: ${classed} | gender-only (NOT written): ${genderOnly} | ambiguous names skipped: ${ambiguous}`);
  for (const w of writes.slice(0, 15)) console.log('  ', w.name, '→', w.groupingKey);
  if (writes.length > 15) console.log(`   … ${writes.length - 15} more`);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to stamp.');
    process.exit(0);
  }
  let batch = db.batch(); let pending = 0;
  for (const w of writes) {
    batch.set(w.ref, { grouping: w.grouping, groupingKey: w.groupingKey, updatedAt: new Date().toISOString() }, { merge: true });
    if (++pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
  }
  if (pending > 0) await batch.commit();
  console.log(`APPLIED: ${writes.length} athletes classed.`);
  process.exit(0);
})().catch((e) => { console.error(String(e)); process.exit(1); });
