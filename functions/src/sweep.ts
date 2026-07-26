// The background sweep — the piece that makes "your calendar corrects
// itself" true without opening the app. Unions poll routes across
// registered devices, re-polls each, then fans out silent pushes to
// devices whose follows were touched by any change since the LAST
// sweep (not this one's start — changes land between sweeps too).
//
// Device docs are client-writable, so every submitted route is
// re-validated server-side against a canonical allowlist: function name
// must be a known poller, params must be the exact expected set, and
// values must match their type. Anything else is dropped, not fetched.

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const SELF_BASE =
  process.env.SELF_BASE ??
  'https://us-central1-gameday-fixtures.cloudfunctions.net';

// name → exact required params. Extra/missing params ⇒ route rejected,
// which also kills cache-busting duplicates (…&x=1, …&x=2).
const POLL_ROUTES: Record<string, Record<string, RegExp>> = {
  pollTeam: { teamId: /^\d{1,7}$/, season: /^\d{4}$/ },
  pollLeague: { leagueId: /^\d{1,7}$/, season: /^\d{4}$/ },
  pollFdTeam: { teamId: /^\d{1,7}$/, season: /^\d{4}$/ },
  pollFdCompetition: { code: /^[A-Z0-9]{2,4}$/, season: /^\d{4}$/ },
  pollMlbTeam: { teamId: /^\d{1,7}$/, season: /^\d{4}$/ },
  pollNhlTeam: { abbrev: /^[A-Z]{2,3}$/, season: /^\d{8}$/ },
  pollF1: { season: /^\d{4}$/ },
  pollTsdbLeague: {
    leagueId: /^\d{3,6}$/,
    season: /^[0-9-]{4,9}$/,
    sport: /^[a-z-]{2,20}$/,
    durationHours: /^\d(\.\d)?$/,
  },
};

const MAX_PATHS_PER_SWEEP = 250; // wall-clock guard, see POLL_DELAY_MS
const POLL_DELAY_MS = 400;
const FETCH_TIMEOUT_MS = 20_000;
const FCM_BATCH = 450; // sendEachForMulticast hard-caps at 500
const DEADLINE_MS = 480_000; // leave headroom inside the 540s timeout

// Canonicalise so equivalent routes dedupe to one fetch regardless of
// param order, and reject anything not exactly matching a known route.
export function canonicalisePollPath(path: string): string | null {
  const [name, query = ''] = path.split('?');
  const spec = POLL_ROUTES[name];
  if (!spec) return null;
  const params = new Map<string, string>();
  for (const part of query.split('&')) {
    if (!part) continue;
    const idx = part.indexOf('=');
    if (idx < 1) return null;
    const k = part.slice(0, idx);
    const v = part.slice(idx + 1);
    if (params.has(k)) return null;
    params.set(k, v);
  }
  const expected = Object.keys(spec);
  if (params.size !== expected.length) return null;
  for (const key of expected) {
    const value = params.get(key);
    if (value === undefined || !spec[key].test(value)) return null;
  }
  const ordered = expected.map((k) => `${k}=${params.get(k)}`).join('&');
  return `${name}?${ordered}`;
}

interface DeviceDoc {
  token?: string | null;
  tokenType?: string | null;
  followKeys?: unknown;
  pollPaths?: unknown;
}

