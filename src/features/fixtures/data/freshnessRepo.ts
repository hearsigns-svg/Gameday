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

const CACHE_KEY = 'dataFreshness.v1';

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
