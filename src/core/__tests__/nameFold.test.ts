// The search fold. Every case here is a real name from the production
// store or the served directory, not an invented one — the bug this
// closes was found by measuring what was actually stored, and the tests
// stay anchored to that.

import { foldForSearch, foldedIncludes, anyFoldedIncludes } from '../nameFold';

describe('foldForSearch', () => {
  it('strips the accents a keyboard will not produce', () => {
    expect(foldForSearch('Brasileirão')).toBe('brasileirao');
    expect(foldForSearch('Mönchengladbach')).toBe('monchengladbach');
    expect(foldForSearch('Jakub Menšik')).toBe('jakub mensik');
  });

  // These are LETTERS, not letter-plus-mark, so NFD leaves them intact
  // and the character class would otherwise turn them into spaces. Every
  // one of these was a real unsearchable name.
  it('folds the letters NFD cannot decompose', () => {
    expect(foldForSearch('Međedović')).toBe('medjedovic');
    expect(foldForSearch('Søren')).toBe('soren');
    expect(foldForSearch('Łukasz')).toBe('lukasz');
    expect(foldForSearch('Æther')).toBe('aether');
    expect(foldForSearch('Straße')).toBe('strasse');
  });

  it('collapses punctuation to single spaces, and trims', () => {
    expect(foldForSearch('Marc-Andrea Huesler')).toBe('marc andrea huesler');
    expect(foldForSearch('  Chun-Hsin   Tseng  ')).toBe('chun hsin tseng');
    expect(foldForSearch('DFB-Pokal')).toBe('dfb pokal');
  });

  it('spells out the ampersand so either form matches', () => {
    expect(foldForSearch('Western & Southern')).toBe('western and southern');
  });

  it('is idempotent — folding a folded string changes nothing', () => {
    for (const n of ['Brasileirão', 'Međedović', 'Marc-Andrea Huesler']) {
      expect(foldForSearch(foldForSearch(n))).toBe(foldForSearch(n));
    }
  });

  // The twelve names measured in production 2026-08-07 as stored with a
  // lower-cased searchName instead of a normalised one, and therefore
  // unreachable by any ASCII spelling.
  it('makes every measured-unsearchable ATP name reachable in ASCII', () => {
    const cases: [string, string][] = [
      ['Hamad Medjedović', 'medjedovic'],
      ['Max Alcalá Gurri', 'alcala'],
      ['Marc-Andrea Huesler', 'marc andrea'],
      ['Andrej Nedić', 'nedic'],
      ['Chun-Hsin Tseng', 'chun hsin'],
      ['Marvin Möller', 'moller'],
      ['Ognjen Milić', 'milic'],
      ['Tung-Lin Wu', 'tung lin'],
      ['Jacopo Vasamì', 'vasami'],
      ['Mika Petković', 'petkovic'],
      ['Miloš Karol', 'milos'],
      ['Dušan Obradović', 'obradovic'],
    ];
    for (const [stored, typed] of cases) {
      expect(foldedIncludes(stored, typed)).toBe(true);
    }
  });
});

describe('foldedIncludes', () => {
  it('folds BOTH sides — the accented spelling finds the row too', () => {
    expect(foldedIncludes('Brasileirão', 'Brasileirão')).toBe(true);
    expect(foldedIncludes('Brasileirão', 'brasileirao')).toBe(true);
  });

  it('an empty or blank needle matches nothing, never everything', () => {
    expect(foldedIncludes('Premier League', '')).toBe(false);
    expect(foldedIncludes('Premier League', '   ')).toBe(false);
    // Punctuation alone folds to empty and must behave the same way.
    expect(foldedIncludes('Premier League', '---')).toBe(false);
  });

  it('does not match an unrelated word', () => {
    expect(foldedIncludes('Premier League', 'bundesliga')).toBe(false);
  });
});

describe('anyFoldedIncludes', () => {
  it('matches on a provider alias, not only the display name', () => {
    const names = ['Borussia Mönchengladbach', "M'gladbach", 'Gladbach'];
    expect(anyFoldedIncludes(names, 'gladbach')).toBe(true);
    expect(anyFoldedIncludes(names, 'monchengladbach')).toBe(true);
  });

  it('tolerates a missing alias list without throwing', () => {
    expect(anyFoldedIncludes(['Arsenal', undefined, null], 'arsenal')).toBe(true);
    expect(anyFoldedIncludes([undefined, null], 'arsenal')).toBe(false);
  });

  it('an empty needle matches nothing here too', () => {
    expect(anyFoldedIncludes(['Arsenal'], '')).toBe(false);
  });
});

// The whole point of this module: the client fold and the server fold
// must agree, or one search box answers two different ways. These mirror
// functions/src/identity.ts::normaliseName exactly.
describe('agreement with the server fold', () => {
  it('matches normaliseName on the cases its own comments record', () => {
    expect(foldForSearch('Hrgović')).toBe('hrgovic');
    expect(foldForSearch('Međedović')).toBe('medjedovic');
    expect(foldForSearch('Teófimo Lopez')).toBe('teofimo lopez');
  });
});
