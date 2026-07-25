// Device sync ledger: fixtureId → calendar event. Persisted after EVERY
// applied operation so a killed sync re-runs to convergence. The fixture
// id is also embedded in each event's notes (see calendarDriver) so the
// ledger can be rebuilt after reinstall (M4).

import { readJson, writeJson } from '../../../core/storage';
import { Ledger, LedgerEntry } from '../domain/syncPlan';

const KEY = 'ledger.v1';

export function loadLedger(): Ledger {
  return readJson<Ledger>(KEY, {});
}

export function upsertLedgerEntry(fixtureId: string, entry: LedgerEntry): void {
  const ledger = loadLedger();
  ledger[fixtureId] = entry;
  writeJson(KEY, ledger);
}

export function removeLedgerEntry(fixtureId: string): void {
  const ledger = loadLedger();
  delete ledger[fixtureId];
  writeJson(KEY, ledger);
}
