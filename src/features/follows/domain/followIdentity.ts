// Which follow "owns" a fixture's identity: the followed entity whose
// crest/colour should theme the row or hero. Team follows outrank
// competition/series follows (a Liverpool fan's UCL tie is a Liverpool
// game first); follow order breaks remaining ties deterministically.

import { Followable } from '../data/followStore';

export function identityFollow(
  followKeys: readonly string[],
  follows: readonly Followable[],
  // A follow with a SERVED mark has identity too (Round 7 follow-up):
  // a tennis tournament follow never stores a crest of its own — its
  // mark lives in the served art map — so requiring a stored crest or
  // colour left the majors' heroes and rows without their logo. The
  // data layer supplies the predicate (browsePriority.hasServedMark);
  // callers without one keep the stored-only rule.
  hasMark: (key: string) => boolean = () => false,
): Followable | undefined {
  return follows
    // A CREST IS IDENTITY TOO. Filtering on colour alone excluded every
    // TSDB team follow — NBA, NFL, NHL, MLB, rugby, cricket — because
    // only football-data publishes kit colours (measured: 20/20 Premier
    // League teams carry `colours`, 0/30 NBA teams do). Those follows
    // held a crest the whole time and could never own a hero card or
    // theme a row.
    .filter(
      (f) =>
        followKeys.includes(f.key) && (f.brandColour || f.crestUrl || hasMark(f.key)),
    )
    .sort(
      (a, b) => (a.type === 'team' ? 0 : 1) - (b.type === 'team' ? 0 : 1),
    )[0];
}
