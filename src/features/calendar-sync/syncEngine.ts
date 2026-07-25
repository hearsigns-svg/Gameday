// Sync orchestrator: permission → dedicated calendar → fixture cache →
// pure plan → apply. The ledger is persisted after EVERY operation, so a
// sync killed mid-run converges on the next run. One run at a time.

import { err, ok, Result } from '../../core/result';
import { readJson, writeJson } from '../../core/storage';
import { fetchFixturesForFollows } from '../fixtures/data/fixturesRepo';
import { loadFollows } from '../follows/data/followStore';
import {
  createFixtureEvent,
  deleteFixtureEvent,
  ensureCalendarPermission,
  ensureGamedayCalendar,
  updateFixtureEvent,
} from './data/calendarDriver';
import {
  loadLedger,
  removeLedgerEntry,
  upsertLedgerEntry,
} from './data/ledger';
import { eventEndUtc, eventTitle, planSync } from './domain/syncPlan';

const LAST_SYNC_KEY = 'lastSync.v1';
const REMINDER_MINUTES = 60; // slice default; a preference in M3

export interface SyncOutcome {
  created: number;
  updated: number;
  deleted: number;
  at: string;
}

export function lastSync(): SyncOutcome | null {
  return readJson<SyncOutcome | null>(LAST_SYNC_KEY, null);
}

let syncRunning = false;

export async function runSync(): Promise<Result<SyncOutcome>> {
  if (syncRunning) return err({ kind: 'sync-in-progress' });
  syncRunning = true;
  try {
    const perm = await ensureCalendarPermission();
    if (!perm.ok) return perm;
    const cal = await ensureGamedayCalendar();
    if (!cal.ok) return cal;

    const follows = loadFollows();
    const fixtures = await fetchFixturesForFollows(follows);
    if (!fixtures.ok) return fixtures;

    const ops = planSync(fixtures.value, loadLedger(), follows);
    const outcome: SyncOutcome = {
      created: 0,
      updated: 0,
      deleted: 0,
      at: new Date().toISOString(),
    };

    for (const op of ops) {
      if (op.op === 'create' || op.op === 'update') {
        const f = op.fixture;
        const input = {
          fixtureId: f.id,
          title: eventTitle(f),
          startUtc: f.startUtc,
          endUtc: eventEndUtc(f.startUtc),
          reminderMinutesBefore: REMINDER_MINUTES,
        };
        const r =
          op.op === 'create'
            ? await createFixtureEvent(cal.value, input)
            : await updateFixtureEvent(op.entry.eventId, input);
        if (!r.ok) return r;
        upsertLedgerEntry(f.id, {
          eventId: r.value,
          calendarId: cal.value,
          startUtc: input.startUtc,
          endUtc: input.endUtc,
          title: input.title,
        });
        if (op.op === 'create') outcome.created++;
        else outcome.updated++;
      } else {
        await deleteFixtureEvent(op.entry.eventId);
        removeLedgerEntry(op.fixtureId);
        outcome.deleted++;
      }
    }

    writeJson(LAST_SYNC_KEY, outcome);
    return ok(outcome);
  } finally {
    syncRunning = false;
  }
}

// Auto-sync is only appropriate once the user has engaged: it prompts for
// calendar permission, which must never happen on a cold first open.
export function shouldAutoSync(): boolean {
  return loadFollows().length > 0 || Object.keys(loadLedger()).length > 0;
}
