// Paged windows for the in-app schedule (Round 5 ruling 4). The
// presentation snapshot holds EVERY upcoming fixture — a 40-team follow
// set is ~550 — and Schedule shows it a calendar month at a time: page 0
// reaches from the horizon start to the end of NEXT month, each further
// page adds one month. Pure: the screen owns `pagesLoaded`, this module
// owns what that number means, so the maths is testable without a list
// on screen.
//
// MONTH ALIGNMENT IS COMPUTED IN UTC, DELIBERATELY. A window is a
// half-open instant range [fromUtc, toUtc) judged against startUtc — the
// value the snapshot is sorted by — so the same `pagesLoaded` names the
// same fixtures on every device, and the suite's two passes (UTC and
// America/Los_Angeles) pin identical output. The one seam this leaves: a
// device-LOCAL day at a month's edge can straddle a UTC month boundary,
// so a caller that must cover a local day asks for the instant that day
// ENDS (localDayEndUtc → pagesToReach), never the month in its label.

import { horizonStartFrom } from './syncPlan';

export interface DateWindow {
  fromUtc: string; // inclusive
  toUtc: string; // exclusive
}

// Date.UTC normalises an out-of-range month (13 → January next year),
// which is what carries a page across the year boundary.
function utcMonthStartIso(year: number, monthIndex: number): string {
  return new Date(Date.UTC(year, monthIndex, 1)).toISOString();
}

// One window per loaded page, contiguous and ascending. Page 0 runs from
// the horizon start through the end of the month AFTER the current one —
// an open near a month's end must never show a two-day list — and every
// later page is exactly one calendar month.
export function pageWindows(nowMs: number, pagesLoaded: number): DateWindow[] {
  const now = new Date(nowMs);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const pages = Math.max(1, Math.floor(pagesLoaded));
  const windows: DateWindow[] = [];
  for (let p = 0; p < pages; p++) {
    windows.push({
      fromUtc: p === 0 ? horizonStartFrom(nowMs) : utcMonthStartIso(y, m + p + 1),
      toUtc: utcMonthStartIso(y, m + p + 2),
    });
  }
  return windows;
}

// The union of every loaded page — the range the list actually shows.
export function loadedWindow(nowMs: number, pagesLoaded: number): DateWindow {
  const windows = pageWindows(nowMs, pagesLoaded);
  return {
    fromUtc: windows[0].fromUtc,
    toUtc: windows[windows.length - 1].toUtc,
  };
}

// Fixtures whose start lies inside [fromUtc, toUtc). Compared as
// instants, not strings, so a source that writes its ISO instants in a
// different shape still lands on the right side of a boundary.
export function fixturesInWindow<T extends { startUtc: string }>(
  all: readonly T[],
  fromUtc: string,
  toUtc: string,
): T[] {
  const from = Date.parse(fromUtc);
  const to = Date.parse(toUtc);
  return all.filter((f) => {
    const s = Date.parse(f.startUtc);
    return s >= from && s < to;
  });
}

// The soonest start at or after `toUtc`, or null when the window already
// holds everything. Does not assume `all` is sorted.
export function nextStartBeyond(
  all: readonly { startUtc: string }[],
  toUtc: string,
): string | null {
  const to = Date.parse(toUtc);
  let best: number | null = null;
  for (const f of all) {
    const s = Date.parse(f.startUtc);
    if (s >= to && (best === null || s < best)) best = s;
  }
  return best === null ? null : new Date(best).toISOString();
}

// Whether a further page would show anything. Drives the footer control
// and the end-reached auto-load: when this is false the list simply
// ends — nothing is rendered to say so (AGENTS.md rule 10).
export function nextPageAvailable(
  all: readonly { startUtc: string }[],
  toUtc: string,
): boolean {
  return nextStartBeyond(all, toUtc) !== null;
}

// The smallest `pagesLoaded` whose window contains `targetUtc`: one for
// anything up to the end of next month, then one more per UTC month.
// Anything already past reads as page one.
export function pagesToReach(nowMs: number, targetUtc: string): number {
  const now = new Date(nowMs);
  const target = new Date(targetUtc);
  const months =
    (target.getUTCFullYear() - now.getUTCFullYear()) * 12 +
    (target.getUTCMonth() - now.getUTCMonth());
  return Number.isFinite(months) ? Math.max(1, months) : 1;
}

// The fewest pages that reach the SOONEST fixture — one when the first
// two months hold one, or when nothing exists at all. The list's floor:
// an off-season follow whose next fixtures are months out opens ON
// them, never on two empty months and a Show more button.
export function pagesToFirst(
  all: readonly { startUtc: string }[],
  nowMs: number,
): number {
  let first: number | null = null;
  for (const f of all) {
    const s = Date.parse(f.startUtc);
    if (Number.isFinite(s) && (first === null || s < first)) first = s;
  }
  return first === null ? 1 : pagesToReach(nowMs, new Date(first).toISOString());
}

// `pagesLoaded` after one "show more": the page holding the next fixture
// beyond the current window — an empty month between is skipped, so
// every load reveals at least one row — or the current value when
// nothing more exists.
export function nextPagesLoaded(
  all: readonly { startUtc: string }[],
  nowMs: number,
  pagesLoaded: number,
): number {
  const { toUtc } = loadedWindow(nowMs, pagesLoaded);
  const next = nextStartBeyond(all, toUtc);
  if (next === null) return pagesLoaded;
  return Math.max(pagesLoaded + 1, pagesToReach(nowMs, next));
}

// The instant a device-local day key ("YYYY-MM-DD", core/when dayKey)
// ENDS — the local midnight that follows it, expressed in UTC. The one
// zone-dependent function here, and deliberately so: the grid's cells
// are local days, and covering a tapped day means covering every instant
// in it, whichever UTC month its last hours fall in.
export function localDayEndUtc(day: string): string {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7)) - 1;
  const d = Number(day.slice(8, 10));
  return new Date(y, m, d + 1).toISOString();
}
