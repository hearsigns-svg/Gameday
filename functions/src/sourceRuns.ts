// Per-connector run records — the observability floor.
//
// Before this, a connector that stopped working was invisible: the sweep
// counts any 2xx as a win (sweep.ts:147), and every adapter answers an
// empty season with HTTP 200 and zero rows. A dropped poll path was found
// by hand-replaying a validator. That must never be the detection
// mechanism again.
//
// So EVERY connector invocation writes one doc here, whatever happened:
// success, provider error, or the honest "the season exists and has
// nothing upcoming in it". The distinction the standing invariant demands
// — a read failure must never be indistinguishable from an empty result —
// lives in the pair (error, counts): an error carries a message and a
// status, an empty result carries neither and still sets zeroYield.
//
// PURE except for recordSourceRun; everything else is unit-tested.

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { Fixture } from './fixture';

export type RunTrigger = 'sweep' | 'follow' | 'manual' | 'roster';

// Set by the sweep when it self-calls a poller, and by the app when a
// follow warms the cache. Anything else is somebody at a terminal.
export const TRIGGER_HEADER = 'x-kickoffcal-trigger';

export function triggerOf(raw: string | undefined | null): RunTrigger {
  if (raw === 'sweep') return 'sweep';
  if (raw === 'follow') return 'follow';
  return 'manual';
}

export interface RunCounts {
  fetched: number; // rows the provider actually returned
  parsed: number; // rows the adapter turned into Fixtures
  rejected: number; // failed validation — always 0 until Stage 6
  stored: number; // docs actually written this run
  unchanged: number; // docs identical to the cache, so skipped
  futureDated: number; // parsed fixtures that have not started yet
}

export const EMPTY_COUNTS: RunCounts = {
  fetched: 0,
  parsed: 0,
  rejected: 0,
  stored: 0,
  unchanged: 0,
  futureDated: 0,
};

// Identity of the thing being polled. `competitionId` is the INGEST SLICE
// KEY — the followKey the fetched fixtures are diffed against — because
// that, not the display competition, is what a run actually covers and
// what Stage 4's reaper will reconcile.
export interface RunContext {
  trigger: RunTrigger;
  source: string; // provider prefix: tsdb | fdorg | nhl | mlb | f1 | apisports
  sport: string;
  competitionId: string;
  pollPath: string;
  seasonRequested: string | null;
}

export interface RunOutcome {
  httpStatus: number | null;
  seasonResolved: string | null;
  seasonsTried: string[];
  counts: RunCounts;
  error: string | null;
  // Why a run yielded nothing when nothing went wrong. An error means the
  // provider failed us; a reason means it answered honestly and the answer
  // was "there is no live season" or "this run never happened".
  reason?: RunReason;
  // What the reaper decided for this slice (Prompt 6). Present whenever
  // a successful non-empty fetch was measured against the stored slice —
  // dry runs record candidates with applied 0, so the would-reap list is
  // visible in the run history before the reaper is ever enabled.
  reap?: {
    candidates: number;
    cascade: number; // reaped parents' future appearances, dry runs too
    applied: number;
    liveCount: number;
    guardTripped: boolean;
    sampleIds: string[]; // capped, for the ops eye — never the full list
  };
  // Canonical-identity resolution counts for appearance slices
  // (Prompt 8): certain / confident / ambiguous / created / collisions.
  // Identity decisions are quiet by nature; the run record is where
  // they stop being invisible.
  resolution?: Record<string, unknown>;
  // Roster refresh outcome (Prompt 8): created / updated / deactivated /
  // skippedAmbiguous, for the roster-* slices.
  roster?: Record<string, unknown>;
}

export type RunReason =
  | 'no_future_events'
  | 'skipped_sweep_cap'
  | 'skipped_sweep_deadline'
  // The Tennis TV ICS is fetched once daily by owner ruling; an
  // invocation inside the window records this and fetches nothing.
  // The 'skipped' prefix matters: coverage counts a reasonless
  // error-free run as a success, and a cap-skip must never refresh
  // lastSuccessAt (that is how sweep-skips once masked a dead slice).
  | 'skipped_ics_daily_cap'
  // A fetch that FAILED buys a short cool-down. The daily cap is keyed
  // on the last SUCCESS, so a rate-limited source stays permanently
  // due and every retry hits it again — which is exactly what three
  // follow taps did to Google's ICS host in ten minutes. Same
  // 'skipped' prefix, same reason: it supplies no fetch evidence.
  | 'skipped_ics_failure_backoff';

export interface SourceRun extends RunContext, RunOutcome {
  runId: string;
  startedAt: string;
  finishedAt: string;
  zeroYield: boolean;
  expiresAt: Timestamp;
}

export const RETENTION_DAYS = 90;

// The one question a coverage report has to answer per source: did this
// run put anything in front of a user? Zero future-dated fixtures means
// no, whatever the HTTP status said — which is the whole point, because
// every dead season in this system answers 200.
export function isZeroYield(counts: RunCounts): boolean {
  return counts.futureDated === 0;
}

// Counts for one ingest. `parsed` is what the adapter produced; the
// identity parsed === stored + unchanged + rejected must hold, and is
// pinned by test.
export function countsFrom(
  args: {
    fetched: number;
    parsed: number;
    rejected: number;
    stored: number;
    unchanged: number;
  },
  fixtures: readonly Fixture[],
  nowIso: string,
): RunCounts {
  return {
    ...args,
    futureDated: fixtures.filter((f) => f.startUtc >= nowIso).length,
  };
}

export function buildSourceRun(
  runId: string,
  ctx: RunContext,
  outcome: RunOutcome,
  startedAt: string,
  nowMs: number,
): SourceRun {
  return {
    runId,
    startedAt,
    finishedAt: new Date(nowMs).toISOString(),
    ...ctx,
    ...outcome,
    zeroYield: isZeroYield(outcome.counts),
    expiresAt: Timestamp.fromMillis(nowMs + RETENTION_DAYS * 86_400_000),
  };
}

// Every adapter throws `<provider> http <status>` on a non-2xx, so one
// regex recovers the real status for the run record rather than flattening
// every failure to "502, see string".
export function httpStatusFromError(e: unknown): number | null {
  const m = /\bhttp (\d{3})\b/.exec(String(e));
  return m ? Number(m[1]) : null;
}

// Instrumentation must never become a new failure mode: a run record that
// cannot be written is logged and swallowed, never allowed to fail the
// poll it was measuring.
export async function recordSourceRun(
  ctx: RunContext,
  outcome: RunOutcome,
  startedAt: string,
): Promise<void> {
  try {
    const db = getFirestore();
    const ref = db.collection('sourceRuns').doc();
    await ref.set(buildSourceRun(ref.id, ctx, outcome, startedAt, Date.now()));
  } catch (e) {
    console.error(
      `[kickoffcal] sourceRuns write failed for ${ctx.pollPath}: ${e}`,
    );
  }
}
