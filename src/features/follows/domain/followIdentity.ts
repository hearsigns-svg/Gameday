// Which follow "owns" a fixture's identity: the followed entity whose
// crest/colour should theme the row or hero. Team follows outrank
// competition/series follows (a Liverpool fan's UCL tie is a Liverpool
// game first); follow order breaks remaining ties deterministically.

import { Followable } from '../data/followStore';

export function identityFollow(
  followKeys: readonly string[],
  follows: readonly Followable[],
): Followable | undefined {
  return follows
    // A CREST IS IDENTITY TOO. Filtering on colour alone excluded every
    // TSDB team follow — NBA, NFL, NHL, MLB, rugby, cricket — because
    // only football-data publishes kit colours (measured: 20/20 Premier
    // League teams carry `colours`, 0/30 NBA teams do). Those follows
    // held a crest the whole time and could never own a hero card or
    // theme a row.
    .filter((f) => followKeys.includes(f.key) && (f.brandColour || f.crestUrl))
    .sort(
      (a, b) => (a.type === 'team' ? 0 : 1) - (b.type === 'team' ? 0 : 1),
    )[0];
}
