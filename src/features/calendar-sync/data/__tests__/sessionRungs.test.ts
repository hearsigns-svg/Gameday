// The session ladder's migration and reset (Stage 5): existing follows
// keep what they deliver; a series brought in afresh starts at the
// default; the migration runs once.
jest.mock('../../../../core/storage', () => {
  const mem = new Map<string, unknown>();
  return {
    readJson: (k: string, fallback: unknown) => (mem.has(k) ? mem.get(k) : fallback),
    writeJson: (k: string, v: unknown) => void mem.set(k, v),
    removeKey: (k: string) => void mem.delete(k),
    __mem: mem,
  };
});
// prefsStore's own one-time latch reads the ledger; an empty one here.
jest.mock('../ledger', () => ({ loadLedger: () => ({}) }));

import type { Followable } from '../../../follows/data/followStore';
import { loadPrefs, savePrefs } from '../prefsStore';
import { migrateSessionRungs, resetRungForFreshSeries, sessionRungOf } from '../sessionRungs';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const storage = require('../../../../core/storage') as { __mem: Map<string, unknown> };

const F1_SERIES: Followable = {
  key: 'f1-series-1',
  label: 'Formula 1',
  sportKey: 'f1',
  type: 'series',
};
const VERSTAPPEN: Followable = {
  key: 'athlete_000224',
  label: 'Max Verstappen',
  sportKey: 'f1',
  type: 'athlete',
};
const LIVERPOOL: Followable = {
  key: 'fdorg-team-64',
  label: 'Liverpool',
  sportKey: 'soccer',
  type: 'team',
};

beforeEach(() => storage.__mem.clear());

const withGlobal = (seriesSessions: 'all' | 'race-only') =>
  savePrefs({ ...loadPrefs(), seriesSessions });

test('a race-only install migrates to Race only; an all-sessions install to All sessions', () => {
  withGlobal('race-only');
  migrateSessionRungs([F1_SERIES]);
  expect(sessionRungOf('f1-series-1')).toBe('race');

  storage.__mem.clear();
  withGlobal('all');
  migrateSessionRungs([F1_SERIES]);
  expect(sessionRungOf('f1-series-1')).toBe('all');
});

test('an explicit per-follow choice beats the global preference', () => {
  withGlobal('race-only');
  migrateSessionRungs([{ ...F1_SERIES, scope: 'all-sessions' }]);
  expect(sessionRungOf('f1-series-1')).toBe('all');
});

test('a driver follow alone delivers the series, so it migrates too', () => {
  withGlobal('race-only');
  migrateSessionRungs([VERSTAPPEN]);
  expect(loadPrefs().sessionRungs).toEqual({ 'f1-series-1': 'race' });
});

test('nothing delivering F1 → no rung (a later follow takes the default)', () => {
  withGlobal('race-only');
  migrateSessionRungs([LIVERPOOL]);
  expect(loadPrefs().sessionRungs).toEqual({});
  expect(sessionRungOf('f1-series-1')).toBe('qualifying');
});

test('it runs ONCE: a later launch never rewrites a rung the user chose', () => {
  withGlobal('race-only');
  migrateSessionRungs([F1_SERIES]);
  savePrefs({ ...loadPrefs(), sessionRungs: { 'f1-series-1': 'all' } });
  migrateSessionRungs([F1_SERIES]);
  expect(sessionRungOf('f1-series-1')).toBe('all');
});

test('a series brought in afresh starts at the default; one still delivered keeps its rung', () => {
  savePrefs({ ...loadPrefs(), sessionRungs: { 'f1-series-1': 'race' } });
  // Verstappen still delivers F1: following the series keeps Race only.
  resetRungForFreshSeries(F1_SERIES, [VERSTAPPEN, LIVERPOOL]);
  expect(sessionRungOf('f1-series-1')).toBe('race');
  // Nothing delivers F1 any more: a new F1 follow gets the default.
  resetRungForFreshSeries(F1_SERIES, [LIVERPOOL]);
  expect(sessionRungOf('f1-series-1')).toBe('qualifying');
});

test('a follow of another sport never touches the rung', () => {
  savePrefs({ ...loadPrefs(), sessionRungs: { 'f1-series-1': 'race' } });
  resetRungForFreshSeries(LIVERPOOL, []);
  expect(sessionRungOf('f1-series-1')).toBe('race');
});
