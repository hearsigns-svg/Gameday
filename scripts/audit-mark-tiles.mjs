// Mark-tile rendering audit (Round 6) — READ-ONLY against prod.
//
// For every mark in the live art map: fill ratio (content bounds vs
// canvas, the contain-fit fraction), baked-background detection
// (uniform opaque edge ring), and worst-mode WCAG contrast of the
// mark's dominant colours against the tile containers (measured
// two-luminance model — asserted here against the live values, so a
// theme move fails the audit rather than silently skewing it).
//
//   node scripts/audit-mark-tiles.mjs            # measure + distribution
//   node scripts/audit-mark-tiles.mjs --sheet    # also write review sheet
//
// The review sheet holds the FLAGGED set only, before/after: after =
// the three rules applied in order (trim → adopt background → contrast
// pick) exactly as the server build will apply them — same compiled
// functions, same thresholds, so the sheet IS the server's plan.

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
const { PNG } = require('pngjs');
const mt = require('../functions/lib/markTiles.js');

const SHEET = process.argv.includes('--sheet');
const OUT_DIR = '/private/tmp/claude-501/-Users-lnw/dac43abb-04e0-443e-96bc-5b1b4e753cff/scratchpad';

// The measured container-luminance cluster this audit's contrast model
// rests on (see markTiles.ts). If the client theme drifts outside it,
// stop and re-measure rather than audit against a stale baseline.
const MEASURED = { dark: [0.0187, 0.0211], light: [0.7936, 0.8181] };
if (
  mt.CONTAINER_LUMINANCE.dark < MEASURED.dark[0] - 0.005 ||
  mt.CONTAINER_LUMINANCE.dark > MEASURED.dark[1] + 0.005 ||
  mt.CONTAINER_LUMINANCE.light < MEASURED.light[0] - 0.02 ||
  mt.CONTAINER_LUMINANCE.light > MEASURED.light[1] + 0.02
) {
  console.error('CONTAINER_LUMINANCE outside the measured cluster — re-dump the theme.');
  process.exit(1);
}

admin.initializeApp({ projectId: 'gameday-fixtures' });

const fetchPng = async (url) => {
  const res = await fetch(url);
  if (!res.ok) return { err: `http ${res.status}` };
  const buf = Buffer.from(await res.arrayBuffer());
  const grid = mt.gridFromImageBuffer(buf);
  return grid ? { grid, buf } : { err: 'undecodable (not PNG/JPEG)' };
};

const dataUri = (grid) => {
  const png = new PNG({ width: grid.width, height: grid.height });
  grid.data instanceof Buffer
    ? grid.data.copy(png.data)
    : Buffer.from(grid.data).copy(png.data);
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
};

