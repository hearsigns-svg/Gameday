// PBC → Major fight cards (Round 6 item 4, owner ruling 2026-09-02).
// PBC's cards are one source among the boxing cards a follower wants;
// the PBC browse row and its follow keys are RETIRED and every PBC card
// also carries the Major fight cards key, so one follow (per sex) unions
// both sources. Identity dedupe is the client's sameBout rule, which
// already collapses the same bout arriving from two providers; fixture
// ids are unchanged, so no calendar event moves.

export const PBC_KEY = 'pbc-cards';
export const MAJOR_CARDS_KEY = 'tsdb-league-4445';

export function withMajorCardsKey<T extends { followKeys: string[] }>(fixtures: readonly T[]): T[] {
  return fixtures.map((f) =>
    f.followKeys.includes(MAJOR_CARDS_KEY)
      ? f
      : { ...f, followKeys: [...f.followKeys, MAJOR_CARDS_KEY] },
  );
}

// The sex-scope stamp runs per BASE key; a PBC ingest stamps both bases.
export function boxingStampBases(followKey: string): string[] {
  return followKey === PBC_KEY ? [PBC_KEY, MAJOR_CARDS_KEY] : [followKey];
}

