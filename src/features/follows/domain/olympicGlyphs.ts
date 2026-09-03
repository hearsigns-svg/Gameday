// Olympic SPORT icons — PURE (Round 7 item 5, owner ruling 2026-09-03).
//
// No Olympic emblem may be shown (statute — functions/src/imagery.ts),
// so an Olympic discipline's mark is its SPORT'S emoji, in the same
// emoji-tile style the sport tiles use: the bow for archery, the
// swimmer for swimming. The medal is reserved for the GAMES themselves
// (the edition follows, the strip's group node) — never for a sport,
// which is what a medal on every discipline row had reduced them to.
//
// One table, keyed by the discipline slug (`olympics-<year>-<slug>`),
// read by every surface that draws an Olympic follow or fixture: the
// strip, the Sports lists, the entity page, the Schedule rows and the
// hero watermark. A discipline missing here falls back to the medal —
// and the test pins that no configured discipline does.

export const OLYMPIC_MEDAL = '🏅';

export const OLYMPIC_SPORT_GLYPHS: Readonly<Record<string, string>> = {
  // ── Summer ──
  archery: '🏹',
  'artistic-swimming': '🏊‍♀️',
  athletics: '🏃',
  badminton: '🏸',
  baseball: '⚾',
  basketball: '🏀',
  'beach-volleyball': '🏐',
  boxing: '🥊',
  canoeing: '🛶',
  cricket: '🏏',
  cycling: '🚴',
  diving: '🤿',
  equestrian: '🏇',
  fencing: '🤺',
  'field-hockey': '🏑',
  football: '⚽',
  golf: '⛳',
  gymnastics: '🤸',
  handball: '🤾',
  judo: '🥋',
  lacrosse: '🥍',
  'modern-pentathlon': '⚔️',
  rowing: '🚣',
  'rugby-sevens': '🏉',
  sailing: '⛵',
  shooting: '🎯',
  skateboarding: '🛹',
  softball: '🥎',
  'sport-climbing': '🧗',
  surfing: '🏄',
  swimming: '🏊',
  'table-tennis': '🏓',
  taekwondo: '🥋',
  tennis: '🎾',
  triathlon: '🎽',
  volleyball: '🏐',
  'water-polo': '🤽',
  weightlifting: '🏋️',
  wrestling: '🤼',
  // ── Winter ──
  'alpine-skiing': '⛷️',
  biathlon: '🎯',
  bobsleigh: '🛷',
  'cross-country-skiing': '🎿',
  curling: '🥌',
  'figure-skating': '⛸️',
  'freestyle-skiing': '🤸',
  'ice-hockey': '🏒',
  luge: '🛷',
  'nordic-combined': '🎿',
  skeleton: '🛷',
  'ski-jumping': '🎿',
  'ski-mountaineering': '🏔️',
  snowboarding: '🏂',
  'speed-skating': '⛸️',
};

const OLYMPIC_SPORT_KEY = /^olympics-\d{4}-([a-z0-9-]+)$/;

// The emoji for an Olympic SPORT follow key; null for anything else
// (the Games follow `olympics-2028` included — that one IS the medal).
export function olympicSportGlyph(followKey: string): string | null {
  const m = OLYMPIC_SPORT_KEY.exec(followKey);
  if (!m) return null;
  return OLYMPIC_SPORT_GLYPHS[m[1]] ?? OLYMPIC_MEDAL;
}

// A fixture's Olympic sport glyph, from whichever of its follow keys
// names one — the fixture surfaces (rows, hero) read this.
export function olympicGlyphForKeys(followKeys: readonly string[]): string | null {
  for (const key of followKeys) {
    const g = olympicSportGlyph(key);
    if (g !== null) return g;
  }
  return null;
}
