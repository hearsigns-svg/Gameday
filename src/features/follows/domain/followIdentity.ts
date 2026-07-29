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
    .filter(
      (f) => followKeys.includes(f.key) && (f.brandColour || f.crestUrl),
    )
    .sort(
      (a, b) => (a.type === 'team' ? 0 : 1) - (b.type === 'team' ? 0 : 1),
    )[0];
}
