// The team-directory cache claimed a 24h TTL and never had one: cachedAt
// was written and never read, so a directory fetched once was served
// forever. Promoted and relegated clubs never appeared or disappeared, and
// the alias table built from these documents could never improve.

import { DIRECTORY_TTL_MS, isDirectoryFresh } from '../directory';

const NOW = Date.parse('2026-07-31T12:00:00.000Z');

describe('isDirectoryFresh', () => {
  test('the TTL is the documented 24 hours', () => {
    expect(DIRECTORY_TTL_MS).toBe(24 * 3_600_000);
  });

  test('a recent cache is fresh', () => {
    expect(isDirectoryFresh('2026-07-31T11:00:00.000Z', NOW)).toBe(true);
  });

  test('a cache older than the TTL is stale', () => {
    expect(isDirectoryFresh('2026-07-30T11:59:00.000Z', NOW)).toBe(false);
  });

  test('exactly at the TTL is stale — the boundary refreshes', () => {
    expect(isDirectoryFresh('2026-07-30T12:00:00.000Z', NOW)).toBe(false);
  });

  test('a cache with no timestamp is never fresh', () => {
    // Every document written before the TTL existed falls here, so the
    // first read after this ships refreshes rather than trusting it.
    expect(isDirectoryFresh(undefined, NOW)).toBe(false);
  });

  test('an unparseable timestamp is never fresh', () => {
    expect(isDirectoryFresh('not-a-date', NOW)).toBe(false);
  });
});
