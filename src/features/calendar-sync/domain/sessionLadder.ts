// The motorsport session ladder — PURE (owner brief "Per-follow calendar
// control and motorsport sessions", Stage 5).
//
// A per-SERIES setting, in the form of the tournament tier ladder:
//   Race only · Qualifying & race · All sessions
// The sprint counts as a race and sprint qualifying (the shootout) as
// qualifying; practice appears only under All sessions. So Race only on
// a sprint weekend is the sprint plus the Grand Prix, and Qualifying &
// race adds both qualifying sessions. The ladder filters WITHIN a follow
// that is in — the inclusion rule decides first
// (follows/domain/calendarInclusion.ts), then the rung.
//
// Keyed by the series (the fixture's competitionId), not by a follow: a
// driver follow rides the same sessions as the series follow, and one
// setting governs them all. A series whose fixtures carry no session
// type gets no ladder and behaves as before (the sessionKind filter).

import type { SessionType } from '../../fixtures/domain/fixture';

// What the ladder reads of a fixture — the stored doc, a snapshot row
// or the card's display shape alike.
export interface LadderInput {
  id: string;
  competitionId?: string;
  sessionType?: SessionType;
}

export type SessionRung = 'race' | 'qualifying' | 'all';

export const SESSION_RUNGS: readonly SessionRung[] = ['race', 'qualifying', 'all'];

// New follows get the middle rung (owner brief).
export const DEFAULT_SESSION_RUNG: SessionRung = 'qualifying';

export type SessionRungMap = Readonly<Record<string, SessionRung>>;

// Which sessions a rung puts in.
export function rungAdmits(rung: SessionRung, session: SessionType): boolean {
  switch (session) {
    case 'race':
    case 'sprint':
      return true;
    case 'qualifying':
    case 'sprint-qualifying':
      return rung !== 'race';
    case 'practice':
      return rung === 'all';
  }
}

// F1's session identity is also the tail of its fixture id
// (`f1-<season>-<circuit>-<slug>`, functions/src/providers/f1.ts) — the
// same slugs the server now stamps as `sessionType`. Read as a FALLBACK
// for documents written before the stamp was deployed, so the ladder
// never depends on a re-poll having happened; the stamped field wins
// whenever it is present.
const F1_SLUG_TYPES: Readonly<Record<string, SessionType>> = {
  fp1: 'practice',
  fp2: 'practice',
  fp3: 'practice',
  sprintquali: 'sprint-qualifying',
  sprint: 'sprint',
  quali: 'qualifying',
  race: 'race',
};
const F1_SESSION_ID = /^f1-\d{4}-.+-([a-z0-9]+)$/;

export function sessionTypeOf(
  f: LadderInput,
): SessionType | undefined {
  if (f.sessionType) return f.sessionType;
  if (f.competitionId !== 'f1-series-1') return undefined;
  const m = F1_SESSION_ID.exec(f.id);
  return m ? F1_SLUG_TYPES[m[1]] : undefined;
}

// The series a laddered fixture belongs to (its competitionId).
export function sessionSeriesOf(
  f: LadderInput,
): string | null {
  return sessionTypeOf(f) !== undefined && f.competitionId ? f.competitionId : null;
}

export function rungFor(seriesKey: string, rungs: SessionRungMap | undefined): SessionRung {
  return rungs?.[seriesKey] ?? DEFAULT_SESSION_RUNG;
}

// Does the ladder keep this fixture? Undefined when the fixture is not
// laddered at all (the caller applies the pre-ladder rule).
export function ladderKeeps(
  f: LadderInput,
  rungs: SessionRungMap | undefined,
): boolean | undefined {
  const session = sessionTypeOf(f);
  const series = sessionSeriesOf(f);
  if (session === undefined || series === null) return undefined;
  return rungAdmits(rungFor(series, rungs), session);
}

// THE MIGRATION RULE (existing follows keep what they deliver): the rung
// that reproduces a series' pre-ladder delivery. An explicit per-follow
// choice beat the global preference and the most permissive explicit
// choice won (syncPlan seriesSessionsFor); 'all' maps to All sessions,
// 'race-only' to Race only. Race only now includes the sprint — the one
// place the two models differ (reported with the brief).
export function migratedRung(
  explicitScopes: ReadonlyArray<'all' | 'race-only'>,
  globalSeriesSessions: 'all' | 'race-only',
): SessionRung {
  if (explicitScopes.includes('all')) return 'all';
  if (explicitScopes.includes('race-only')) return 'race';
  return globalSeriesSessions === 'race-only' ? 'race' : 'all';
}
