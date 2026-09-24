// Moving events between calendars of ours — the executor (owner brief
// 2026-09-24, a separate calendar for each sport).
//
// The effects are injected (the engine hands in the driver verbs and the
// ledger store), so this is exercised in tests against a model calendar
// store that is killed at every side effect — the move must resume on the
// next open with no event duplicated or missing.
//
// Order per event, the target switch's order exactly
// (domain/calendarMigration.ts): the destination calendar first (created
// and RECORDED before any event goes in it, so the prune can always see
// it); then the new event; then ONE ledger write that repoints the entry
// and records the old event as owed a delete, naming its calendar; then
// the delete; then the debt cleared.

import { Result } from '../../../core/result';
import { clearedStray, movedEntry, strayEventIds } from '../domain/calendarMigration';
import { Placement, RelocationStep } from '../domain/sportCalendars';
import { Ledger, LedgerEntry } from '../domain/syncPlan';
import type { AllDayReminder } from '../domain/prefs';

// What the rebuilt event actually carries — recorded so the next plan
// compares against the truth, not the stale entry.
export interface WrittenEvent {
  eventId: string;
  reminderMinutes?: number | null;
  allDayReminder?: AllDayReminder;
  extraReminders?: number[];
  note?: string;
}

export interface RelocationDeps {
  ledger(): Ledger;
  upsert(fixtureId: string, entry: LedgerEntry): void;
  // The destination's id — creating (and recording) a sport's calendar
  // the first time that sport has an event.
  calendarFor(to: Placement): Promise<Result<string>>;
  create(calendarId: string, step: RelocationStep): Promise<Result<WrittenEvent>>;
  // A delete that finds the event already gone answers ok (the desired
  // state); every other failure keeps the debt for the next pass.
  deleteEvent(eventId: string, calendarId: string | undefined): Promise<Result<true>>;
  // The pass's time budget, shared with the rest of the pass.
  stop(moved: number): boolean;
  beat(): void;
}

// Leftovers from an interrupted move: events already replaced in their
// new calendar, still owed a delete in their old one. Drained at the top
// of every pass.
export async function drainStrayEvents(
  deps: Pick<RelocationDeps, 'ledger' | 'upsert' | 'deleteEvent' | 'beat'>,
): Promise<number> {
  let drained = 0;
  for (const { fixtureId, eventId, calendarId } of strayEventIds(deps.ledger())) {
    const del = await deps.deleteEvent(eventId, calendarId);
    if (!del.ok) continue; // next pass; never lose the record
    const entry = deps.ledger()[fixtureId];
    if (entry) deps.upsert(fixtureId, clearedStray(entry));
    drained++;
    deps.beat();
  }
  return drained;
}

export async function relocate(
  steps: readonly RelocationStep[],
  deps: RelocationDeps,
): Promise<Result<{ moved: number; remaining: number }>> {
  let moved = 0;
  for (const step of steps) {
    if (deps.stop(moved)) break;
    const dest = await deps.calendarFor(step.to);
    if (!dest.ok) return dest;
    const created = await deps.create(dest.value, step);
    if (!created.ok) return created;
    const group = step.to.group ?? step.entry.sport;
    // ONE write: repoint AND owe the old event a delete (naming its
    // calendar). Splitting these would strand an event nothing drains.
    deps.upsert(step.fixtureId, {
      ...movedEntry(
        step.entry,
        created.value.eventId,
        dest.value,
        created.value.reminderMinutes,
        created.value.allDayReminder,
        created.value.extraReminders,
      ),
      ...(group ? { sport: group } : {}),
      ...(created.value.note !== undefined ? { note: created.value.note } : {}),
    });
    const del = await deps.deleteEvent(step.entry.eventId, step.entry.calendarId);
    if (del.ok) {
      const entry = deps.ledger()[step.fixtureId];
      if (entry) deps.upsert(step.fixtureId, clearedStray(entry));
    }
    moved++;
    deps.beat();
  }
  return { ok: true, value: { moved, remaining: steps.length - moved } };
}
