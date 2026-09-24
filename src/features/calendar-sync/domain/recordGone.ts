// Finished events whose fixture record is GONE (owner ruling 2026-09-24)
// — the one deliberate exception to the future-only rule (AGENTS rule 5,
// DECISIONS 2026-09-24).
//
// A finished game is frozen: never updated, never deleted, whatever the
// fetch does. That protects history from sync churn. But an event whose
// fixture record no longer exists (re-keyed by a provider, removed by an
// owner migration) is no longer history the app can vouch for, and in the
// per-sport layout it has no sport to live under — it held KickOffCal
// itself open. So every pass, in either layout, asks the store about
// every finished event, and removes the ones whose record it CONFIRMS is
// gone. Upcoming events need no such check: the planner already removes
// an upcoming event its fixture no longer backs.
//
// Only a read that SUCCEEDED can say "gone" (rule 4) — the caller removes
// nothing when the store could not be asked.

import { isEndPast } from '../../fixtures/domain/horizon';
import { lookupIdOf } from './sportCalendars';
import type { Ledger } from './syncPlan';

// The records to ask about: every finished event's own, and a tournament
// bookend's parent's (a synthesised `<parent>::close` has no record of
// its own).
export function pastRecordIds(ledger: Ledger, nowMs: number): string[] {
  const ids = new Set<string>();
  for (const [fixtureId, entry] of Object.entries(ledger)) {
    if (isEndPast(entry.endUtc, nowMs)) ids.add(lookupIdOf(fixtureId));
  }
  return [...ids];
}

// The finished events whose record the store answered does not exist.
export function pastEntriesWithRecordGone(
  ledger: Ledger,
  missing: ReadonlySet<string>,
  nowMs: number,
): string[] {
  return Object.entries(ledger)
    .filter(([fixtureId, entry]) => isEndPast(entry.endUtc, nowMs) && missing.has(lookupIdOf(fixtureId)))
    .map(([fixtureId]) => fixtureId);
}
