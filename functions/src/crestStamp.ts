// Crest stamping at ingest (Stage 4B) — PURE.
//
// The hero composite needs each SIDE's crest, and the owning follow can
// only ever supply one. The fixture already knows its participants
// (homeTeam/awayTeam) and — after augmentFollowKeys — carries every
// provider key for both clubs, while the teamDirectory holds a crest
// per key. So the join is: name → directory candidates → the candidate
// whose KEY the fixture itself carries. That last condition is the
// exactness guarantee: a boxing surname or a colliding club name in
// some other league can never stamp a crest here, because its key is
// not on the fixture.

import { Fixture } from './fixture';
import { imageryAllowed } from './imagery';

export interface CrestCandidate {
  key: string; // provider follow key, e.g. 'tsdb-team-134875'
  url: string;
}

// normalised team name → every directory row bearing that name.
export type CrestIndex = Map<string, CrestCandidate[]>;

// The one crest this fixture can prove for a named side, or null.
// Candidates are filtered to keys the fixture itself carries; the side
// is stamped only when that leaves exactly ONE DISTINCT url — two
// same-name clubs both somehow on the fixture is ambiguity, and
// ambiguity stamps nothing (the standing F31 shape).
export function crestForSide(
  teamName: string | undefined,
  followKeys: readonly string[],
  index: CrestIndex,
  normalise: (raw: string) => string,
): string | null {
  if (!teamName) return null;
  const candidates = index.get(normalise(teamName)) ?? [];
  const urls = new Set(
    candidates.filter((c) => followKeys.includes(c.key)).map((c) => c.url),
  );
  return urls.size === 1 ? [...urls][0] : null;
}

export function stampCrests(
  fixtures: readonly Fixture[],
  index: CrestIndex,
  imageryOff: ReadonlySet<string>,
  normalise: (raw: string) => string,
): Fixture[] {
  if (index.size === 0) return [...fixtures];
  return fixtures.map((f) => {
    // The kill-switch and the Olympic hard exclusions gate the STAMP,
    // not just the serve: a crest baked onto a fixture doc bypasses
    // every serve-time strip, so it must never be written for a
    // suppressed competition.
    if (!imageryAllowed(f.competitionId, imageryOff)) {
      if (f.homeCrestUrl === undefined && f.awayCrestUrl === undefined) return f;
      // A takedown must also CLEAR what earlier polls stamped.
      const { homeCrestUrl, awayCrestUrl, ...rest } = f;
      return rest as Fixture;
    }
    const home = crestForSide(f.homeTeam, f.followKeys, index, normalise);
    const away = crestForSide(f.awayTeam, f.followKeys, index, normalise);
    if (
      (home ?? undefined) === f.homeCrestUrl &&
      (away ?? undefined) === f.awayCrestUrl
    ) {
      return f;
    }
    const { homeCrestUrl, awayCrestUrl, ...rest } = f;
    return {
      ...rest,
      ...(home ? { homeCrestUrl: home } : {}),
      ...(away ? { awayCrestUrl: away } : {}),
    } as Fixture;
  });
}
