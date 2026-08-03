// Coverage report — what each connector has actually delivered lately.
//
// Reads sourceRuns (what happened) and the fixture cache (what survives),
// and joins them per ingest slice. The two questions it exists to answer:
//   1. when did this source last run WITHOUT erroring, and
//   2. when did it last produce anything a user could see (non-zero yield)
// — because in this system those are very different dates, and the second
// one is the one nobody could previously ask.
//
// Read-only. PURE except for loadCoverage.

import { Firestore } from 'firebase-admin/firestore';
import { SourceRun } from './sourceRuns';

// Ceiling on the run scan. Truncation is REPORTED, never silent: a report
// that quietly dropped half the history would be worse than no report.
export const MAX_RUNS_SCANNED = 5000;

export interface CoverageRow {
  source: string;
  competitionId: string;
  sport: string | null;
  storedFutureDated: number;
  runsInWindow: number;
  lastRunAt: string | null;
  lastSuccessAt: string | null; // most recent run with error === null
  lastNonZeroYieldAt: string | null; // most recent run that yielded a future fixture
  hoursSinceLastRun: number | null;
  hoursSinceLastSuccess: number | null;
  hoursSinceLastNonZeroYield: number | null;
  // Error/reason of the most recent NON-SKIP run (Prompt 11b): a skip
  // record carries no evidence about the provider's answer, and a
  // daily-cap skip landing after the real fetch must not read as an
  // honest empty — that suppressed yield_died exactly when F40 proved
  // it load-bearing. Alerting must still never page on a season that
  // simply ended (no_future_events reads through later skips).
  lastError: string | null;
  lastReason: string | null;
  lastSeasonResolved: string | null;
}

export interface CoverageReport {
  generatedAt: string;
  runsScanned: number;
  truncated: boolean;
  totals: {
    rows: number;
    neverRun: number; // stored fixtures but no run record
    neverSucceeded: number; // run records but never one without an error
    zeroYield: number; // no run has produced a future fixture
    storedFutureDated: number;
  };
  rows: CoverageRow[];
}

export interface StoredSlice {
  sport: string | null;
  futureDated: number;
}

// The stored side of the join.
//
// A run is identified by its INGEST SLICE KEY (`mlb-team-147`), but a
// fixture names its competition (`mlb-league-1`). Counting stored fixtures
// by competitionId alone made the two sides miss each other completely:
// every team poller read as "stored nothing" and every league as "never
// polled". Fixtures are therefore counted against every followKey they
// carry — which always includes their own competitionId — so a slice row
// means "future fixtures this follow would actually deliver".
export interface StoredCoverage {
  bySlice: Map<string, StoredSlice>; // sliceKey → counts, over followKeys
  competitionKeys: Set<string>; // sliceKeys that are some fixture's own competition
  futureDocs: number; // DISTINCT future-dated fixtures, for the totals
}

export const emptyStoredCoverage = (): StoredCoverage => ({
  bySlice: new Map(),
  competitionKeys: new Set(),
  futureDocs: 0,
});

export const sliceKey = (source: string, competitionId: string): string =>
  `${source}|${competitionId}`;

// Provider prefix of a fixture id ('tsdb-2541770' → 'tsdb'), matching
// identity.ts::providerOf so the two never disagree about what a source is.
export function sourceOfFixtureId(id: string): string {
  return id.split('-')[0];
}

function hoursSince(iso: string | null, nowMs: number): number | null {
  if (iso === null) return null;
  return Math.round(((nowMs - Date.parse(iso)) / 3_600_000) * 10) / 10;
}

