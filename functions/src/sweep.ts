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
import {
  buildSourceRun,
  EMPTY_COUNTS,
  RunContext,
  RunReason,
  TRIGGER_HEADER,
} from './sourceRuns';

const SELF_BASE =
  process.env.SELF_BASE ??
  'https://us-central1-gameday-fixtures.cloudfunctions.net';

// name → exact required params. Extra/missing params ⇒ route rejected,
// which also kills cache-busting duplicates (…&x=1, …&x=2).
// QUARANTINED 2026-07-31: pollTeam and pollLeague are gone from here.
// They front API-Sports, whose account is suspended — every call returns
// `{"access":"Your account is suspended"}` at HTTP 200. Leaving them
// allowlisted meant every sweep spent a request and a 400ms delay on a
// route that cannot succeed. The endpoints stay deployed so legacy
// devices do not 404; nothing routes to them any more.
const POLL_ROUTES: Record<string, Record<string, RegExp>> = {
  pollFdTeam: { teamId: /^\d{1,7}$/, season: /^\d{4}$/ },
  pollFdCompetition: { code: /^[A-Z0-9]{2,4}$/, season: /^\d{4}$/ },
  pollMlbTeam: { teamId: /^\d{1,7}$/, season: /^\d{4}$/ },
  pollNhlTeam: { abbrev: /^[A-Z]{2,3}$/, season: /^\d{8}$/ },
  pollF1: { season: /^\d{4}$/ },
  // Parameterless: each has exactly one feed, and the window is computed
  // server-side from the clock rather than baked into a stored follow.
  pollPbc: {},
  pollTennis: {},
  pollWtaTennis: {},
  pollAthletics: {},
  pollTsdbLeague: {
    leagueId: /^\d{3,6}$/,
    season: /^[0-9-]{4,9}$/,
    sport: /^[a-z-]{2,20}$/,
    // 1-3 digits: the County Championship is configured at 96 hours and
    // a single-digit rule dropped its path from every sweep since the day
    // it was written, silently, for months.
    durationHours: /^\d{1,3}(\.\d)?$/,
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

// How many skipped paths to name in the record. Naming none made
// truncation a bare boolean with no way to know WHAT stopped being
// refreshed; naming all of them is unbounded. The list is capped and the
// cap is reported, never silently applied.
const MAX_SKIPPED_NAMED = 200;

export interface SweepResult {
  paths: number; // paths actually attempted this run
  dropped: number; // submitted routes rejected by the allowlist
  polled: number;
  pollErrors: number;
  changes: number;
  devicesNotified: number;
  tokensPruned: number;
  truncated: boolean;
  // Truncation detail. `truncated` alone said a ceiling was hit but not
  // which competitions stopped being refreshed because of it — and a
  // silently unrefreshed slice is exactly what this remediation is about.
  pathsSeen: number; // distinct valid paths across all devices
  skippedByCap: number; // beyond MAX_PATHS_PER_SWEEP
  skippedByDeadline: number; // in range but the clock ran out first
  skippedPaths: string[]; // up to MAX_SKIPPED_NAMED of them
  skippedPathsNamed: number; // how many of the skipped are listed above
  truncationReason: 'cap' | 'deadline' | 'cap+deadline' | null;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Which ingest slice a canonical poll path covers. Pure; used to give a
// skipped path an identity in the coverage report.
export function sliceOfPollPath(
  path: string,
): { source: string; sport: string; competitionId: string } | null {
  const [name, query = ''] = path.split('?');
  const p = Object.fromEntries(
    query.split('&').filter(Boolean).map((kv) => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i), kv.slice(i + 1)];
    }),
  );
  switch (name) {
    case 'pollTsdbLeague':
      return {
        source: 'tsdb',
        sport: p.sport ?? '',
        competitionId: `tsdb-league-${p.leagueId}`,
      };
    case 'pollFdCompetition':
      return {
        source: 'fdorg',
        sport: 'soccer',
        competitionId: `fdorg-comp-${p.code}`,
      };
    case 'pollFdTeam':
      return {
        source: 'fdorg',
        sport: 'soccer',
        competitionId: `fdorg-team-${p.teamId}`,
      };
    case 'pollMlbTeam':
      return {
        source: 'mlb',
        sport: 'baseball',
        competitionId: `mlb-team-${p.teamId}`,
      };
    case 'pollNhlTeam':
      return {
        source: 'nhl',
        sport: 'ice-hockey',
        competitionId: `nhl-team-${p.abbrev}`,
      };
    case 'pollF1':
      return { source: 'f1', sport: 'f1', competitionId: 'f1-series-1' };
    case 'pollPbc':
      return { source: 'pbc', sport: 'boxing', competitionId: 'pbc-cards' };
    case 'pollTennis':
      return { source: 'tennis', sport: 'tennis', competitionId: 'tennis-atp' };
    case 'pollWtaTennis':
      return { source: 'wta', sport: 'tennis', competitionId: 'tennis-wta' };
    case 'pollAthletics':
      return { source: 'wa', sport: 'athletics', competitionId: 'wa-calendar' };
    default:
      return null;
  }
}

