// The 429 that read as a 502: three follow taps, three fetches of the
// same ICS, three refusals from the host. A cool-down written AFTER the
// fetch cannot stop that — every concurrent caller reads the same stale
// marker. The decision and the claim have to be one write.

import { leaseDecision } from '../sourceLease';

const CFG = {
  minIntervalMs: 22 * 3_600_000,
  failureBackoffMs: 15 * 60_000,
  leaseMs: 90_000,
};
const NOW = Date.parse('2026-08-05T17:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

it('fetches when nothing has ever been recorded', () => {
  expect(leaseDecision({}, NOW, CFG)).toMatchObject({ fetch: true });
});

it('honours the cadence commitment before anything else', () => {
  expect(leaseDecision({ lastSuccessAt: ago(3_600_000) }, NOW, CFG)).toEqual({
    fetch: false,
    reason: 'daily_cap',
  });
});

it('does not amplify a refusal', () => {
  expect(leaseDecision({ lastFailureAt: ago(60_000) }, NOW, CFG)).toEqual({
    fetch: false,
    reason: 'failure_backoff',
  });
});

it('SECOND CALLER LOSES: a live lease means someone else is fetching', () => {
  const held = { leaseUntil: new Date(NOW + 30_000).toISOString() };
  expect(leaseDecision(held, NOW, CFG)).toEqual({
    fetch: false,
    reason: 'leased',
  });
});

it('a dead invocation costs one window, not the day', () => {
  // The holder was killed mid-fetch and never cleared its lease. Once
  // it expires the source is available again — no manual repair.
  const expired = { leaseUntil: new Date(NOW - 1).toISOString() };
  expect(leaseDecision(expired, NOW, CFG)).toMatchObject({ fetch: true });
});

it('hands the winner a lease that outlives the fetch', () => {
  const d = leaseDecision({}, NOW, CFG);
  expect(d.fetch).toBe(true);
  if (!d.fetch) return;
  expect(Date.parse(d.leaseUntil) - NOW).toBe(CFG.leaseMs);
});

it('a corrupt timestamp never silences the source', () => {
  // Treating an unparseable marker as "now" would lock the feed out
  // permanently; the cheaper error is one extra fetch.
  expect(
    leaseDecision({ lastSuccessAt: 'not a date', leaseUntil: '' }, NOW, CFG),
  ).toMatchObject({ fetch: true });
});

it('a failure inside the cap window still reports the cap', () => {
  // Both are true; the cadence is the commitment to the publisher and
  // is the honest reason to report.
  expect(
    leaseDecision(
      { lastSuccessAt: ago(3_600_000), lastFailureAt: ago(60_000) },
      NOW,
      CFG,
    ),
  ).toEqual({ fetch: false, reason: 'daily_cap' });
});
