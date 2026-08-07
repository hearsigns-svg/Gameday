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
import { evaluateAlerts, evaluateRosterAlerts } from './alerts';
import {
  CatalogueEntry,
  orderSweepPaths,
  tierPollsThisSweep,
} from './catalogue';
import { loadCoverage, sliceFreshness } from './coverage';
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
  pollBoxingData: {},
  pollPbc: {},
  pollTennis: {},
  pollWtaTennis: {},
  // The men's review sheet. Parameterless like the rest: which
  // tournaments it covers is decided by the sheet, not by a stored
  // follow.
  pollSheetAtp: {},
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
// Crawl-style routes cannot answer in 20s BY DESIGN: athletics walks up
// to 14 pages with 1s politeness waits (live-probed 24s in season) and
// PBC honours a 10s crawl delay per card page. Aborting them counted a
// pollError every sweep while the function completed server-side — and
// kept them out of the freshness map forever. They get the budget their
// own declared timeouts imply.
const SLOW_ROUTE_TIMEOUT_MS = 120_000;
const isSlowRoute = (p: string): boolean =>
  p.startsWith('pollAthletics') ||
  p.startsWith('pollPbc') ||
  // Up to nine sequential vendor calls (a schedule plus one per card),
  // and the sweep must not kill it mid-run: a half-fetched card spends
  // quota and lands nothing.
  p.startsWith('pollBoxingData');
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
  alertsOpen: number; // coverage alerts open after this sweep
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
    case 'pollBoxingData':
      return {
        source: 'boxingdata',
        sport: 'boxing',
        competitionId: 'boxingdata-cards',
      };
    case 'pollPbc':
      return { source: 'pbc', sport: 'boxing', competitionId: 'pbc-cards' };
    case 'pollTennis':
      return { source: 'tennis', sport: 'tennis', competitionId: 'tennis-atp' };
    case 'pollWtaTennis':
      return { source: 'wta', sport: 'tennis', competitionId: 'tennis-wta' };
    case 'pollSheetAtp':
      return { source: 'sheet', sport: 'tennis', competitionId: 'tennis-atp-sheet' };
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

