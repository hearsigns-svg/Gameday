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
import { ATP_ROSTER_ENABLED } from './providers/wikidataAtp';

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
export type AlertCondition =
  | 'no_success_24h'
  | 'yield_died'
  | 'born_dead'
  | 'roster_stale';

export interface Alert {
  sliceKey: string; // `${source}|${competitionId}`
  condition: AlertCondition;
  detail: string;
}

export const NO_SUCCESS_HOURS = 24;
export const YIELD_DIED_HOURS = 72;
// born_dead — the hole the World Cup fell through (2026-08-17). A
// demanded slice that runs, succeeds, and has NEVER yielded a future
// fixture is broken, whatever its reason field says. yield_died could
// not see it (it requires a slice to have yielded ONCE — a birth
// exemption), and the honest-empty exemption made it worse: the six
// born-dead slices all sat at 'no_future_events' — the off-season
// reason — because a path enabled for a season that already ENDED
// (fdorg-comp-WC was created 2026-08-02, two weeks after the final)
// looks exactly like off-season, forever. So this condition fires
// REGARDLESS of lastReason: no_future_events for a week straight from
// birth is the pathology, not an excuse. The F40 note ("never page on
// a season that simply ended") still governs yield_died — a slice
// that YIELDED and then wound down is honest; one that never yielded
// at all is not.
export const BORN_DEAD_HOURS = 7 * 24;
export const BORN_DEAD_MIN_RUNS = 5;
// Rosters refresh WEEKLY (scheduledRoster, Tuesdays); eight days of
// silence means a refresh was missed — the directory is going stale.
export const ROSTER_STALE_HOURS = 8 * 24;

// The roster slices are never sweep-demanded — the sweep does not poll
// them — and they must NOT be judged from coverage rows: rows exist
// only inside the most-recent-5000-run window, so a weekly roster's
// record ages out in weeks and the row VANISHES exactly when the
// roster is most stale (review round, probe-confirmed — the alert
// would have auto-resolved on the row's disappearance, and could never
// fire at all before the first-ever refresh). Instead, refreshRosters
// maintains a dedicated marker doc (status/rosters: sliceKey →
// lastSuccessAt) and the sweep evaluates THIS static expectation list
// against it — a missing marker is "never refreshed", which is the
// totality failure the rule exists to catch. yield_died cannot cover
// rosters either way: it keys on futureDated, a fixture concept; the
// roster equivalent ("succeeding but parsing nothing") is the
// all-or-nothing throw in each fetcher plus parsed counts in the run
// history.
export const EXPECTED_ROSTER_SLICES = [
  'wta|roster-wta',
  'f1|roster-f1',
  'ibf|roster-ibf',
  // ATP via Wikidata (Prompt 10b): expected only once the mint gate is
  // open — listed earlier, roster_stale would page about a source that
  // has never been allowed to run.
  ...(ATP_ROSTER_ENABLED ? ['wikidata|roster-atp'] : []),
  // The live ATP ranking (Prompt 12b). It needs this MORE than the
  // machine feeds do, not less: it is the one source whose gates
  // deliberately REFUSE an update rather than write it, and a refusal
  // leaves the marker un-advanced. So a table that has been vandalised,
  // reformatted or moved for long enough to fail its gates repeatedly
  // surfaces here as roster_stale — the failure the gates create is
  // itself watched, rather than being a quiet hold.
  // The men's directory, whole (2026-08-06). Replaces both
  // 'atp-rank|roster-atp-rank' (Wikipedia top 20) and the Wikidata
  // directory pass: one weekly refresh now owns the population, so its
  // silence is the only thing worth paging about.
  'tennisapi1|roster-atp-vendor',
];

export function evaluateRosterAlerts(
  marker: Readonly<Record<string, string>>,
  nowMs: number,
): Alert[] {
  const alerts: Alert[] = [];
  for (const sliceKey of EXPECTED_ROSTER_SLICES) {
    const last = marker[sliceKey];
    const hoursSince =
      last === undefined ? Infinity : (nowMs - Date.parse(last)) / 3_600_000;
    if (hoursSince > ROSTER_STALE_HOURS) {
      alerts.push({
        sliceKey,
        condition: 'roster_stale',
        detail:
          last === undefined
            ? 'roster has never refreshed successfully'
            : `last successful roster refresh ${last}`,
      });
    }
  }
  return alerts;
}

export function evaluateAlerts(
  rows: readonly CoverageRow[],
  demandedSlices: ReadonlySet<string>,
  nowMs: number,
): Alert[] {
  const alerts: Alert[] = [];
  for (const row of rows) {
    const sliceKey = `${row.source}|${row.competitionId}`;
    // roster-* rows may appear in coverage while their runs are in the
    // window; they are evaluated from the marker doc instead.
    if (row.competitionId.startsWith('roster-')) continue;
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
    const hoursTrying =
      row.firstRunAt === null
        ? 0
        : (nowMs - Date.parse(row.firstRunAt)) / 3_600_000;
    if (
      !yieldedOnce &&
      row.runsInWindow >= BORN_DEAD_MIN_RUNS &&
      hoursTrying > BORN_DEAD_HOURS
    ) {
      alerts.push({
        sliceKey,
        condition: 'born_dead',
        detail: `${row.runsInWindow} runs since ${row.firstRunAt}, never a future-dated fixture (last reason: ${row.lastReason ?? 'none'})`,
      });
    }
  }
  return alerts;
}
