// Pure diff engine: canonical cache state vs freshly polled fixtures.
// No I/O; unit-tested from the repo root jest suite.

import { Fixture } from './fixture';

export type FixtureChange =
  | { kind: 'created'; fixtureId: string; startUtc: string }
  | {
      kind: 'time_changed';
      fixtureId: string;
      prevStartUtc: string;
      newStartUtc: string;
    }
  | {
      kind: 'status_changed';
      fixtureId: string;
      prevStatus: Fixture['status'];
      newStatus: Fixture['status'];
    };

export function diffFixtures(
  existing: ReadonlyMap<string, Fixture>,
  incoming: readonly Fixture[],
): FixtureChange[] {
  const changes: FixtureChange[] = [];
  for (const next of incoming) {
    const prev = existing.get(next.id);
    if (!prev) {
      changes.push({ kind: 'created', fixtureId: next.id, startUtc: next.startUtc });
      continue;
    }
    if (prev.startUtc !== next.startUtc) {
      changes.push({
        kind: 'time_changed',
        fixtureId: next.id,
        prevStartUtc: prev.startUtc,
        newStartUtc: next.startUtc,
      });
    }
    if (prev.status !== next.status) {
      changes.push({
        kind: 'status_changed',
        fixtureId: next.id,
        prevStatus: prev.status,
        newStatus: next.status,
      });
    }
  }
  return changes;
}
