// Finished events whose fixture record is gone (owner ruling 2026-09-24).
import { pastEntriesWithRecordGone, pastRecordIds } from '../recordGone';
import { Ledger, LedgerEntry } from '../syncPlan';

const NOW = Date.parse('2026-09-24T12:00:00.000Z');

function entry(endUtc: string): LedgerEntry {
  return {
    eventId: `ev-${endUtc}`,
    calendarId: 'cal',
    startUtc: new Date(Date.parse(endUtc) - 2 * 3_600_000).toISOString(),
    endUtc,
    title: 't',
    allDay: false,
  };
}

const PAST = '2026-09-20T17:00:00.000Z';
const FUTURE = '2026-10-20T17:00:00.000Z';

const ledger: Ledger = {
  'fd-1': entry(PAST),
  'fd-2': entry(PAST),
  'fd-3': entry(FUTURE),
  // A tournament's closing bookend: its record is its parent's.
  'wta-9::close': entry(PAST),
  'wta-9': entry(PAST),
};

test('asks about every finished event, a bookend by its parent, and never an upcoming one', () => {
  expect(pastRecordIds(ledger, NOW).sort()).toEqual(['fd-1', 'fd-2', 'wta-9']);
});

test('a finished event goes only when the store answered that its record is gone', () => {
  expect(pastEntriesWithRecordGone(ledger, new Set(['fd-2']), NOW)).toEqual(['fd-2']);
  expect(pastEntriesWithRecordGone(ledger, new Set(), NOW)).toEqual([]);
});

test('a parent gone takes its bookends with it', () => {
  expect(pastEntriesWithRecordGone(ledger, new Set(['wta-9']), NOW).sort()).toEqual([
    'wta-9',
    'wta-9::close',
  ]);
});

test('an upcoming event is never removed here, even with its record gone — the planner owns that', () => {
  expect(pastEntriesWithRecordGone(ledger, new Set(['fd-3']), NOW)).toEqual([]);
});

test('an event still under way is not finished', () => {
  const live = { 'fd-live': entry('2026-09-24T12:30:00.000Z') };
  expect(pastRecordIds(live, NOW)).toEqual([]);
  expect(pastEntriesWithRecordGone(live, new Set(['fd-live']), NOW)).toEqual([]);
});