(async () => {
  const doc = await admin.firestore().doc('directoryArt/competitions').get();
  const art = doc.data()?.art ?? {};
  const keys = Object.keys(art);
  console.log(`marks in art map: ${keys.length}`);
  const rows = [];
  for (const key of keys) {
    const url = art[key];
    const r = await fetchPng(url);
    if (!r.grid) {
      rows.push({ key, url, err: r.err });
      continue;
    }
    const a = mt.assessMark(r.grid);
    const plan = mt.markTilePlan(a);
    rows.push({
      key,
      url,
      w: a.width,
      h: a.height,
      fillRatio: +a.fillRatio.toFixed(3),
      bakedBg: a.bakedBg ? mt.hexOf(a.bakedBg) : null,
      okShare: a.dominants.length === 0 ? null : +a.worstModeOkShare.toFixed(2),
      dominants: a.dominants.map((d) => `${mt.hexOf(d.rgb)}@${d.share.toFixed(2)}`),
      plan,
      _grid: r.grid,
      _assessment: a,
    });
  }

  const ok = rows.filter((r) => !r.err);
  const errs = rows.filter((r) => r.err);
  console.log(`decoded: ${ok.length} | undecodable: ${errs.length}`);
  for (const e of errs) console.log(`  ! ${e.key} — ${e.err}`);

  console.log('\nfill-ratio distribution (ascending):');
  for (const r of [...ok].sort((a, b) => a.fillRatio - b.fillRatio).slice(0, 18)) {
    console.log(`  ${r.fillRatio.toFixed(2)}  ${r.key} (${r.w}x${r.h})`);
  }
  console.log('\nbaked backgrounds:');
  for (const r of ok.filter((x) => x.bakedBg)) {
    console.log(`  ${r.key} — ${r.bakedBg}`);
  }
  console.log('\nworst-mode OK-share (ascending — the majority-melts verdict):');
  for (const r of [...ok].filter((x) => x.okShare !== null).sort((a, b) => a.okShare - b.okShare).slice(0, 20)) {
    console.log(`  ${r.okShare.toFixed(2)}  ${r.key}  [${r.dominants.join(' ')}]${r.bakedBg ? ' (baked bg)' : ''}`);
  }

  const flagged = ok.filter((r) => r.plan.flags.length > 0);
  console.log(`\nFLAGGED: ${flagged.length}/${ok.length}`);
  for (const r of flagged) {
    console.log(`  ${r.key}: ${r.plan.flags.join('+')}${r.plan.trim ? ' → trim' : ''}${r.plan.tileFill ? ` → fill ${r.plan.tileFill}` : ''}`);
  }

  writeFileSync(
    `${OUT_DIR}/mark-audit.json`,
    JSON.stringify(rows.map(({ _grid, _assessment, ...r }) => r), null, 1),
  );
  console.log(`\naudit JSON: ${OUT_DIR}/mark-audit.json`);

  if (!SHEET) {
    process.exit(0);
  }

  // Review sheet — flagged set only, before/after, both modes.
  const DARK = '#1A2B20';
  const LIGHT = '#D9EEDD';
  const circle = (fill, img, sz = 84) =>
    `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${fill};display:flex;align-items:center;justify-content:center;flex:none"><img src="${img}" style="width:${Math.round(sz * 0.72)}px;height:${Math.round(sz * 0.72)}px;object-fit:contain"/></div>`;
  const cards = flagged
    .map((r) => {
      const beforeUri = dataUri(r._grid);
      let afterGrid = r._grid;
      if (r.plan.trim && r._assessment.bounds) {
        afterGrid = mt.composeTrimmed(
          r._grid,
          mt.trimBox(r._assessment.bounds),
          r._assessment.bakedBg,
        );
      }
      const afterUri = r.plan.trim ? dataUri(afterGrid) : beforeUri;
      const afterFillDark = r.plan.tileFill ?? DARK;
      const afterFillLight = r.plan.tileFill ?? LIGHT;
      return `<div style="border:1px solid #ccc3;border-radius:12px;padding:14px 16px;display:flex;gap:22px;align-items:center">
<div style="min-width:210px"><b>${r.key}</b><div style="opacity:.65;font-size:12px">${r.plan.flags.join(' + ')}${r.plan.tileFill ? ` · fill ${r.plan.tileFill}` : ''} · fill-ratio ${r.fillRatio}${r.okShare !== null ? ` · ok-share ${r.okShare}` : ''}</div></div>
<div style="display:flex;gap:10px;align-items:center">${circle(DARK, beforeUri)}${circle(LIGHT, beforeUri)}</div>
<div style="opacity:.5">→</div>
<div style="display:flex;gap:10px;align-items:center">${circle(afterFillDark, afterUri)}${circle(afterFillLight, afterUri)}</div>
</div>`;
    })
    .join('\n');
  const html = `<title>Mark-tile prep review</title>
<body style="font-family:-apple-system,system-ui;background:#101312;color:#eee;padding:28px;display:flex;flex-direction:column;gap:12px">
<h2 style="margin:0">Mark-tile prep — flagged set (${flagged.length} of ${ok.length}; unflagged untouched)</h2>
<p style="opacity:.7;margin:0 0 10px">Each row: before on dark + light containers → after (trimmed asset on its tileFill, or the container where no fill was picked). Thresholds: fill-ratio &lt; ${mt.FILL_RATIO_MIN}, worst-mode contrast &lt; ${mt.CONTRAST_MIN}.</p>
${cards}</body>`;
  writeFileSync(`${OUT_DIR}/mark-tiles-review.html`, html);
  console.log(`review sheet: ${OUT_DIR}/mark-tiles-review.html`);
  process.exit(0);
})().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
