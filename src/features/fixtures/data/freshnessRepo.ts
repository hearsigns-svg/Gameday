// Data freshness — is the SOURCE alive, not just the device sync.
//
// The sweep maintains status/coverage: one world-readable doc mapping
// each canonical poll path to its last confirmed success. A device
// syncing perfectly against a source that died a month ago used to
// show green; this is the other half of the truth.
//
// UNKNOWN is deliberately quiet on the CHIP and explicit in
// Preferences: a source with no freshness record (pre-first-sweep
// deploys, never-succeeded routes) reads as unknown, not stale — the
// chip must not nag every user the day the summary doc is born, and
// dead-source detection lives server-side in the alerts, where the
// run-history evidence is. The timestamps themselves age with the
// wall clock, so an offline device's staleness display keeps rising —
// there is no false green from a frozen cache.

import { doc, getDocFromServer } from 'firebase/firestore';
import { db } from '../../../core/firebase';
import { err, ok, Result } from '../../../core/result';
import { readJson, writeJson } from '../../../core/storage';
import { Followable } from '../../follows/data/followStore';
import { pollPathFor } from '../../follows/domain/pollPaths';
import { sliceFreshnessKey } from '../domain/sources';

const CACHE_KEY = 'dataFreshness.v1';
// Per-INGEST-SLICE freshness (status/sources), written by the sweep from
// the same coverage rows the ops report serves. Two things make it
// different from the per-poll-path doc above, and both matter for
// saying "checked 2 hours ago" beside ONE fixture:
//   · it is keyed by `source|competitionId`, which a fixture can name
//     itself — the poll-path doc can only be reached through a FOLLOW,
//     and returns nothing for a pinned fixture or a source with no
//     client-side route;
//   · it is skip-aware. The poll-path doc records any 2xx, so a
//     daily-cap skip that fetched nothing still refreshes it.
const SLICES_CACHE_KEY = 'sourceFreshness.v1';

interface FreshnessCache {
  paths: Record<string, string>; // sanitized canonical path → ISO
  fetchedAt: string;
}

// The sweep sanitizes path keys for Firestore field names; the client
// must produce the identical key. Parameterless routes' canonical form
// carries the trailing '?'.
export function freshnessKeyFor(pollPath: string): string {
  const canonical = pollPath.includes('?') ? pollPath : `${pollPath}?`;
  return canonical.replace(/[./]/g, '_');
}

// Refreshing more than hourly buys nothing — the doc changes at sweep
// cadence (6h) — and the Schedule screen refetches on every focus.
const REFRESH_MIN_INTERVAL_MS = 3_600_000;

export async function refreshDataFreshness(): Promise<
  Result<Record<string, string>>
> {
  const cached = cachedFreshness();
  if (
    cached &&
    Date.now() - Date.parse(cached.fetchedAt) < REFRESH_MIN_INTERVAL_MS
  ) {
    return ok(cached.paths);
  }
  try {
    const snap = await getDocFromServer(doc(db, 'status', 'coverage'));
    if (!snap.exists()) {
      // Not written yet (pre-catalogue deploys): unknown, not an error.
      return ok({});
    }
    const paths =
      (snap.data() as { paths?: Record<string, string> }).paths ?? {};
    const cache: FreshnessCache = {
      paths,
      fetchedAt: new Date().toISOString(),
    };
    writeJson(CACHE_KEY, cache);
    return ok(paths);
  } catch {
    return err({ kind: 'offline' });
  }
}

export function cachedFreshness(): FreshnessCache | null {
  return readJson<FreshnessCache | null>(CACHE_KEY, null);
}

export async function refreshSliceFreshness(): Promise<
  Result<Record<string, string>>
> {
  const cached = cachedSliceFreshness();
  if (
    cached &&
    Date.now() - Date.parse(cached.fetchedAt) < REFRESH_MIN_INTERVAL_MS
  ) {
    return ok(cached.paths);
  }
  try {
    const snap = await getDocFromServer(doc(db, 'status', 'sources'));
    // Not written yet (a server from before this shipped): UNKNOWN, not
    // an error and not "never checked" — the UI simply says nothing
    // about freshness rather than inventing a silence. CACHED all the
    // same, or every screen open re-asks a server that has no answer.
    const slices = snap.exists()
      ? ((snap.data() as { slices?: Record<string, string> }).slices ?? {})
      : {};
    writeJson(SLICES_CACHE_KEY, {
      paths: slices,
      fetchedAt: new Date().toISOString(),
    } satisfies FreshnessCache);
    return ok(slices);
  } catch {
    return err({ kind: 'offline' });
  }
}

export function cachedSliceFreshness(): FreshnessCache | null {
  return readJson<FreshnessCache | null>(SLICES_CACHE_KEY, null);
}

// When this fixture's own source last answered successfully, or null
// when we do not know. NULL IS A REAL ANSWER and prints nothing: an
// absent record must never render as "checked just now" or as "never".
export function sliceCheckedAt(
  fixtureId: string,
  competitionId: string,
  // A run's slice key is what the POLLER covers, which is not always the
  // fixture's own competition: NHL and MLB are polled per TEAM, so their
  // fixtures' competitionId names a league nothing runs under. The
  // fixture's follow keys include the team key, so they are tried next.
  followKeys: readonly string[] = [],
): string | null {
  const cache = cachedSliceFreshness();
  if (!cache) return null;
  for (const key of [competitionId, ...followKeys]) {
    const at = cache.paths[sliceFreshnessKey(fixtureId, key)];
    if (at) return at;
  }
  return null;
}

export interface DataStaleness {
  // Hours since the oldest followed source's last confirmed success.
  worstHours: number | null;
  // Follows whose source has no freshness record at all — unknown is
  // reported as unknown, never counted as fresh.
  unknownLabels: string[];
}

export function dataStaleness(
  follows: readonly Followable[],
  nowMs: number = Date.now(),
): DataStaleness | null {
  const cache = cachedFreshness();
  if (!cache) return null;
  let worst: number | null = null;
  const unknownLabels: string[] = [];
  for (const f of follows) {
    const path = pollPathFor(f);
    if (path === null) continue; // no route can refresh it — known state
    const at = cache.paths[freshnessKeyFor(path)];
    if (!at) {
      unknownLabels.push(f.label);
      continue;
    }
    const hours = (nowMs - Date.parse(at)) / 3_600_000;
    if (worst === null || hours > worst) worst = hours;
  }
  return { worstHours: worst, unknownLabels };
}
