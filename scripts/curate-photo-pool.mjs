// Sport-generic photo pool curation (owner ruling 2026-08-30; UFC
// seeded first). Candidates come from Commons search, pass the SAME
// verified-at-fetch gate as venue photography (licence allowlist +
// named artist), and a subject filter drops anything fighter-centric:
// a card for one bout wearing a photo of different fighters misleads,
// and athlete-centric shots carry personality-rights mess. Cage- and
// arena-centric only.
//
//   node scripts/curate-photo-pool.mjs --sport ufc            # dry-run
//   node scripts/curate-photo-pool.mjs --sport ufc --apply    # write doc
//
// Future pools are filled through the review-sheet mechanism, not
// bulk-built — this script prints its picks for the report either way.

import { createRequire } from 'node:module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');

const APPLY = process.argv.includes('--apply');
const SPORT = process.argv.includes('--sport')
  ? process.argv[process.argv.indexOf('--sport') + 1]
  : 'ufc';
const CAP = { ufc: 8, golf: 12 }[SPORT] ?? 8;

const SEARCHES = {
  // Sport-generic by design: an octagon is an octagon — generic MMA
  // cage/arena shots serve UFC cards without borrowing one event's
  // scene. Terms ordered most-specific first.
  ufc: [
    'mixed martial arts octagon',
    'MMA cage arena',
    'mixed martial arts arena event',
    'UFC octagon',
    'UFC arena',
  ],
  // Golf (Round 7 item 9, owner ruling 2026-09-03): the course IS the
  // scene — links, fairways, greens — and Commons' Quality-images
  // category carries landscape photography of them with named
  // photographers. Course-centric only: no golfer in frame as the
  // subject, no trophies, no galleries.
  golf: [
    'golf course incategory:Quality_images',
    'golf links fairway incategory:Quality_images',
    'golf course green bunker',
    'golf links dunes',
    'golf course aerial',
  ],
};
// Cage/arena-centric only. A title or description that names people,
// bouts or portraits is OUT even if the frame happens to include the
// cage — the subject rule, not a composition rule.
const WANTS = {
  ufc: /octagon|cage|arena|crowd|venue|event/i,
  golf: /golf|fairway|green|links|course|hole|bunker|clubhouse/i,
};
const REJECTS = {
  ufc: /\bvs\.?\b|portrait|weigh[- ]?in|face[- ]?off|press conference|interview|posing|headshot|champion|belt/i,
  golf: /portrait|golfer|player|swing|putt(?:ing)? stroke|trophy|\bvs\.?\b|champion|caddie|crowd|gallery|spectator|sign\b|scorecard|cart\b|\bcar\b|\bfiat\b|vehicle|mini[- ]?golf|crazy golf|devil's golf/i,
};
const WANT = WANTS[SPORT] ?? WANTS.ufc;
const REJECT = REJECTS[SPORT] ?? REJECTS.ufc;
// Golf shots are backgrounds for a hero card: landscape orientation and
// a real width, or the scrim has nothing to show.
const MIN_WIDTH = SPORT === 'golf' ? 1600 : 0;
const LANDSCAPE_ONLY = SPORT === 'golf';
const CAP_FOR = { ufc: 8, golf: 12 };
// Person-name shaped titles ("Firstname Lastname at UFC…"): two
// capitalised words leading the filename is the fighter-photo shape.
const PERSONISH =
  /^File:[A-Z][a-z]+ [A-Z][a-z]+( Jr\.?)? (at|during|after|before|in|walks|steps|enters|leaves|UFC)/;
// Person-centric even when unnamed: a training airman is a subject,
// not a venue.
const PERSON_CENTRIC = /airman|soldier|service ?member/i;

const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const UA = { 'User-Agent': 'KickOffCal-dev/1.0 (fixtures calendar app)' };
let last = 0;
async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    const wait = last + 2000 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const res = await fetch(url, { headers: UA });
    if (res.status === 429) {
      if (attempt >= 3) throw new Error('http 429');
      console.log('  … 429, pausing 60s');
      await new Promise((r) => setTimeout(r, 60_000));
      continue;
    }
    if (!res.ok) throw new Error(`http ${res.status}`);
    return res.json();
  }
}

