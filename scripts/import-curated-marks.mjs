// Curated competition/tournament marks (owner ruling 2026-08-30,
// broadened): official marks wherever one exists and the provider
// serves none — sourced automatically ONLY at full confidence, self-
// hosted in our storage, served through the art map's curated layer.
//
// SOURCING LADDER (confidence-gated; a wrong mark is worse than a
// monogram):
//   1. provider badge — already handled upstream (the merge fills
//      gaps only, so anything the provider covers is skipped here).
//   2. automated confident: Wikidata entity by name, UNIQUE
//      sport-shaped candidate (same discipline as the name-join
//      rules), its P154 logo claim, hosted ON COMMONS (fair-use files
//      that live only on a Wikipedia are not importable), downloadable
//      as a raster.
//   3. anything below confident → the FLAG SHEET
//      (scripts/curated-marks-review.md: name + candidate thumbnails,
//      one owner pass) and/or the MANUAL DROP: an official file the
//      owner saves as scripts/curated-marks-manual/<followKey>.png is
//      uploaded verbatim by --apply.
//
// Olympic statute: olympics-*/paralympics-* keys are refused at import,
// at merge (mergeCuratedMarks) and at serve (imagery.ts). Fixture-
// derived teams are out of scope by ruling (competition/tournament
// entities only).
//
//   node scripts/import-curated-marks.mjs            # dry-run
//   node scripts/import-curated-marks.mjs --apply    # upload + manifest
//
// Dry-run makes NO prod writes and uploads nothing; it downloads
// candidate rasters to scripts/curated-marks/ for inspection.

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, 'curated-marks');
const MANUAL_DIR = join(HERE, 'curated-marks-manual');
const SHEET = join(HERE, 'curated-marks-review.md');
const STATE = join(HERE, 'curated-marks-state.json');

const APPLY = process.argv.includes('--apply');
const BUCKET =
  process.argv.includes('--bucket')
    ? process.argv[process.argv.indexOf('--bucket') + 1]
    : 'gameday-fixtures.firebasestorage.app';

