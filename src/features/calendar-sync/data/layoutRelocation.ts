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
  // The colour it was written with (2026-09-25): null = none of its own.
  // Absent = the entry's colour carried unchanged.
  colour?: string | null;
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
  // Told the running count after each event (or batch) moved — a target
  // switch's progress line.
  onMoved?(moved: number): void;
  // MANY AT ONCE (owner ruling 2026-09-25) — where the calendar layer
  // takes a batch (Google: fifty to a request). The steps then go in
  // groups, each event still in the one-event order: its destination
  // created and recorded, the event created, ONE ledger write
  // (repoint + owe the delete), the delete, the debt cleared. A kill
  // between the batch's create and its ledger writes leaves events
  // created and not recorded — the prune's to remove, exactly as one
  // such event always was. Absent, or size 1: one step at a time.
  batch?: {
    size: number;
    create(
      items: ReadonlyArray<{ calendarId: string; step: RelocationStep }>,
    ): Promise<Result<Array<Result<WrittenEvent>>>>;
    deleteEvents(
      items: ReadonlyArray<{ eventId: string; calendarId: string | undefined }>,
    ): Promise<Result<Array<Result<true>>>>;
  };
}

// The moved event's ledger entry: repointed at the new event, owing the
// old one a delete (naming its calendar), recording what was written.
function rebuiltEntry(step: RelocationStep, calendarId: string, written: WrittenEvent): LedgerEntry {
  const group = step.to.group ?? step.entry.sport;
  const next: LedgerEntry = {
    ...movedEntry(
      step.entry,
      written.eventId,
      calendarId,
      written.reminderMinutes,
      written.allDayReminder,
      written.extraReminders,
    ),
    ...(group ? { sport: group } : {}),
    ...(written.note !== undefined ? { note: written.note } : {}),
  };
  // What the new event actually wears, so the next plan compares
  // against it rather than the old event's colour.
  if (written.colour === null) delete next.colour;
  else if (written.colour !== undefined) next.colour = written.colour;
  return next;
}

// Leftovers from an interrupted move: events already replaced in their
// new calendar, still owed a delete in their old one. Drained at the top
// of every pass.
export async function drainStrayEvents(
  deps: Pick<RelocationDeps, 'ledger' | 'upsert' | 'deleteEvent' | 'beat'> & {
    batch?: Pick<NonNullable<RelocationDeps['batch']>, 'size' | 'deleteEvents'>;
  },
): Promise<number> {
  let drained = 0;
  const strays = strayEventIds(deps.ledger());
  if (deps.batch && deps.batch.size > 1) {
    for (let i = 0; i < strays.length; i += deps.batch.size) {
      const chunk = strays.slice(i, i + deps.batch.size);
      const dels = await deps.batch.deleteEvents(
        chunk.map((s) => ({ eventId: s.eventId, calendarId: s.calendarId })),
      );
      if (!dels.ok) break; // next pass; never lose the record
      chunk.forEach((s, k) => {
        if (!dels.value[k].ok) return;
        const entry = deps.ledger()[s.fixtureId];
        if (entry) deps.upsert(s.fixtureId, clearedStray(entry));
        drained++;
      });
      deps.beat();
    }
    return drained;
  }
  for (const { fixtureId, eventId, calendarId } of strays) {
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
  if (deps.batch && deps.batch.size > 1) return relocateInBatches(steps, deps, deps.batch);
  let moved = 0;
  for (const step of steps) {
    if (deps.stop(moved)) break;
    const dest = await deps.calendarFor(step.to);
    if (!dest.ok) return dest;
    const created = await deps.create(dest.value, step);
    if (!created.ok) return created;
    // ONE write: repoint AND owe the old event a delete (naming its
    // calendar). Splitting these would strand an event nothing drains.
    deps.upsert(step.fixtureId, rebuiltEntry(step, dest.value, created.value));
    const del = await deps.deleteEvent(step.entry.eventId, step.entry.calendarId);
    if (del.ok) {
      const entry = deps.ledger()[step.fixtureId];
      if (entry) deps.upsert(step.fixtureId, clearedStray(entry));
    }
    moved++;
    deps.beat();
    deps.onMoved?.(moved);
  }
  return { ok: true, value: { moved, remaining: steps.length - moved } };
}

async function relocateInBatches(
  steps: readonly RelocationStep[],
  deps: RelocationDeps,
  batch: NonNullable<RelocationDeps['batch']>,
): Promise<Result<{ moved: number; remaining: number }>> {
  let moved = 0;
  for (let i = 0; i < steps.length; i += batch.size) {
    if (deps.stop(moved)) break;
    const chunk = steps.slice(i, i + batch.size);
    // Every destination first, each created and RECORDED before any
    // event goes in it.
    const dests: string[] = [];
    for (const step of chunk) {
      const dest = await deps.calendarFor(step.to);
      if (!dest.ok) return dest;
      dests.push(dest.value);
    }
    const created = await batch.create(chunk.map((step, k) => ({ calendarId: dests[k], step })));
    if (!created.ok) return created;
    // One ledger write per event that was made; one Google turned down
    // stays where it is, for the next pass.
    const made: RelocationStep[] = [];
    let refused: Result<never> | null = null;
    chunk.forEach((step, k) => {
      const c = created.value[k];
      if (!c.ok) {
        refused ??= c;
        return;
      }
      deps.upsert(step.fixtureId, rebuiltEntry(step, dests[k], c.value));
      made.push(step);
    });
    const dels = await batch.deleteEvents(
      made.map((s) => ({ eventId: s.entry.eventId, calendarId: s.entry.calendarId })),
    );
    if (dels.ok) {
      made.forEach((s, k) => {
        if (!dels.value[k].ok) return;
        const entry = deps.ledger()[s.fixtureId];
        if (entry) deps.upsert(s.fixtureId, clearedStray(entry));
      });
    }
    moved += made.length;
    deps.beat();
    deps.onMoved?.(moved);
    // A refused create ends the pass as one did before batching: the
    // events made are recorded, and the rest wait for the next pass.
    if (refused) return refused;
  }
  return { ok: true, value: { moved, remaining: steps.length - moved } };
}
