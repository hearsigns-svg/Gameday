// Tennis tournament keys — PURE (Round 7 item 8, owner ruling
// 2026-09-03).
//
// A tournament is one followable per DRAW now. The server stamps the
// bare joint key `tennis-t-<slug>` on both tours' parents (the join the
// card union and the same-event dedupe ride) and, beside it, the key of
// the parent's own draw: `tennis-t-<slug>-m` on the ATP parent,
// `tennis-t-<slug>-w` on the WTA parent — boxing's `<base>-m/-w`
// convention. Following the men's US Open queries the `-m` key and
// fetches the men's parent only; following both fetches both and the
// existing dedupe keeps one card. This module is the one place the key
// grammar lives, so the browse rows, the follow store, the tier pass
// and the card all read it the same way.
//
// The retired `-finals` slot key is NOT a tournament key here: it never
// named a followable tournament, only a scoped slot doc.

export const TENNIS_T_PREFIX = 'tennis-t-';

export type TennisSex = 'm' | 'w';
export type TennisTour = 'atp' | 'wta';

const SEXED = /^(tennis-t-.+)-(m|w)$/;

export function isTennisTournamentKey(key: string): boolean {
  return key.startsWith(TENNIS_T_PREFIX) && !key.endsWith('-finals');
}

// 'm' | 'w' for a sexed key; null for the bare joint key (and for any
// non-tennis key).
export function tennisSexOfKey(key: string): TennisSex | null {
  if (!isTennisTournamentKey(key)) return null;
  const m = SEXED.exec(key);
  return m ? (m[2] as TennisSex) : null;
}

// The bare joint key behind a sexed one; a bare key returns itself.
export function tennisBaseKey(key: string): string {
  const m = SEXED.exec(key);
  return m && isTennisTournamentKey(key) ? m[1] : key;
}

export function isBareTennisKey(key: string): boolean {
  return isTennisTournamentKey(key) && tennisSexOfKey(key) === null;
}

export function sexedTennisKey(baseKey: string, sex: TennisSex): string {
  return `${baseKey}-${sex}`;
}

export function sexOfTour(tour: TennisTour): TennisSex {
  return tour === 'atp' ? 'm' : 'w';
}

export function tourOfSex(sex: TennisSex): TennisTour {
  return sex === 'm' ? 'atp' : 'wta';
}

// The draw an APPEARANCE belongs to, from its ingest slice — the tours
// arrive under sexed slices, so this is data, never a guess. Null for
// anything that is not a tennis appearance.
export function tennisEntrySex(competitionId: string | undefined): TennisSex | null {
  if (competitionId === 'tennis-atp-appearances') return 'm';
  if (competitionId === 'tennis-wta-appearances') return 'w';
  return null;
}

// Which draws of a tournament does this follow set want? The bare key
// (a legacy follow, or a pin's slice) wants both; a sexed key wants its
// own draw. Empty when nothing about this tournament is followed.
export function followedTennisSexes(
  baseKey: string,
  followedKeys: ReadonlySet<string>,
): Set<TennisSex> {
  const out = new Set<TennisSex>();
  if (followedKeys.has(baseKey)) {
    out.add('m');
    out.add('w');
    return out;
  }
  if (followedKeys.has(sexedTennisKey(baseKey, 'm'))) out.add('m');
  if (followedKeys.has(sexedTennisKey(baseKey, 'w'))) out.add('w');
  return out;
}

// The mark a sexed follow wears in the strip and on its rows (owner
// ruling: Mars/Venus bottom-right of the logo). Null for the bare key.
export function tennisSexGlyph(key: string): string | null {
  const sex = tennisSexOfKey(key);
  return sex === 'm' ? '♂' : sex === 'w' ? '♀' : null;
}