const WD = 'https://www.wikidata.org/w/api.php';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const UA = { 'User-Agent': 'KickOffCal-dev/1.0 (fixtures calendar app)' };
const SPACING_MS = 2000;
let last = 0;
// Bulk sweeps trip Wikimedia's limiter far sooner than device
// traffic does: a 429 pauses the WHOLE run for a minute and the
// request retries — three strikes marks the key transient (resumable)
// rather than verdicted.
async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    const wait = last + SPACING_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const res = await fetch(url, { headers: UA });
    if (res.status === 429) {
      if (attempt >= 3) throw new Error('http 429');
      console.log('  … 429, pausing 60s');
      await new Promise((r) => setTimeout(r, 60_000));
      continue;
    }
    if (!res.ok) throw new Error(`http ${res.status} ${url}`);
    return res.json();
  }
}
async function getBytes(url) {
  const wait = last + SPACING_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const res = await fetch(url, { headers: UA, redirect: 'follow' });
  if (!res.ok) throw new Error(`http ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  const buf = Buffer.from(await res.arrayBuffer());
  return { type, buf };
}

// The same not-a-person / wrong-kind discipline the athlete resolver
// uses: a candidate must be THIS KIND of thing, uniquely.
const NOT_AN_EVENT_ENTITY =
  /disambiguation|wikimedia|film|album|song|video game|painting|book|novel|surname|given name|family name|human settlement|railway|station/;

const SPORT_SHAPES = {
  tennis: /tennis|grand slam/,
  boxing: /boxing/,
  athletics: /athletics|running|road running|cross country|track and field|marathon/,
};

async function wikidataCandidates(name) {
  const d = await getJson(
    `${WD}?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&type=item&limit=7&format=json&origin=*`,
  );
  return d.search ?? [];
}
async function claim(entity, property) {
  const d = await getJson(
    `${WD}?action=wbgetclaims&entity=${entity}&property=${property}&format=json&origin=*`,
  );
  const v = d.claims?.[property]?.[0]?.mainsnak?.datavalue?.value;
  return typeof v === 'string' ? v : null;
}
async function commonsInfo(fileTitle) {
  const d = await getJson(
    `${COMMONS}?action=query&titles=${encodeURIComponent(`File:${fileTitle}`)}&prop=imageinfo&iiprop=extmetadata&format=json&origin=*`,
  );
  const page = Object.values(d.query?.pages ?? {})[0];
  if (!page || page.missing !== undefined || !page.imageinfo) return null;
  const meta = page.imageinfo[0]?.extmetadata ?? {};
  return {
    licence: meta.LicenseShortName?.value ?? '',
    artist: (meta.Artist?.value ?? '').replace(/<[^>]*>/g, '').trim(),
  };
}

(async () => {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(MANUAL_DIR, { recursive: true });

  // ── Targets: everything still monogramming after the provider layer.
  const prio = await (await fetch(
    'https://us-central1-gameday-fixtures.cloudfunctions.net/listPriorities',
    { headers: UA },
  )).json();
  const covered = new Set(Object.keys(prio.competitionArt ?? {}));
  const tours = await (await fetch(
    'https://us-central1-gameday-fixtures.cloudfunctions.net/listTournaments',
    { headers: UA },
  )).json();
  const targets = [];
  for (const row of tours.tournaments ?? []) {
    if (covered.has(row.key)) continue;
    targets.push({ key: row.key, name: row.name, shape: SPORT_SHAPES.tennis, sport: 'tennis' });
  }
  targets.push({ key: 'pbc-cards', name: 'Premier Boxing Champions', shape: SPORT_SHAPES.boxing, sport: 'boxing' });
  for (const [key, name] of [
    ['wa-world-athletics-cross-country-tour-gold', 'World Athletics Cross Country Tour'],
    ['wa-world-athletics-u20-championships-world-athletics-series', 'World Athletics U20 Championships'],
  ]) {
    if (!covered.has(key)) targets.push({ key, name, shape: SPORT_SHAPES.athletics, sport: 'athletics' });
  }
  // Logoless BY CONSTRUCTION (our own grouping rows) — listed, never sourced.
  const logolessByDesign = [
    'wa-national-senior-outdoor-championships',
    'wa-area-senior-outdoor-championships',
    'wa-calendar',
  ];
  console.log(`targets: ${targets.length} (provider already covers ${covered.size} keys)`);

  const confident = [];
  const flagged = [];
  const VOLATILE = /open|classic|masters 1000|500|250|cup(?!s)/i; // sponsor-rotating class, tennis tour events
  let volatileCount = 0;

  // Resume state: verdicts persist per key; only transient (429-class)
  // keys are retried on a re-run, so consecutive invocations converge.
  const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
  const saveState = () => writeFileSync(STATE, JSON.stringify(state, null, 1));

  for (const t of targets) {
    if (/^(?:olympics|paralympics)/.test(t.key)) continue; // statute
    const prior = state[t.key];
    if (prior && prior.kind === 'confident') {
      if (existsSync(join(OUT_DIR, `${t.key}.png`))) {
        confident.push({ ...t, ...prior.record, local: join(OUT_DIR, `${t.key}.png`) });
        continue;
      }
    } else if (prior && prior.kind === 'flagged') {
      flagged.push({ ...t, ...prior.record });
      continue;
    }
    try {
      const cands = (await wikidataCandidates(t.name)).filter(
        (c) => !NOT_AN_EVENT_ENTITY.test((c.description ?? '').toLowerCase()),
      );
      // Editions, wheelchair/junior/doubles variants and the VENUE
      // entity all share the tournament's name and its sport shape —
      // the mark belongs to the MAIN tournament entity only.
      const NOT_THE_MAIN_ENTITY =
        /\b(19|20)\d{2}\b|edition|wheelchair|junior|doubles|qualifying|venue|stadium|arena/;
      const shaped = cands.filter(
        (c) =>
          t.shape.test((c.description ?? '').toLowerCase()) &&
          !NOT_THE_MAIN_ENTITY.test((c.description ?? '').toLowerCase()),
      );
      // Tie-breaks within confidence: an exact-label match wins; if
      // the tie survives, the single P154-bearing candidate wins.
      let pool = shaped;
      if (pool.length > 1) {
        const exact = pool.filter(
          (c) => (c.label ?? '').toLowerCase() === t.name.toLowerCase(),
        );
        if (exact.length >= 1) pool = exact;
      }
      if (pool.length > 1) {
        const withLogo = [];
        for (const c of pool) {
          if (await claim(c.id, 'P154')) withLogo.push(c);
        }
        if (withLogo.length === 1) pool = withLogo;
      }
      if (pool.length !== 1) {
        const rec = { reason: pool.length === 0 ? 'no shaped candidate' : `ambiguous (${pool.length})`, candidates: (pool.length ? pool : cands.slice(0, 3)) };
        state[t.key] = { kind: 'flagged', record: rec }; saveState();
        flagged.push({ ...t, ...rec });
        continue;
      }
      const shapedOne = pool;
      const entity = shapedOne[0].id;
      const logo = await claim(entity, 'P154');
      // A P154 that is the TOUR's own generic logo is not the event's
      // mark (Wuhan/Nordea both claim "WTA logo 2010.svg") — a tour
      // badge on an event row is the wrong-mark class the gate exists
      // to stop.
      if (logo && /^(?:wta|atp)[ _-]/i.test(logo.trim())) {
        const rec = { reason: `P154 is the tour logo, not the event’s (${logo})`, entity, candidates: [shapedOne[0]] };
        state[t.key] = { kind: 'flagged', record: rec }; saveState();
        flagged.push({ ...t, ...rec });
        continue;
      }
      if (!logo) {
        const rec = { reason: 'no P154 logo claim', entity, candidates: [shapedOne[0]] };
        state[t.key] = { kind: 'flagged', record: rec }; saveState();
        flagged.push({ ...t, ...rec });
        continue;
      }
      const info = await commonsInfo(logo);
      if (!info) {
        const rec = { reason: 'logo not on Commons (likely fair-use only) — official file via manual drop', entity, file: logo, candidates: [shapedOne[0]] };
        state[t.key] = { kind: 'flagged', record: rec }; saveState();
        flagged.push({ ...t, ...rec });
        continue;
      }
      const { type, buf } = await getBytes(
        `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(logo.replace(/ /g, '_'))}?width=512`,
      );
      if (!type.startsWith('image/') || buf.length < 1024) {
        const rec = { reason: `download not a usable raster (${type}, ${buf.length}B)`, entity, file: logo, candidates: [shapedOne[0]] };
        state[t.key] = { kind: 'flagged', record: rec }; saveState();
        flagged.push({ ...t, ...rec });
        continue;
      }
      const local = join(OUT_DIR, `${t.key}.png`);
      writeFileSync(local, buf);
      if (t.sport === 'tennis' && VOLATILE.test(t.name) && !t.key.match(/us-open|wimbledon|roland|australian/)) volatileCount++;
      const record = { entity, file: logo, licence: info.licence, bytes: buf.length };
      state[t.key] = { kind: 'confident', record }; saveState();
      confident.push({ ...t, ...record, local });
      console.log(`  ✓ ${t.key} ← ${logo} (${info.licence || 'no licence tag'})`);
    } catch (e) {
      // Transient (429s and the like): NOT persisted as a verdict — a
      // re-run retries exactly these.
      flagged.push({ ...t, reason: `transient: ${String(e).slice(0, 60)} — re-run to retry` });
    }
  }

  // ── Flag sheet: one pass of eyeballs.
  const sheet = [
    '# Curated marks — review sheet',
    '',
    `Confident (imported without ceremony): ${confident.length} · Flagged below: ${flagged.length} · Logoless by design: ${logolessByDesign.length}`,
    '',
    '| follow key | name | why flagged | candidates |',
    '|---|---|---|---|',
    ...flagged.map((f) => {
      const cands = (f.candidates ?? [])
        .map((c) => `[${c.id}](https://www.wikidata.org/wiki/${c.id}) ${c.description ?? ''}`)
        .join('<br>');
      const thumb = f.file
        ? ` ![](https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(String(f.file).replace(/ /g, '_'))}?width=120)`
        : '';
      return `| ${f.key} | ${f.name} | ${f.reason}${thumb} | ${cands} |`;
    }),
    '',
    '## Logoless by design (our grouping rows — stay monogram)',
    ...logolessByDesign.map((k) => `- ${k}`),
    '',
    `## Volatile class: ~${volatileCount} tennis tour events carry title-sponsored logos that rotate with sponsors — staleness accepted by ruling.`,
    '',
    '## Manual drop',
    'Save an official file as `scripts/curated-marks-manual/<followKey>.png` and re-run with `--apply` — manual files are uploaded verbatim and win over nothing (they only fill keys with no confident source).',
  ].join('\n');
  writeFileSync(SHEET, sheet);
  console.log(`\nconfident: ${confident.length} | flagged: ${flagged.length} | sheet: ${SHEET}`);

  if (!APPLY) {
    console.log('DRY RUN — nothing uploaded, no manifest written.');
    process.exit(0);
  }

  // ── Apply: upload confident + manual drops, write the manifest.
  admin.initializeApp({ projectId: 'gameday-fixtures', storageBucket: BUCKET });
  const bucket = admin.storage().bucket();
  const [exists] = await bucket.exists();
  if (!exists) {
    console.error(`bucket ${BUCKET} does not exist — pass --bucket <name>`);
    process.exit(1);
  }
  const manifest = {};
  const uploads = [
    ...confident.map((c) => ({ key: c.key, local: c.local, source: c.file, licence: c.licence })),
    ...readdirSync(MANUAL_DIR)
      .filter((f) => f.endsWith('.png'))
      .map((f) => ({ key: f.replace(/\.png$/, ''), local: join(MANUAL_DIR, f), source: 'manual (official asset, owner-supplied)', licence: '' })),
  ];
  for (const u of uploads) {
    if (/^(?:olympics|paralympics)/.test(u.key)) continue; // statute
    if (!existsSync(u.local)) continue;
    const dest = `marks/${u.key}.png`;
    await bucket.upload(u.local, { destination: dest, metadata: { contentType: 'image/png', cacheControl: 'public,max-age=604800' } });
    await bucket.file(dest).makePublic();
    manifest[u.key] = {
      url: `https://storage.googleapis.com/${BUCKET}/${dest}`,
      source: u.source,
      licence: u.licence,
      fetchedAt: new Date().toISOString(),
    };
    console.log(`  ↑ ${u.key}`);
  }
  await admin.firestore().doc('directoryArt/curated').set({ marks: manifest }, { merge: true });
  // Age the art cache so the next listPriorities rebuild merges the
  // curated layer immediately (keeps existing art as outage fallback).
  await admin.firestore().doc('directoryArt/competitions').update({ cachedAt: '2020-01-01T00:00:00.000Z' }).catch(() => {});
  console.log(`APPLIED: ${Object.keys(manifest).length} curated marks in the manifest; art cache aged for immediate rebuild.`);
  process.exit(0);
})().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
