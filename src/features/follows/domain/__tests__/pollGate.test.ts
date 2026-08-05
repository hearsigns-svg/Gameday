// A follow must not put a live third-party fetch on the critical path,
// and three taps must not be three fetches. Measured 2026-08-05: three
// follow-triggered ICS fetches inside ten minutes, each answered 429.

import { POLL_COOLDOWN_MS, shouldPoll } from '../pollGate';

const T = 1_800_000_000_000;

it('polls a route nobody has fetched', () => {
  expect(shouldPoll(undefined, T)).toBe(true);
});

it('refuses a second fetch of the same route inside the window', () => {
  expect(shouldPoll(T, T + 1_000)).toBe(false);
  expect(shouldPoll(T, T + POLL_COOLDOWN_MS - 1)).toBe(false);
});

it('lets the route through once the window passes', () => {
  expect(shouldPoll(T, T + POLL_COOLDOWN_MS)).toBe(true);
});

it('a backwards clock never locks a route out', () => {
  // A timezone change or an NTP correction can move the clock behind
  // the recorded attempt. Treating that as "recently polled" would
  // silence the route until real time caught up.
  expect(shouldPoll(T, T - 3_600_000)).toBe(true);
});
