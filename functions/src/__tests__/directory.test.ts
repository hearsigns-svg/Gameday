// The team-directory cache claimed a 24h TTL and never had one: cachedAt
// was written and never read, so a directory fetched once was served
// forever. Promoted and relegated clubs never appeared or disappeared, and
// the alias table built from these documents could never improve.

import {
  DIRECTORY_SCHEMA_EPOCH,
  DIRECTORY_TTL_MS,
  isDirectoryFresh,
} from '../directory';

// Anchored to the schema epoch rather than a fixed calendar date, so
// bumping the epoch (which is expected — it happens whenever a field is
// added to the directory shape) cannot silently invalidate these TTL
// tests the way it did on the Prompt 13 bump.
const NOW = DIRECTORY_SCHEMA_EPOCH + 12 * 3_600_000;
const at = (msFromEpoch: number) =>
  new Date(DIRECTORY_SCHEMA_EPOCH + msFromEpoch).toISOString();

describe('isDirectoryFresh', () => {
  test('the TTL is the documented 24 hours', () => {
    expect(DIRECTORY_TTL_MS).toBe(24 * 3_600_000);
  });

  test('a recent cache is fresh', () => {
    expect(isDirectoryFresh(at(11 * 3_600_000), NOW)).toBe(true);
  });

  test('a cache older than the TTL is stale', () => {
    expect(isDirectoryFresh(at(-12 * 3_600_000 - 60_000), NOW + DIRECTORY_TTL_MS)).toBe(false);
  });

  test('exactly at the TTL is stale — the boundary refreshes', () => {
    expect(isDirectoryFresh(at(1_000), DIRECTORY_SCHEMA_EPOCH + 1_000 + DIRECTORY_TTL_MS)).toBe(false);
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


// ─── The schema epoch (Prompt 13) ─────────────────────────────────────

describe('a cache entry written before the shape changed is stale', () => {
  const AFTER = DIRECTORY_SCHEMA_EPOCH + 60_000;

  test('an entry captured MINUTES before the epoch is refused, however fresh', () => {
    // The real failure: NBA, NFL, IPL, MLB and the Six Nations were
    // cached seventeen hours before this ran, well inside the 24h TTL,
    // holding full team lists with ZERO crests because they were
    // captured between the removal and the restoration.
    const justBefore = new Date(DIRECTORY_SCHEMA_EPOCH - 60_000).toISOString();
    expect(isDirectoryFresh(justBefore, AFTER)).toBe(false);
  });

  test('an entry captured after the epoch still obeys the ordinary TTL', () => {
    const justAfter = new Date(DIRECTORY_SCHEMA_EPOCH + 1_000).toISOString();
    expect(isDirectoryFresh(justAfter, AFTER)).toBe(true);
    expect(
      isDirectoryFresh(justAfter, DIRECTORY_SCHEMA_EPOCH + DIRECTORY_TTL_MS + 2_000),
    ).toBe(false);
  });

  test('a missing or unparsable timestamp is still stale, as before', () => {
    expect(isDirectoryFresh(undefined, AFTER)).toBe(false);
    expect(isDirectoryFresh('not a date', AFTER)).toBe(false);
  });
});
