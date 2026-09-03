import { rosterWithinCadence } from '../rosterCadence';

const DAY = 86_400_000;
const now = Date.parse('2026-09-03T03:00:00.000Z');

test('a cadenced source is skipped while its last success is younger than the cadence', () => {
  expect(rosterWithinCadence(new Date(now - 10 * DAY).toISOString(), 90, now)).toBe(true);
  expect(rosterWithinCadence(new Date(now - 89 * DAY).toISOString(), 90, now)).toBe(true);
  expect(rosterWithinCadence(new Date(now - 90 * DAY).toISOString(), 90, now)).toBe(false);
  expect(rosterWithinCadence(new Date(now - 200 * DAY).toISOString(), 90, now)).toBe(false);
});

test('no cadence, no marker, or a garbage marker → run (the throttle only ever holds back a SUCCESS)', () => {
  expect(rosterWithinCadence(new Date(now - DAY).toISOString(), undefined, now)).toBe(false);
  expect(rosterWithinCadence(undefined, 90, now)).toBe(false);
  expect(rosterWithinCadence('', 90, now)).toBe(false);
  expect(rosterWithinCadence('not a date', 90, now)).toBe(false);
});
