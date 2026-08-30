// Sport-generic photo pools (owner ruling 2026-08-30) — PURE.
//
// A new imagery rung between venue resolution and the generated
// treatment: when venue/composite resolution GENUINELY fails (every
// upstream rung resolved to none — never while one is still pending),
// a sport with a curated pool serves one of its shots. Pools are
// curated through the same Commons verified-at-fetch discipline as
// venue photography (licence allowlist, named artist, credits
// recorded) and ride the served art payload, never the client bundle.
//
// DETERMINISTIC: the fixture id hashes to a pool index, so the same
// card wears the same shot across launches and different cards vary.
// FNV-1a — stable, dependency-free, spread verified by test.

export interface PoolPhoto {
  url: string;
  artist: string;
  licence: string;
  sourceUrl?: string;
}

export function poolIndexFor(fixtureId: string, poolSize: number): number {
  if (poolSize <= 0) return 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < fixtureId.length; i++) {
    h ^= fixtureId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % poolSize;
}
