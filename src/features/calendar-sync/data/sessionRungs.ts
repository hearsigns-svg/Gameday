// The motorsport session ladder's storage (per-follow calendar control,
// Stage 5): one rung per laddered SERIES, kept in the calendar
// preferences (CalendarPrefs.sessionRungs) because desiredEventFor reads
// them there. The rule itself is pure — domain/sessionLadder.ts.

import { readJson, writeJson } from '../../../core/storage';
import type { Followable } from '../../follows/data/followStore';
import {
  DEFAULT_SESSION_RUNG,
  migratedRung,
  SessionRung,
} from '../domain/sessionLadder';
import { loadPrefs, savePrefs } from './prefsStore';

// The series that carry session types, and the sport whose follows
// deliver them (a series follow, or a driver followed from its
// directory). F1 is the only one today: every other motorsport series
// publishes no session names (MotoGP, F2, NASCAR, WEC — probed
// 2026-09-23), so it gets no ladder and keeps the pre-ladder filter.
export const LADDERED_SERIES: ReadonlyArray<{ seriesKey: string; sportKey: string }> = [
  { seriesKey: 'f1-series-1', sportKey: 'f1' },
];

function deliversSeries(
  f: Pick<Followable, 'key' | 'sportKey'>,
  series: { seriesKey: string; sportKey: string },
): boolean {
  return f.key === series.seriesKey || f.sportKey === series.sportKey;
}

export function sessionRungOf(seriesKey: string): SessionRung {
  return loadPrefs().sessionRungs[seriesKey] ?? DEFAULT_SESSION_RUNG;
}

export function setSessionRung(seriesKey: string, rung: SessionRung): void {
  const prefs = loadPrefs();
  savePrefs({ ...prefs, sessionRungs: { ...prefs.sessionRungs, [seriesKey]: rung } });
}

// "New follows get the default": a follow that brings a laddered series
// into the app afresh — nothing followed delivered it — starts at the
// default rung, not at whatever an earlier, since-unfollowed follow of
// that series had chosen. A series still delivered keeps its rung: the
// setting is per series, so a second follow of it changes nothing.
export function resetRungForFreshSeries(
  item: Pick<Followable, 'key' | 'sportKey'>,
  existing: ReadonlyArray<Pick<Followable, 'key' | 'sportKey'>>,
): void {
  const prefs = loadPrefs();
  let rungs = prefs.sessionRungs;
  for (const series of LADDERED_SERIES) {
    if (!deliversSeries(item, series)) continue;
    if (existing.some((f) => f.key !== item.key && deliversSeries(f, series))) continue;
    if (!(series.seriesKey in rungs)) continue;
    const { [series.seriesKey]: _gone, ...rest } = rungs;
    rungs = rest;
  }
  if (rungs !== prefs.sessionRungs) savePrefs({ ...prefs, sessionRungs: rungs });
}

// EXISTING FOLLOWS KEEP WHAT THEY DELIVER (owner brief): once, at the
// first launch of the ladder build, every laddered series that a stored
// follow delivers gets the rung that reproduces its pre-ladder delivery
// — the most permissive explicit per-follow choice, else the global
// "Race weekends" preference. A series nobody follows gets nothing (a
// later follow of it takes the default). Runs before the first sync, so
// the first pass plans with the migrated rung.
const MIGRATED_KEY = 'sessionRungsMigrated.v1';

export function migrateSessionRungs(follows: readonly Followable[]): void {
  if (readJson<boolean>(MIGRATED_KEY, false)) return;
  const prefs = loadPrefs();
  const rungs: Record<string, SessionRung> = { ...prefs.sessionRungs };
  for (const series of LADDERED_SERIES) {
    if (series.seriesKey in rungs) continue;
    const delivering = follows.filter((f) => deliversSeries(f, series));
    if (delivering.length === 0) continue;
    const explicit = delivering.flatMap((f): Array<'all' | 'race-only'> =>
      f.scope === 'all-sessions' ? ['all'] : f.scope === 'race-only' ? ['race-only'] : [],
    );
    rungs[series.seriesKey] = migratedRung(explicit, prefs.seriesSessions);
  }
  savePrefs({ ...prefs, sessionRungs: rungs });
  writeJson(MIGRATED_KEY, true);
}