// A path the sweep never got to is a slice that silently stopped being
// refreshed — which is the whole failure this remediation exists to make
// visible. It gets a run record so it shows up in coverageReport as a
// slice with no successful run, rather than vanishing into a boolean.
//
// This is the ONE place the sweep writes sourceRuns. It is not a connector
// invocation, which is why it carries a `reason` rather than an `error`.
async function recordSkipped(
  db: FirebaseFirestore.Firestore,
  paths: readonly string[],
  reason: RunReason,
  startedAt: string,
): Promise<void> {
  for (const path of paths) {
    const slice = sliceOfPollPath(path);
    if (!slice) continue;
    try {
      const ref = db.collection('sourceRuns').doc();
      const ctx: RunContext = {
        trigger: 'sweep',
        ...slice,
        pollPath: path,
        seasonRequested: null,
      };
      await ref.set(
        buildSourceRun(
          ref.id,
          ctx,
          {
            httpStatus: null,
            seasonResolved: null,
            seasonsTried: [],
            counts: EMPTY_COUNTS,
            error: null,
            reason,
          },
          startedAt,
          Date.now(),
        ),
      );
    } catch (e) {
      console.error(`[kickoffcal] skipped-run write failed for ${path}: ${e}`);
    }
  }
}

export interface SkippedSummary {
  skippedByCap: number;
  skippedByDeadline: number;
  skippedPaths: string[];
  skippedPathsNamed: number;
  truncationReason: SweepResult['truncationReason'];
}

// What this run never touched, and why. Pure so the accounting can be
// tested; sweepAll itself is all I/O.
export function summariseSkipped(
  allPaths: readonly string[],
  maxPaths: number,
  attempted: number,
  hitDeadline: boolean,
): SkippedSummary {
  const byCap = allPaths.slice(maxPaths);
  // Deadline skips are the tail of what the cap DID admit.
  const byDeadline = hitDeadline
    ? allPaths.slice(attempted, Math.min(allPaths.length, maxPaths))
    : [];
  const all = [...byCap, ...byDeadline];
  return {
    skippedByCap: byCap.length,
    skippedByDeadline: byDeadline.length,
    skippedPaths: all.slice(0, MAX_SKIPPED_NAMED),
    skippedPathsNamed: Math.min(all.length, MAX_SKIPPED_NAMED),
    truncationReason:
      byCap.length > 0 && byDeadline.length > 0
        ? 'cap+deadline'
        : byCap.length > 0
          ? 'cap'
          : byDeadline.length > 0
            ? 'deadline'
            : null,
  };
}

const asStringList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // The poller, not the sweep, writes the per-run record (the sweep only
    // ever sees an aggregate 2xx). It tells the poller who asked, so a
    // scheduled run is distinguishable from a follow warming the cache.
    return await fetch(url, {
      signal: controller.signal,
      headers: { [TRIGGER_HEADER]: 'sweep' },
    });
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
  // DROP ORDER IS ARBITRARY. `canonical` is a Set in first-insertion
  // order, and insertion follows the device scan — Firestore's natural
  // document order (anonymous uid, ascending) — then each device's own
  // pollPaths array order. So what survives the cap is decided by uid
  // lexicography, not by how many users follow a competition or how stale
  // it is. Left as-is deliberately; see docs/PLAN.md Stage 1b item 5.
  const allPaths = [...canonical];
  const paths = allPaths.slice(0, MAX_PATHS_PER_SWEEP);

  let polled = 0;
  let pollErrors = 0;
  let attempted = 0;
  let hitDeadline = false;
  let truncated = allPaths.length > paths.length;
  for (const path of paths) {
    if (Date.now() - startedAtMs > DEADLINE_MS) {
      truncated = true;
      hitDeadline = true;
      break; // never let polling eat the fan-out
    }
    attempted++;
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

  const skipped = summariseSkipped(
    allPaths,
    MAX_PATHS_PER_SWEEP,
    attempted,
    hitDeadline,
  );
  await recordSkipped(
    db,
    allPaths.slice(MAX_PATHS_PER_SWEEP),
    'skipped_sweep_cap',
    startedAt,
  );
  if (hitDeadline) {
    await recordSkipped(
      db,
      allPaths.slice(attempted, Math.min(allPaths.length, MAX_PATHS_PER_SWEEP)),
      'skipped_sweep_deadline',
      startedAt,
    );
  }
  const summary: SweepResult = {
    paths: attempted,
    dropped,
    polled,
    pollErrors,
    changes: changesSnap.size,
    devicesNotified,
    tokensPruned,
    truncated,
    pathsSeen: allPaths.length,
    ...skipped,
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
