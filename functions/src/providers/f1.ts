// Formula 1 adapter via Jolpica (Ergast successor) — open, free, no key.
// One race weekend fans out into per-session fixtures (taxonomy: series
// follow, per-session events, race-only preference filters 'support').

import { Fixture } from '../fixture';
import { ProviderFetch, requireArray } from './fetchResult';

const BASE = 'https://api.jolpi.ca/ergast/f1';

interface SessionTime {
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm:ssZ
}

export interface F1Race extends SessionTime {
  round: string;
  raceName: string;
  Circuit?: { circuitId?: string };
  FirstPractice?: SessionTime;
  SecondPractice?: SessionTime;
  ThirdPractice?: SessionTime;
  Qualifying?: SessionTime;
  Sprint?: SessionTime;
  SprintQualifying?: SessionTime;
}

const SESSION_DEFS: Array<{
  field: keyof F1Race;
  slug: string;
  label: string;
}> = [
  { field: 'FirstPractice', slug: 'fp1', label: 'Practice 1' },
  { field: 'SecondPractice', slug: 'fp2', label: 'Practice 2' },
  { field: 'ThirdPractice', slug: 'fp3', label: 'Practice 3' },
  { field: 'SprintQualifying', slug: 'sprintquali', label: 'Sprint Qualifying' },
  { field: 'Sprint', slug: 'sprint', label: 'Sprint' },
  { field: 'Qualifying', slug: 'quali', label: 'Qualifying' },
];

function sessionFixture(
  season: string,
  race: F1Race,
  circuitKey: string,
  slug: string,
  label: string,
  at: SessionTime,
  kind: 'race' | 'support',
  durationHours: number,
  updatedAt: string,
): Fixture {
  const hasTime = Boolean(at.time);
  const startUtc = new Date(
    `${at.date}T${at.time ?? '00:00:00Z'}`,
  ).toISOString();
  return {
    id: `f1-${season}-${circuitKey}-${slug}`,
    sport: 'f1',
    competition: 'Formula 1',
    competitionId: 'f1-series-1',
    title: `${race.raceName} — ${label}`,
    followKeys: ['f1-series-1'],
    startUtc,
    // Jolpica publishes session times in UTC with no venue zone.
    // No published time yet → the day is all we have.
    status: hasTime ? 'scheduled' : 'tbd',
    durationHours,
    sessionKind: kind,
    timePrecision: hasTime ? 'exact' : 'date_only',
    confidence: hasTime ? 'confirmed' : 'provisional',
    updatedAt,
  };
}

export function racesToFixtures(
  season: string,
  races: readonly F1Race[],
  updatedAt: string,
): Fixture[] {
  const fixtures: Fixture[] = [];
  // The CIRCUIT, not the round number, is the stable identity (F3):
  // when Jolpica inserted a new round 16 into 2026, every later round
  // renumbered and the old ids became orphans still carrying the old
  // race names. circuitId ("albert_park") survives renumbering; a race
  // missing it is shape rot and must fail loudly, not silently mint
  // round-based ids again. DOUBLE-HEADERS (2020: red_bull_ring twice,
  // silverstone twice, bahrain twice) get an occurrence suffix on the
  // second visit — occurrence ORDER among same-circuit visits is stable
  // under the renumbering that breaks round ids.
  const circuitVisits = new Map<string, number>();
  for (const race of races) {
    const circuitId = race.Circuit?.circuitId;
    if (!circuitId) {
      throw new Error(`f1: race round ${race.round} has no Circuit.circuitId`);
    }
    const visit = (circuitVisits.get(circuitId) ?? 0) + 1;
    circuitVisits.set(circuitId, visit);
    const circuitKey = visit === 1 ? circuitId : `${circuitId}-${visit}`;
    for (const def of SESSION_DEFS) {
      const at = race[def.field] as SessionTime | undefined;
      if (at?.date) {
        fixtures.push(
          sessionFixture(season, race, circuitKey, def.slug, def.label, at, 'support', 1, updatedAt),
        );
      }
    }
    fixtures.push(
      sessionFixture(season, race, circuitKey, 'race', 'Race', race, 'race', 2, updatedAt),
    );
  }
  return fixtures;
}

export async function fetchF1SeasonFixtures(
  season: number,
): Promise<ProviderFetch> {
  const res = await fetch(`${BASE}/${season}.json`);
  if (!res.ok) throw new Error(`jolpica http ${res.status}`);
  const body = (await res.json()) as {
    MRData?: { RaceTable?: { Races?: F1Race[] } };
  };
  const now = new Date().toISOString();
  // rawCount is race WEEKENDS; one weekend fans out into up to 7 session
  // fixtures, so this is the one adapter where fetched ≠ parsed by design.
  const races = requireArray(
    body.MRData?.RaceTable?.Races,
    'jolpica',
    'MRData.RaceTable.Races',
  );
  return {
    rawCount: races.length,
    fixtures: racesToFixtures(String(season), races, now),
  };
}