const ALLOWED = (s) => {
  const u = (s ?? '').trim().toUpperCase();
  if (!u || u.includes('NC') || u.includes('ND')) return false;
  return u.startsWith('CC BY') || u.startsWith('CC0') || u === 'CC0' || u.startsWith('PUBLIC DOMAIN') || u === 'PD';
};
const stripHtml = (h) => (h ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const thumb = (title, w = 1280) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(title.replace(/^File:/, '').replace(/ /g, '_'))}?width=${w}`;

(async () => {
  const searches = SEARCHES[SPORT];
  if (!searches) {
    console.error(`no search terms for sport '${SPORT}'`);
    process.exit(1);
  }
  const seen = new Set();
  const picks = [];
  const rejected = [];
  for (const term of searches) {
    if (picks.length >= CAP) break;
    const d = await getJson(
      `${COMMONS}?action=query&list=search&srsearch=${encodeURIComponent(term)}&srnamespace=6&srlimit=30&format=json&origin=*`,
    );
    for (const hit of d.query?.search ?? []) {
      if (picks.length >= CAP) break;
      const title = hit.title;
      if (seen.has(title)) continue;
      seen.add(title);
      // ONE shot per event/scene: burst-shot series share a filename
      // stem — a pool of eight near-identical frames is a pool of one.
      const stem = title
        .replace(/\s*\(\d+\)\.(jpe?g|png)$/i, '')
        .replace(/\s*\d+\.(jpe?g|png)$/i, '')
        .replace(/\.(jpe?g|png)$/i, '');
      if (seen.has('stem:' + stem)) continue;
      seen.add('stem:' + stem);
      if (!/\.(jpe?g|png)$/i.test(title)) continue;
      if (!WANT.test(title) && !WANT.test(hit.snippet ?? '')) continue;
      if (REJECT.test(title) || PERSONISH.test(title) || PERSON_CENTRIC.test(title)) {
        rejected.push({ title, why: 'subject rule' });
        continue;
      }
      const info = await getJson(
        `${COMMONS}?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=extmetadata|size&format=json&origin=*`,
      );
      const page = Object.values(info.query?.pages ?? {})[0];
      const ii = page?.imageinfo?.[0];
      const meta = ii?.extmetadata ?? {};
      const licence = meta.LicenseShortName?.value ?? '';
      const artist = stripHtml(meta.Artist?.value);
      const desc = stripHtml(meta.ImageDescription?.value ?? '');
      if (REJECT.test(desc)) {
        rejected.push({ title, why: `subject rule (description)` });
        continue;
      }
      if ((ii?.width ?? 0) < MIN_WIDTH || (LANDSCAPE_ONLY && (ii?.width ?? 0) <= (ii?.height ?? 0))) {
        rejected.push({ title, why: `geometry (${ii?.width}x${ii?.height})` });
        continue;
      }
      if (!ALLOWED(licence) || !artist) {
        rejected.push({ title, why: `gate (${licence || 'no licence'}${artist ? '' : ', no artist'})` });
        continue;
      }
      picks.push({
        url: thumb(title),
        artist,
        licence: licence.trim(),
        sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
        _title: title,
      });
      console.log(`  ✓ ${title} (${licence}, ${artist.slice(0, 40)})`);
    }
  }
  console.log(`\npicks: ${picks.length}/${CAP} | rejected: ${rejected.length}`);
  for (const r of rejected.slice(0, 12)) console.log(`  ✗ ${r.title} — ${r.why}`);

  if (!APPLY) {
    console.log('DRY RUN — pool doc not written.');
    process.exit(0);
  }
  if (picks.length < 4) {
    console.error('REFUSING to apply a pool under 4 shots — too little variety.');
    process.exit(1);
  }
  admin.initializeApp({ projectId: 'gameday-fixtures' });
  const clean = picks.map(({ _title, ...p }) => p);
  await admin
    .firestore()
    .doc('directoryArt/photoPools')
    .set({ pools: { [SPORT]: clean } }, { merge: true });
  console.log(`APPLIED: pools.${SPORT} = ${clean.length} shots.`);
  process.exit(0);
})().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
