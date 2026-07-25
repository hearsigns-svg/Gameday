// Pure sync planner — the idempotency core. Given the fixture cache, the
// device ledger, and the followed set, produce the exact calendar
// operations needed. No I/O; fully unit-tested.

import {
  Fixture,
  FIXTURE_DURATION_HOURS,
  UNSCHEDULED_STATUSES,
} from '../../fixtures/domain/fixture';

export interface LedgerEntry {
  eventId: string;
  calendarId: string;
  startUtc: string;
  endUtc: string;
  title: string;
}

export type Ledger = Record<string, LedgerEntry>; // keyed by fixture id

export type SyncOp =
  | { op: 'create'; fixture: Fixture }
  | { op: 'update'; fixture: Fixture; entry: LedgerEntry }
  | { op: 'delete'; fixtureId: string; entry: LedgerEntry };

export function eventTitle(f: Fixture): string {
  return `${f.homeTeam} v ${f.awayTeam}`;
}

export function eventEndUtc(startUtc: string): string {
  const end = new Date(startUtc);
  end.setHours(end.getHours() + FIXTURE_DURATION_HOURS);
  return end.toISOString();
}

function wantsEvent(f: Fixture, followedKeys: readonly string[]): boolean {
  return (
    !UNSCHEDULED_STATUSES.includes(f.status) &&
    f.status !== 'tbd' && // M2: tbd becomes a placeholder instead of absent
    f.teamIds.some((t) => followedKeys.includes(t))
  );
}

export function planSync(
  fixtures: readonly Fixture[],
  ledger: Ledger,
  followedKeys: readonly string[],
): SyncOp[] {
  const ops: SyncOp[] = [];
  const wanted = new Map<string, Fixture>();
  for (const f of fixtures) {
    if (wantsEvent(f, followedKeys)) wanted.set(f.id, f);
  }

  for (const f of wanted.values()) {
    const entry = ledger[f.id];
    if (!entry) {
      ops.push({ op: 'create', fixture: f });
    } else if (
      entry.startUtc !== f.startUtc ||
      entry.title !== eventTitle(f)
    ) {
      ops.push({ op: 'update', fixture: f, entry });
    }
    // else: ledger already reflects this fixture — no op (idempotency)
  }

  // Anything ledgered that we no longer want: cancelled, postponed,
  // unfollowed, or gone from the cache.
  for (const [fixtureId, entry] of Object.entries(ledger)) {
    if (!wanted.has(fixtureId)) ops.push({ op: 'delete', fixtureId, entry });
  }

  return ops;
}
