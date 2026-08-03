// The generated identity layer (Prompt 9b): monograms and sport
// geometry replaced crests and the emoji fallback.

import { monogramOf } from '../components';
import { sportPatternFamily } from '../sportPattern';

describe('monogramOf', () => {
  test('two words → two initials; one word → two letters', () => {
    expect(monogramOf('Teofimo Lopez')).toBe('TL');
    expect(monogramOf('Boston Bruins')).toBe('BB');
    expect(monogramOf('Liverpool')).toBe('LI');
    expect(monogramOf('US Open')).toBe('UO');
  });
  test('diacritics and punctuation survive sensibly', () => {
    expect(monogramOf('Teófimo López')).toBe('TL');
    expect(monogramOf("Pierce O'Leary")).toBe('PO');
    expect(monogramOf('  ')).toBe('·');
  });
});

describe('sportPatternFamily', () => {
  test('every launch sport with a pattern maps to its family; unknowns get none', () => {
    expect(sportPatternFamily('tennis')).toBe('court');
    expect(sportPatternFamily('boxing')).toBe('ring');
    expect(sportPatternFamily('ufc')).toBe('ring');
    expect(sportPatternFamily('athletics')).toBe('track');
    expect(sportPatternFamily('golf')).toBe('track');
    expect(sportPatternFamily('soccer')).toBe('pitch');
    expect(sportPatternFamily('baseball')).toBe('diamond');
    expect(sportPatternFamily('something-new')).toBeNull();
  });
});
