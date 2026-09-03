import {
  OLYMPIC_MEDAL,
  OLYMPIC_SPORT_GLYPHS,
  olympicGlyphForKeys,
  olympicSportGlyph,
} from '../olympicGlyphs';
import { SPORTS } from '../sportsConfig';

test('every configured Olympic discipline has its own sport emoji — none falls back to the medal', () => {
  const disciplines = (SPORTS.find((s) => s.key === 'olympics')?.staticCompetitions ?? [])
    .map((c) => c.key)
    .filter((k) => /^olympics-\d{4}-/.test(k));
  expect(disciplines.length).toBeGreaterThan(50);
  const medals = disciplines.filter((k) => olympicSportGlyph(k) === OLYMPIC_MEDAL);
  expect(medals).toEqual([]);
});

test('the table itself never carries the medal', () => {
  expect(Object.values(OLYMPIC_SPORT_GLYPHS)).not.toContain(OLYMPIC_MEDAL);
});

test('the Games follow and non-Olympic keys are not sports', () => {
  expect(olympicSportGlyph('olympics-2028')).toBeNull();
  expect(olympicSportGlyph('tsdb-league-4445')).toBeNull();
  expect(olympicSportGlyph('olympics-2028-archery')).toBe('🏹');
  expect(olympicSportGlyph('olympics-2030-curling')).toBe('🥌');
  // An unknown future discipline degrades to the medal, never to nothing.
  expect(olympicSportGlyph('olympics-2032-flag-football')).toBe(OLYMPIC_MEDAL);
});

test('a fixture reads its glyph from whichever key names an Olympic sport', () => {
  expect(olympicGlyphForKeys(['olympics-2028', 'olympics-2028-swimming'])).toBe('🏊');
  expect(olympicGlyphForKeys(['tsdb-league-4328'])).toBeNull();
});
