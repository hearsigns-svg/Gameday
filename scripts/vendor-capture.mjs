// Vendor trial capture (Track 3). Vendor-neutral on purpose: point it at
// any endpoint and it records what CHANGED, not what was returned.
//
// The claim every tennis data vendor makes is "we have order of play".
// The claim that actually matters to a calendar app is that a match
// already written into someone's phone gets CORRECTED — the reschedule,
// the rain delay, the withdrawal. A single snapshot cannot show that and
// a sales page never does. So this polls, diffs, and writes only the
// transitions, which is the evidence the trial exists to gather.
//
//   VENDOR_URL='https://…' \
//   VENDOR_HEADERS='{"x-api-key":"…"}' \
//   VENDOR_INTERVAL_S=300 \
//   VENDOR_OUT=./vendor-capture \
//   node scripts/vendor-capture.mjs
//
// Runs until stopped. Ctrl-C is a normal exit; the log is complete at
// every moment, never only at the end.

import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const url = process.env.VENDOR_URL;
if (!url) {
  console.error('VENDOR_URL is required');
  process.exit(1);
}
const headers = JSON.parse(process.env.VENDOR_HEADERS ?? '{}');
const intervalMs = Number(process.env.VENDOR_INTERVAL_S ?? 300) * 1000;
const outDir = process.env.VENDOR_OUT ?? './vendor-capture';
mkdirSync(outDir, { recursive: true });
const log = join(outDir, 'transitions.jsonl');

// Flatten to leaf paths so a diff names the FIELD that moved — "…
// .matches[3].scheduledTime" — rather than dumping two objects and
// leaving the reader to find it.
function leaves(value, path = '', out = new Map()) {
  if (value === null || typeof value !== 'object') {
    out.set(path, value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => leaves(v, `${path}[${i}]`, out));
    return out;
  }
  for (const [k, v] of Object.entries(value)) leaves(v, `${path}.${k}`, out);
  return out;
}

function diff(before, after) {
  const a = leaves(before);
  const b = leaves(after);
  const changes = [];
  for (const [k, v] of b) {
    if (!a.has(k)) changes.push({ path: k, from: null, to: v, kind: 'added' });
    else if (JSON.stringify(a.get(k)) !== JSON.stringify(v))
      changes.push({ path: k, from: a.get(k), to: v, kind: 'changed' });
  }
  for (const [k, v] of a) {
    if (!b.has(k)) changes.push({ path: k, from: v, to: null, kind: 'removed' });
  }
  return changes;
}

let previous = null;
let n = 0;

async function tick() {
  const at = new Date().toISOString();
  try {
    const res = await fetch(url, { headers });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      // Not JSON is itself a finding — record it and keep going rather
      // than crashing out of an overnight capture.
      appendFileSync(
        log,
        JSON.stringify({ at, status: res.status, error: 'non-json', sample: text.slice(0, 400) }) + '\n',
      );
      return;
    }
    if (previous === null) {
      // The baseline is written whole, once: every later line is a
      // change against something the reader can actually see.
      writeFileSync(join(outDir, 'baseline.json'), JSON.stringify(body, null, 2));
      appendFileSync(log, JSON.stringify({ at, status: res.status, baseline: true }) + '\n');
    } else {
      const changes = diff(previous, body);
      if (changes.length > 0) {
        appendFileSync(log, JSON.stringify({ at, status: res.status, changes }) + '\n');
        console.log(`${at}  ${changes.length} change(s)`);
      }
    }
    previous = body;
    n += 1;
    if (n % 12 === 0) console.log(`${at}  ${n} polls, log: ${log}`);
  } catch (e) {
    // A failed poll is recorded, never silent: a gap in the log would
    // otherwise be indistinguishable from a feed that stopped changing.
    appendFileSync(log, JSON.stringify({ at, error: String(e) }) + '\n');
  }
}

await tick();
setInterval(tick, intervalMs);