export interface SweepResult {
  paths: number;
  dropped: number;
  polled: number;
  pollErrors: number;
  changes: number;
  devicesNotified: number;
  tokensPruned: number;
  truncated: boolean;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const asStringList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function sweepAll(): Promise<SweepResult> {
  const db = getFirestore();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();

  // Fan-out window: everything since the last completed sweep, so
  // changes ingested between sweeps (interactive follows, manual polls)
  // still notify. First ever sweep looks back one interval.
  const lastSweepSnap = await db
    .collection('sweeps')
    .orderBy('startedAt', 'desc')
    .limit(1)
    .get();
  const since =
    (lastSweepSnap.docs[0]?.data().startedAt as string | undefined) ??
    new Date(startedAtMs - 6 * 3600_000).toISOString();

  const devicesSnap = await db
    .collection('devices')
    .select('token', 'tokenType', 'followKeys', 'pollPaths')
    .get();
  const devices = devicesSnap.docs.map((d) => d.data() as DeviceDoc);

  const canonical = new Set<string>();
  let dropped = 0;
  for (const d of devices) {
    for (const raw of asStringList(d.pollPaths)) {
      const ok = canonicalisePollPath(raw);
      if (ok) canonical.add(ok);
      else dropped++;
    }
  }
  const allPaths = [...canonical];
  const paths = allPaths.slice(0, MAX_PATHS_PER_SWEEP);

  let polled = 0;
  let pollErrors = 0;
  let truncated = allPaths.length > paths.length;
  for (const path of paths) {
    if (Date.now() - startedAtMs > DEADLINE_MS) {
      truncated = true;
      break; // never let polling eat the fan-out
    }
    try {
      const res = await fetchWithTimeout(`${SELF_BASE}/${path}`);
      if (res.ok) polled++;
      else pollErrors++;
    } catch {
      pollErrors++;
    }
    await wait(POLL_DELAY_MS); // stay polite to providers
  }

  const changesSnap = await db
    .collection('fixtureChanges')
    .where('at', '>=', since)
    .get();
  const touchedKeys = new Set<string>();
  for (const c of changesSnap.docs) {
    for (const k of asStringList(c.data().followKeys)) touchedKeys.add(k);
  }

  // Only FCM registration tokens are sendable by the Admin SDK; iOS
  // devices currently register raw APNs tokens (tokenType 'apns') and
  // are skipped rather than silently failing — see docs/PLAN.md M6.
  const targets = new Map<string, string[]>(); // token → owning doc ids
  devicesSnap.docs.forEach((docSnap) => {
    const d = docSnap.data() as DeviceDoc;
    if (!d.token || d.tokenType !== 'fcm') return;
    if (!asStringList(d.followKeys).some((k) => touchedKeys.has(k))) return;
    targets.set(d.token, [...(targets.get(d.token) ?? []), docSnap.id]);
  });

  let devicesNotified = 0;
  let tokensPruned = 0;
  const tokens = [...targets.keys()];
  if (tokens.length > 0) {
    const messaging = getMessaging();
    for (let i = 0; i < tokens.length; i += FCM_BATCH) {
      const batchTokens = tokens.slice(i, i + FCM_BATCH);
      const result = await messaging.sendEachForMulticast({
        tokens: batchTokens,
        data: { type: 'sync' },
        android: { priority: 'high' },
        apns: {
          payload: { aps: { 'content-available': 1 } },
          headers: { 'apns-priority': '5', 'apns-push-type': 'background' },
        },
      });
      devicesNotified += result.successCount;
      // Prune dead tokens so the list cannot grow stale forever.
      await Promise.all(
        result.responses.map(async (r, idx) => {
          const code = r.error?.code ?? '';
          if (
            !code.includes('registration-token-not-registered') &&
            !code.includes('invalid-argument')
          ) {
            return;
          }
          for (const id of targets.get(batchTokens[idx]) ?? []) {
            await db
              .collection('devices')
              .doc(id)
              .set({ token: null, tokenType: null }, { merge: true });
            tokensPruned++;
          }
        }),
      );
    }
  }

  const summary: SweepResult = {
    paths: paths.length,
    dropped,
    polled,
    pollErrors,
    changes: changesSnap.size,
    devicesNotified,
    tokensPruned,
    truncated,
  };
  await db.collection('sweeps').doc(startedAt).set({
    ...summary,
    startedAt,
    since,
    finishedAt: new Date().toISOString(),
    expiresAt: Timestamp.fromMillis(Date.now() + 30 * 86_400_000),
  });
  return summary;
}