export function buildCoverageReport(
  runs: readonly SourceRun[],
  stored: StoredCoverage,
  nowMs: number,
  truncated = false,
): CoverageReport {
  const byKey = new Map<string, SourceRun[]>();
  for (const r of runs) {
    const k = sliceKey(r.source, r.competitionId);
    byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }

  // Union of both sides: a slice with runs but no stored fixtures is as
  // interesting as one with stored fixtures nobody polls any more. Rows
  // come from what was RUN and from what competitions exist — not from
  // every followKey, which would put all 1,581 team keys in an ops report.
  const keys = new Set([...byKey.keys(), ...stored.competitionKeys]);
  const rows: CoverageRow[] = [];
  for (const key of keys) {
    const [source, competitionId] = key.split('|');
    const mine = [...(byKey.get(key) ?? [])].sort((a, b) =>
      a.startedAt.localeCompare(b.startedAt),
    );
    const latest = mine.at(-1) ?? null;
    // A SKIP record is not a success: it says the sweep never reached
    // the slice. Counting it as one refreshed lastSuccessAt every run
    // and silently masked no_success_24h for a slice that was being
    // skipped to death. Honest empties (no_future_events) remain
    // successes — the provider answered.
    const lastSuccess =
      [...mine]
        .reverse()
        .find(
          (r) => r.error === null && !String(r.reason ?? '').startsWith('skipped'),
        ) ?? null;
    // The latest run that actually FETCHED (or tried to). Skip records
    // carry no evidence about the provider's answer, so a skip as the
    // literal latest run must not supply lastReason/lastError: a
    // 'skipped_ics_daily_cap' reading as an honest empty suppressed
    // yield_died for tennis-atp exactly when F40 proved that alert is
    // load-bearing (Prompt 11b).
    const lastFetch =
      [...mine]
        .reverse()
        .find((r) => !String(r.reason ?? '').startsWith('skipped')) ?? null;
    const lastYield = [...mine].reverse().find((r) => !r.zeroYield) ?? null;
    const slice = stored.bySlice.get(key);
    rows.push({
      source,
      competitionId,
      sport: slice?.sport ?? latest?.sport ?? null,
      storedFutureDated: slice?.futureDated ?? 0,
      runsInWindow: mine.length,
      lastRunAt: latest?.startedAt ?? null,
      lastSuccessAt: lastSuccess?.startedAt ?? null,
      lastNonZeroYieldAt: lastYield?.startedAt ?? null,
      hoursSinceLastRun: hoursSince(latest?.startedAt ?? null, nowMs),
      hoursSinceLastSuccess: hoursSince(lastSuccess?.startedAt ?? null, nowMs),
      hoursSinceLastNonZeroYield: hoursSince(
        lastYield?.startedAt ?? null,
        nowMs,
      ),
      lastError: lastFetch?.error ?? null,
      lastReason: lastFetch?.reason ?? null,
      lastSeasonResolved: lastSuccess?.seasonResolved ?? null,
    });
  }

  // Worst first: never-yielded before long-ago-yielded before healthy, so
  // the top of the report is the list of things to look at.
  rows.sort((a, b) => {
    const ay = a.hoursSinceLastNonZeroYield;
    const by = b.hoursSinceLastNonZeroYield;
    if (ay === null && by !== null) return -1;
    if (by === null && ay !== null) return 1;
    if (ay !== null && by !== null && ay !== by) return by - ay;
    if (a.storedFutureDated !== b.storedFutureDated) {
      return a.storedFutureDated - b.storedFutureDated;
    }
    return sliceKey(a.source, a.competitionId).localeCompare(
      sliceKey(b.source, b.competitionId),
    );
  });

  return {
    generatedAt: new Date(nowMs).toISOString(),
    runsScanned: runs.length,
    truncated,
    totals: {
      rows: rows.length,
      neverRun: rows.filter((r) => r.lastRunAt === null).length,
      neverSucceeded: rows.filter(
        (r) => r.lastRunAt !== null && r.lastSuccessAt === null,
      ).length,
      zeroYield: rows.filter((r) => r.lastNonZeroYieldAt === null).length,
      // Distinct documents, NOT the sum of the column: a fixture belongs
      // to several slices at once, so summing rows would triple-count.
      storedFutureDated: stored.futureDocs,
    },
    rows,
  };
}

// Future-dated fixture counts per (source, slice). Projection query: the
// report needs three fields, not 10k full documents.
export async function loadStoredSlices(
  db: Firestore,
  nowIso: string,
): Promise<StoredCoverage> {
  const snap = await db
    .collection('fixtures')
    .where('startUtc', '>=', nowIso)
    .select('competitionId', 'sport', 'followKeys')
    .get();
  const out = emptyStoredCoverage();
  out.futureDocs = snap.size;
  for (const doc of snap.docs) {
    const data = doc.data() as {
      competitionId?: string;
      sport?: string;
      followKeys?: unknown;
    };
    const source = sourceOfFixtureId(doc.id);
    const followKeys = Array.isArray(data.followKeys)
      ? data.followKeys.filter((k): k is string => typeof k === 'string')
      : [];
    // competitionId is always among followKeys by adapter construction,
    // but a doc predating that is still counted for its own competition.
    const keys = new Set(
      data.competitionId ? [...followKeys, data.competitionId] : followKeys,
    );
    for (const k of keys) {
      const key = sliceKey(source, k);
      const prev = out.bySlice.get(key);
      out.bySlice.set(key, {
        sport: data.sport ?? prev?.sport ?? null,
        futureDated: (prev?.futureDated ?? 0) + 1,
      });
    }
    if (data.competitionId) {
      out.competitionKeys.add(sliceKey(source, data.competitionId));
    }
  }
  return out;
}

export async function loadCoverage(
  db: Firestore,
  nowMs: number,
): Promise<CoverageReport> {
  const runsSnap = await db
    .collection('sourceRuns')
    .orderBy('startedAt', 'desc')
    .limit(MAX_RUNS_SCANNED)
    .get();
  const runs = runsSnap.docs.map((d) => d.data() as SourceRun);
  const stored = await loadStoredSlices(db, new Date(nowMs).toISOString());
  return buildCoverageReport(
    runs,
    stored,
    nowMs,
    runsSnap.size >= MAX_RUNS_SCANNED,
  );
}
