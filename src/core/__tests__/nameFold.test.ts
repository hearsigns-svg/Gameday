// The search fold. Every case here is a real name from the production
// store or the served directory, not an invented one — the bug this
// closes was found by measuring what was actually stored, and the tests
// stay anchored to that.

import { foldName, foldedIncludes, anyFoldedIncludes, pairKey } from '../nameFold';

describe('foldName', () => {
  it('strips the accents a keyboard will not produce', () => {
    expect(foldName('Brasileirão')).toBe('brasileirao');
    expect(foldName('Mönchengladbach')).toBe('monchengladbach');
    expect(foldName('Jakub Menšik')).toBe('jakub mensik');
  });

  // These are LETTERS, not letter-plus-mark, so NFD leaves them intact
  // and the character class would otherwise turn them into spaces. Every
  // one of these was a real unsearchable name.
  it('folds the letters NFD cannot decompose', () => {
    expect(foldName('Međedović')).toBe('medjedovic');
    expect(foldName('Søren')).toBe('soren');
    expect(foldName('Łukasz')).toBe('lukasz');
    expect(foldName('Æther')).toBe('aether');
    expect(foldName('Straße')).toBe('strasse');
  });

  it('collapses punctuation to single spaces, and trims', () => {
    expect(foldName('Marc-Andrea Huesler')).toBe('marc andrea huesler');
    expect(foldName('  Chun-Hsin   Tseng  ')).toBe('chun hsin tseng');
    expect(foldName('DFB-Pokal')).toBe('dfb pokal');
  });

  it('spells out the ampersand so either form matches', () => {
    expect(foldName('Western & Southern')).toBe('western and southern');
  });

  it('is idempotent — folding a folded string changes nothing', () => {
    for (const n of ['Brasileirão', 'Međedović', 'Marc-Andrea Huesler']) {
      expect(foldName(foldName(n))).toBe(foldName(n));
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
    expect(foldName('Hrgović')).toBe('hrgovic');
    expect(foldName('Međedović')).toBe('medjedovic');
    expect(foldName('Teófimo Lopez')).toBe('teofimo lopez');
  });
});

// ---------------------------------------------------------------------------
// THE DEDUPE SURFACE. This fold stopped being search-only in 22c-follow-up:
// `sameBout.ts` and `card.ts` fold through it, so it now decides whether two
// documents describe one real event — and therefore whether the app writes
// one calendar entry or two. That is a different risk class from a search
// box returning nothing, and it gets its own tests.

describe('pairKey', () => {
  it('is order-independent — "A vs B" and "B vs A" are one pair', () => {
    expect(pairKey(foldName('Itauma'), foldName('Hrgović'))).toBe(
      pairKey(foldName('Hrgović'), foldName('Itauma')),
    );
  });

  it('separates different pairs', () => {
    expect(pairKey(foldName('Itauma'), foldName('Hrgović'))).not.toBe(
      pairKey(foldName('Itauma'), foldName('Dubois')),
    );
  });

  // The reason `sameBout` and `card` were consolidated onto this fold.
  it('unites two provider spellings of one ampersand name', () => {
    expect(pairKey(foldName('Brighton & Hove Albion'), foldName('Arsenal'))).toBe(
      pairKey(foldName('Brighton and Hove Albion'), foldName('Arsenal')),
    );
  });

  it('unites a diacritic spelling with its ASCII transliteration', () => {
    expect(pairKey(foldName('Filip Hrgović'), foldName('Moses Itauma'))).toBe(
      pairKey(foldName('Filip Hrgovic'), foldName('Moses Itauma')),
    );
  });

  // The failure this fold must NEVER produce: two different people
  // collapsing into one, which would delete somebody's calendar event.
  it('does not collapse two different people', () => {
    expect(pairKey(foldName('AFC Liverpool'), foldName('Everton'))).not.toBe(
      pairKey(foldName('Liverpool'), foldName('Everton')),
    );
    expect(pairKey(foldName('Shang Juncheng'), foldName('Alcaraz'))).not.toBe(
      pairKey(foldName('Juncheng Shang'), foldName('Alcaraz')),
    );
  });
});

// The consolidation replaced a 9-rule fold with an 11-rule one in the two
// dedupe modules. These pin what that did and did not change, measured
// against production: of 4,102 distinct participant names, 64 fold
// differently and ZERO entity groups are separated by one and united by
// the other.
describe('what the consolidation changed', () => {
  const nineRule = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/đ/g, 'dj')
      .replace(/ø/g, 'o')
      .replace(/ł/g, 'l')
      .replace(/æ/g, 'ae')
      .replace(/ß/g, 'ss')
      .replace(/þ/g, 'th')
      .replace(/ð/g, 'd')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  // Real names taken from the production scan.
  const AMPERSAND = [
    'AT&T Pebble Beach Pro Am Round 1',
    'Lynk & Co Hangzhou Open',
    'Bosnia & Herzegovina Championships',
    'Sunshine Coast Marathon Festival - 10K & 5K',
  ];
  const NO_AMPERSAND = [
    'Moses Itauma',
    'Filip Hrgović',
    'Borussia Mönchengladbach',
    'Marc-Andrea Huesler',
    'Chun-Hsin Tseng',
    "Fayez Sarofim Co. U.S. Men's Clay Court Championship",
  ];

  it('changes nothing for a name without an ampersand', () => {
    for (const n of NO_AMPERSAND) expect(foldName(n)).toBe(nineRule(n));
  });

  it('differs ONLY on the ampersand, and only by spelling it', () => {
    for (const n of AMPERSAND) {
      expect(foldName(n)).not.toBe(nineRule(n));
      expect(foldName(n)).toContain(' and ');
      expect(nineRule(n)).not.toContain(' and ');
    }
  });

  it('the punctuation classes are equivalent — only `&` really differs', () => {
    // The old fold collapsed runs of non-alphanumerics; the new one maps
    // each to a space then collapses. Same result, which is why the
    // consolidation was behaviour-preserving everywhere but `&`.
    for (const n of ['a--b', 'a...b', "O'Brien  -  Smith", 'DFB-Pokal']) {
      expect(foldName(n)).toBe(nineRule(n));
    }
  });
});
