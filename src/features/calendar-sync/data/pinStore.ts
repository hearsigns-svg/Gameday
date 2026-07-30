// Persistence for per-event pins (opt-in single fixtures).

import { readJson, writeJson } from '../../../core/storage';
import { PinMap, PinnedFixture, prunePins } from '../domain/pins';

const KEY = 'pinnedFixtures.v1';

function loadMap(): PinMap {
  return readJson<PinMap>(KEY, {});
}

export function loadPins(): PinnedFixture[] {
  return Object.values(loadMap());
}

export function pinnedIds(): Set<string> {
  return new Set(Object.keys(loadMap()));
}

export function isPinned(fixtureId: string): boolean {
  return fixtureId in loadMap();
}

export function setPinned(pin: PinnedFixture, pinned: boolean): void {
  const all = loadMap();
  if (pinned) all[pin.id] = { ...pin, at: new Date().toISOString() };
  else delete all[pin.id];
  writeJson(KEY, all);
}

export function prunePinStore(now: number = Date.now()): void {
  const all = loadMap();
  const kept = prunePins(all, now);
  if (Object.keys(kept).length !== Object.keys(all).length) writeJson(KEY, kept);
}

// Poll routes for pinned fixtures whose competition nobody follows —
// the sweep still has to keep them correct.
export function pinPollPaths(): string[] {
  return [...new Set(loadPins().map((p) => p.pollPath).filter(Boolean))] as string[];
}

// Follow keys the fixture query must include to see pinned fixtures.
export function pinFollowKeys(): string[] {
  return [...new Set(loadPins().map((p) => p.followKey).filter(Boolean))];
}
