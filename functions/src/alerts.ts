// Alerting that reaches the owner, instead of a report nobody opens.
//
// Two connectors returned zero near-term coverage for WEEKS with clean
// run records — the PBC candidate starvation and the athletics
// descending-calendar miss — and coverageReport would have shown both
// to anyone who called it. Nobody did. So the SWEEP now evaluates the
// same coverage rows after every run and pushes anomalies OUT:
//
//   - state lives in `opsAlerts` (one doc per slice+condition, opened/
//     resolved timestamps), so a condition alerts on TRANSITION and
//     resolves visibly rather than flapping;
//   - every sweep an alert stays open, the sweep logs a structured
//     `console.error` with a stable prefix — Cloud Error Reporting
//     groups these and NOTIFIES on the first occurrence of each group.
//     OWNER STEP, once: verify Error Reporting notifications are on for
//     the project (Console → Error Reporting → notification settings);
//     without it the errors are still one click away in the console,
//     which is already miles better than a report behind a curl.
//
// The rules, deliberately few and loud:
//   no_success_24h — a slice the sweep POLLS (demanded by a device or
//     the catalogue) with no successful run in 24 hours. Errors,
//     hangs, dead keys — whatever the cause, a day of failure is an
//     incident, not noise.
//   yield_died — a slice that succeeds and once yielded future
//     fixtures has yielded none for 72 hours, with no honest-empty
//     reason on its latest run. This is the PBC/athletics shape: clean
//     runs, dead coverage. Off-season slices carry
//     reason 'no_future_events' and never fire it.

import { CoverageRow } from './coverage';

// KNOWN BOUNDS, accepted and stated rather than papered over:
//   - yield_died self-extinguishes once the slice's last yielding run
//     scrolls past the 5,000-run coverage window (~5 weeks at current
//     volume): a very-long-dead slice reads as never-yielded and stops
//     firing. no_success_24h is unaffected, and a slice dead for five
//     weeks has been paging for five weeks first.
//   - APPEARANCE slices are never demanded (sliceOfPollPath maps a
//     route to its PARENT slice), so an appearance funnel dying alone
//     — parents healthy, bouts gone — does not page. The funnel's
//     zeroYield history stays visible in coverageReport.
export type AlertCondition = 'no_success_24h' | 'yield_died';

export interface Alert {
  sliceKey: string; // `${source}|${competitionId}`
  condition: AlertCondition;
  detail: string;
}

export const NO_SUCCESS_HOURS = 24;
export const YIELD_DIED_HOURS = 72;

export function evaluateAlerts(
  rows: readonly CoverageRow[],
  demandedSlices: ReadonlySet<string>,
  nowMs: number,
): Alert[] {
  const alerts: Alert[] = [];
  for (const row of rows) {
    const sliceKey = `${row.source}|${row.competitionId}`;
    if (!demandedSlices.has(sliceKey)) continue;
    const hoursSinceSuccess =
      row.lastSuccessAt === null
        ? Infinity
        : (nowMs - Date.parse(row.lastSuccessAt)) / 3_600_000;
    if (hoursSinceSuccess > NO_SUCCESS_HOURS) {
      alerts.push({
        sliceKey,
        condition: 'no_success_24h',
        detail:
          row.lastSuccessAt === null
            ? `never succeeded; last error: ${row.lastError ?? 'none recorded'}`
            : `last success ${row.lastSuccessAt}; last error: ${row.lastError ?? 'none recorded'}`,
      });
      continue; // a failing slice is one incident, not two
    }
    const yieldedOnce = row.lastNonZeroYieldAt !== null;
    const hoursSinceYield = yieldedOnce
      ? (nowMs - Date.parse(row.lastNonZeroYieldAt!)) / 3_600_000
      : 0;
    const honestlyEmpty = row.lastReason !== null;
    if (yieldedOnce && !honestlyEmpty && hoursSinceYield > YIELD_DIED_HOURS) {
      alerts.push({
        sliceKey,
        condition: 'yield_died',
        detail: `runs succeed but nothing future-dated since ${row.lastNonZeroYieldAt}`,
      });
    }
  }
  return alerts;
}