async function fetchWithTimeout(
  url: string,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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

// The catalogue collection, validated exactly like device submissions:
// entries are ops-editable data, and a typo must be dropped, never
// fetched. Returns canonical paths in seed order (tier 1 before 2 the
// seed keeps that order; Firestore doc order is by id, so we re-sort by
// tier then label for determinism).
async function loadCataloguePaths(
  db: FirebaseFirestore.Firestore,
  sweepUtcHour: number,
): Promise<{ paths: string[]; dropped: number }> {
  const snap = await db.collection('catalogue').get();
  const entries = snap.docs
    .map((d) => d.data() as CatalogueEntry)
    // rankOnly rows are ORDERING data riding the same collection
    // (Prompt 11) — never routes; skipping them is not a drop.
    .filter((e) => !e.rankOnly)
    .filter((e) => e.enabled && tierPollsThisSweep(e.tier, sweepUtcHour))
    .sort((a, b) => a.tier - b.tier || a.label.localeCompare(b.label));
  const paths: string[] = [];
  let dropped = 0;
  for (const e of entries) {
    const ok = canonicalisePollPath(String(e.pollPath ?? ''));
    if (ok) paths.push(ok);
    else dropped++;
  }
  return { paths, dropped };
}

// football-data.org's free tier allows 10 requests/minute. Device paths
// alone never came close; a daily catalogue sweep carries 13 fd routes,
// so consecutive fd requests are spaced to stay inside the licence —
// politeness to fd.org is what keeps soccer coverage existing at all.
const FD_MIN_SPACING_MS = 6_500;
const isFdPath = (p: string): boolean => p.startsWith('pollFd');

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
  // DROP ORDER IS PRIORITY-BASED since Prompt 7 (closes F10): device
  // paths first — a real follower's slice is never starved by a warming
  // entry — then catalogue tier 1, then tier 2. Within each band the
  // incoming order is preserved (for devices, the same uid-scan order
  // as before, now the last tiebreak rather than the whole rule).
  // A catalogue read failure must degrade to a device-only sweep, not
  // take polling and fan-out down with it.
  let catalogue: { paths: string[]; dropped: number };
  try {
    catalogue = await loadCataloguePaths(
      db,
      new Date(startedAtMs).getUTCHours(),
    );
  } catch (e) {
    console.error(`[kickoffcal] catalogue load failed: ${e}`);
    catalogue = { paths: [], dropped: 0 };
  }
  dropped += catalogue.dropped;
  const ordered = orderSweepPaths(
    [...canonical],
    catalogue.paths,
    MAX_PATHS_PER_SWEEP,
  );
  const allPaths = [...ordered.paths, ...ordered.skippedByCap];
  const paths = ordered.paths;

  let polled = 0;
  let pollErrors = 0;
  let attempted = 0;
  let hitDeadline = false;
  let truncated = ordered.skippedByCap.length > 0;
  let lastFdAt = 0;
  const succeededPaths: string[] = [];
  for (const path of paths) {
    if (Date.now() - startedAtMs > DEADLINE_MS) {
      truncated = true;
      hitDeadline = true;
      break; // never let polling eat the fan-out
    }
    if (isFdPath(path)) {
      const sinceFd = Date.now() - lastFdAt;
      if (sinceFd < FD_MIN_SPACING_MS) await wait(FD_MIN_SPACING_MS - sinceFd);
      lastFdAt = Date.now();
    }
    attempted++;
    try {
      const res = await fetchWithTimeout(
        `${SELF_BASE}/${path}`,
        isSlowRoute(path) ? SLOW_ROUTE_TIMEOUT_MS : FETCH_TIMEOUT_MS,
      );
      if (res.ok) {
        polled++;
        succeededPaths.push(path);
      } else pollErrors++;
    } catch {
      pollErrors++;
    }
    await wait(POLL_DELAY_MS); // stay polite to providers
  }

  // DATA FRESHNESS for the client: one world-readable doc mapping each
  // canonical poll path to its last sweep-confirmed success. The app
  // reads this to distinguish "my device synced" from "the source is
  // alive" — a device syncing perfectly against a source that died a
  // month ago must stop showing green. Merge keeps paths this sweep
  // did not touch.
  try {
    const freshness = Object.fromEntries(
      succeededPaths.map((p) => [p.replace(/[./]/g, '_'), startedAt]),
    );
    if (succeededPaths.length > 0) {
      await db
        .collection('status')
        .doc('coverage')
        .set({ paths: freshness, updatedAt: startedAt }, { merge: true });
    }
  } catch (e) {
    console.error(`[kickoffcal] freshness write failed: ${e}`);
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
  // ALERTS — evaluated from the same coverage rows the report serves,
  // against the slices THIS sweep demanded. Transitions persist in
  // opsAlerts; every sweep an alert stays open logs a structured
  // console.error that Cloud Error Reporting groups and notifies on.
  let alertsOpen = 0;
  try {
    // Only slices this sweep actually REACHED: a deadline-truncated run
    // must not page about paths it never polled.
    const demanded = new Set<string>();
    for (const p of paths.slice(0, attempted)) {
      const slice = sliceOfPollPath(p);
      if (slice) demanded.add(`${slice.source}|${slice.competitionId}`);
    }
    const coverage = await loadCoverage(db, Date.now());

    // PER-SLICE FRESHNESS for the app (Prompt 16). Same rows, same
    // skip-aware lastSuccessAt the alerts are judged on, published
    // world-readable so a fixture's own card can say when its source
    // last answered — the one thing the poll-path doc cannot say,
    // because it is keyed by a client-derived route and counts a
    // skip's 2xx as contact. A write failure is logged and never fails
    // the sweep: this is presentation freshness, not correctness.
    try {
      const slices = sliceFreshness(coverage.rows);
      if (Object.keys(slices).length > 0) {
        await db
          .collection('status')
          .doc('sources')
          .set({ slices, updatedAt: startedAt }, { merge: true });
      }
    } catch (e) {
      console.error(`[kickoffcal] slice freshness write failed: ${e}`);
    }

    const active = evaluateAlerts(coverage.rows, demanded, Date.now());
    // Roster staleness comes from the dedicated marker doc, never the
    // run-window join (see alerts.ts). A marker READ FAILURE skips the
    // roster evaluation loudly rather than paging "never refreshed" —
    // a read failure must not impersonate an empty marker. The doc
    // simply not existing yet IS the empty marker: nothing has ever
    // refreshed, which is exactly what the alert should say.
    let rosterEvaluated = false;
    try {
      const markerSnap = await db.collection('status').doc('rosters').get();
      const marker =
        (markerSnap.data()?.slices as Record<string, string> | undefined) ??
        {};
      active.push(...evaluateRosterAlerts(marker, Date.now()));
      rosterEvaluated = true;
    } catch (e) {
      console.error(`[kickoffcal] roster marker read failed: ${e}`);
    }
    alertsOpen = active.length;
    const activeIds = new Set(
      active.map((a) => `${a.sliceKey}--${a.condition}`.replace(/[/|]/g, '_')),
    );
    for (const a of active) {
      const id = `${a.sliceKey}--${a.condition}`.replace(/[/|]/g, '_');
      const ref = db.collection('opsAlerts').doc(id);
      const existing = await ref.get();
      const wasOpen = existing.exists && !existing.data()?.resolvedAt;
      await ref.set(
        {
          sliceKey: a.sliceKey,
          condition: a.condition,
          detail: a.detail,
          lastSeenAt: startedAt,
          resolvedAt: null,
          ...(wasOpen ? {} : { openedAt: startedAt }),
        },
        { merge: true },
      );
      // An ERROR OBJECT, not a bare string: Cloud Error Reporting on
      // gen-2 functions ingests stack-shaped logs; a template string
      // alone may never reach it. Stable message prefix so recurrences
      // group; the stack is noise but the price of admission.
      console.error(
        new Error(
          `[kickoffcal-alert] ${a.condition} ${a.sliceKey}: ${a.detail}`,
        ),
      );
    }
    const openSnap = await db
      .collection('opsAlerts')
      .where('resolvedAt', '==', null)
      .get();
    for (const doc of openSnap.docs) {
      if (activeIds.has(doc.id)) continue;
      // Resolution needs EVIDENCE, exactly like opening: a sweep that
      // never demanded a slice (tier 2 off-hours, deadline-truncated)
      // proves nothing about it — without this check every tier-2
      // alert flapped resolved/open across the day's four sweeps.
      // ROSTER slices resolve only when THIS sweep actually evaluated
      // the marker doc: a marker read failure proves nothing, so it
      // must not resolve a real staleness alert.
      const sliceKey = String(doc.data().sliceKey ?? '');
      const rosterSlice = sliceKey.split('|')[1]?.startsWith('roster-');
      if (rosterSlice && !rosterEvaluated) continue;
      if (!rosterSlice && !demanded.has(sliceKey)) continue;
      await doc.ref.set({ resolvedAt: startedAt }, { merge: true });
      console.log(
        `[kickoffcal-alert] RESOLVED ${doc.data().condition} ${doc.data().sliceKey}`,
      );
    }
  } catch (e) {
    // Alerting must never fail the sweep it is watching.
    console.error(`[kickoffcal] alert evaluation failed: ${e}`);
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
    alertsOpen,
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
