// Watch the men's ATP appearance docs for a REAL schedule change.
//
// The claim that matters for a calendar app is not "we have the order of
// play" — it is that a match ALREADY IN SOMEBODY'S CALENDAR gets
// corrected when the order of play moves. That correction has to be an
// UPDATE to the same document, because a delete-and-recreate loses the
// user's reminder, their per-event settings, and their place in the day.
//
// So this records the doc id alongside the time. A changed startUtc on
// an UNCHANGED id is the proof. A disappeared id plus a new one is the
// failure mode, and it would be just as visible here.
//
//   node scripts/atp-watch.mjs            # one pass, prints a diff
//   node scripts/atp-watch.mjs --loop 300 # keep checking every 5 min
//
// State lives in scripts/.atp-watch.json (gitignored via *.json? no —
// pass --state to put it in a scratch dir).

import admin from 'firebase-admin';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = args.indexOf(name);
  return i === -1 ? dflt : args[i + 1];
};
const statePath = argOf('--state', '/tmp/atp-watch.json');
const logPath = argOf('--log', '/tmp/atp-watch.log');
const loopSeconds = args.includes('--loop') ? Number(argOf('--loop', 300)) : null;

admin.initializeApp({ projectId: 'gameday-fixtures' });
const db = admin.firestore();

async function snapshot() {
  const snap = await db
    .collection('fixtures')
    .where('competitionId', '==', 'tennis-atp-appearances')
    .get();
  const out = {};
  for (const d of snap.docs) {
    const f = d.data();
    out[d.id] = {
      startUtc: f.startUtc,
      status: f.status,
      timePrecision: f.timePrecision ?? null,
      confidence: f.confidence ?? null,
      title: f.title ?? '',
    };
  }
  return out;
}

function diff(before, after) {
  const events = [];
  for (const [id, a] of Object.entries(after)) {
    const b = before[id];
    if (!b) {
      events.push({ kind: 'added', id, to: a });
      continue;
    }
    const fields = ['startUtc', 'status', 'timePrecision', 'confidence'];
    const changed = fields.filter((k) => b[k] !== a[k]);
    if (changed.length > 0) {
      events.push({
        kind: 'CHANGED_IN_PLACE',
        id,
        title: a.title,
        changes: changed.map((k) => ({ field: k, from: b[k], to: a[k] })),
      });
    }
  }
  for (const id of Object.keys(before)) {
    // A doc that vanishes is the thing this watch exists to catch: a
    // reschedule implemented as delete-and-recreate would show up as a
    // removal plus an addition, never as a change.
    if (!after[id]) events.push({ kind: 'removed', id, was: before[id] });
  }
  return events;
}

async function pass() {
  const now = new Date().toISOString();
  const after = await snapshot();
  if (!existsSync(statePath)) {
    writeFileSync(statePath, JSON.stringify(after, null, 1));
    console.log(`${now}  baseline: ${Object.keys(after).length} docs`);
    return;
  }
  const before = JSON.parse(readFileSync(statePath, 'utf8'));
  const events = diff(before, after);
  if (events.length === 0) {
    console.log(`${now}  no change (${Object.keys(after).length} docs)`);
  } else {
    for (const e of events) {
      const line = JSON.stringify({ at: now, ...e });
      appendFileSync(logPath, line + '\n');
      if (e.kind === 'CHANGED_IN_PLACE') {
        console.log(
          `${now}  ${e.kind}  ${e.title}\n    ${e.changes
            .map((c) => `${c.field}: ${c.from} -> ${c.to}`)
            .join('\n    ')}\n    id (unchanged): ${e.id}`,
        );
      } else {
        console.log(`${now}  ${e.kind}  ${e.id}`);
      }
    }
    writeFileSync(statePath, JSON.stringify(after, null, 1));
  }
}

await pass();
if (loopSeconds !== null) {
  setInterval(() => {
    pass().catch((e) => console.log(`error: ${e}`));
  }, loopSeconds * 1000);
} else {
  process.exit(0);
}
