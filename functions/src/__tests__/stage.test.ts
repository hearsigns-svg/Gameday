// Every provider sends structure and every adapter threw it away. These
// pin the one rule that keeps the field trustworthy: an unrecognised
// value keeps its label and gets NO rung, because forcing "Play-offs"
// into the nearest one would put a group game in a quarter-final scope.

import { atOrAfter, ordinalFromText, roundFromText, stageFrom } from '../stage';

describe('roundFromText', () => {
  it('recognises the vocabularies we have actually seen', () => {
    // api-sports' banked payload literally contains "Quarter-finals";
    // the ATP sheet carries "Round of 32".
    expect(roundFromText('Quarter-finals')).toBe('qf');
    expect(roundFromText('Round of 32')).toBe('r32');
    expect(roundFromText('Semi-final')).toBe('sf');
    expect(roundFromText('Final')).toBe('f');
    expect(roundFromText('1/8')).toBe('r16');
  });

  it('READS THE VENDOR’S SLUGS, hyphens and all', () => {
    // Measured 2026-08-07 — the full observed ladder, verbatim. Keying
    // on slug rather than name or the round integer: name is what a
    // vendor localises, and the integer runs 32, 6, 5, 27, 28, 29 up
    // the ladder, which sorts wrong at both ends.
    expect(roundFromText('round-of-64')).toBe('r64');
    expect(roundFromText('round-of-32')).toBe('r32');
    expect(roundFromText('round-of-16')).toBe('r16');
    expect(roundFromText('quarterfinals')).toBe('qf');
    expect(roundFromText('semifinals')).toBe('sf');
    expect(roundFromText('final')).toBe('f');
  });

  it('reads the vendor’s display names too', () => {
    expect(roundFromText('Quarterfinals')).toBe('qf');
    expect(roundFromText('Semifinals')).toBe('sf');
    expect(roundFromText('Round of 64')).toBe('r64');
  });

  it('is insensitive to case, spacing and underscores', () => {
    expect(roundFromText('QUARTER FINALS')).toBe('qf');
    expect(roundFromText('quarter_finals')).toBe('qf');
    expect(roundFromText('  Semi   Finals ')).toBe('sf');
  });

  it('REFUSES anything it does not recognise', () => {
    // The whole point. A guess here silently mis-scopes a real match.
    expect(roundFromText('Play-offs')).toBeUndefined();
    expect(roundFromText('Group Stage - 3')).toBeUndefined();
    expect(roundFromText('Regular Season')).toBeUndefined();
    expect(roundFromText('')).toBeUndefined();
    expect(roundFromText(null)).toBeUndefined();
  });

  it('does not mistake GOLF’s Final Round for a knockout final', () => {
    // 73 production docs say "Final Round". Golf's Sunday is a sequence
    // position, and treating it as a knockout rung would put every golf
    // final round into a "final" scope.
    expect(roundFromText('Final Round')).toBeUndefined();
    expect(roundFromText('Round 3')).toBeUndefined();
  });
});

describe('ordinalFromText', () => {
  it('reads a bare sequence number', () => {
    // TheSportsDB's intRound is "38" for a league matchday.
    expect(ordinalFromText('38')).toBe(38);
    expect(ordinalFromText('Round 3')).toBe(3);
    expect(ordinalFromText('Matchday 5')).toBe(5);
  });

  it('is not fooled by words it cannot count', () => {
    expect(ordinalFromText('Quarter-finals')).toBeUndefined();
    expect(ordinalFromText('0')).toBeUndefined();
  });
});

describe('stageFrom', () => {
  it('keeps round, group and ordinal APART', () => {
    // The owner's instruction: these are different questions and one
    // string would make a scope ladder guess which it was holding.
    expect(stageFrom({ round: 'Quarter-finals', group: 'Group A' })).toEqual({
      label: 'Quarter-finals',
      round: 'qf',
      group: 'Group A',
    });
  });

  it('a bare number becomes an ordinal, never a rung', () => {
    expect(stageFrom({ round: '38' })).toEqual({ label: '38', ordinal: 38 });
  });

  it('KEEPS THE LABEL when the rung is unrecognised', () => {
    // Nothing is lost to our normalisation; a future vocabulary can be
    // learned from what was actually stored.
    expect(stageFrom({ round: 'Play-offs' })).toEqual({ label: 'Play-offs' });
  });

  it('a group with no round is a real answer', () => {
    // A World Cup group game has a group and no rung; a quarter-final
    // has a rung and no group. Both are normal.
    expect(stageFrom({ group: 'Group C' })).toEqual({ group: 'Group C' });
  });

  it('ABSENT STAYS ABSENT', () => {
    // 14,000 documents must not each gain an empty object.
    expect(stageFrom({})).toBeUndefined();
    expect(stageFrom({ round: '', group: '  ' })).toBeUndefined();
    expect(stageFrom({ round: null, group: null })).toBeUndefined();
  });
});

describe('atOrAfter — the ladder lives in one place', () => {
  it('orders the rungs', () => {
    expect(atOrAfter('sf', 'qf')).toBe(true);
    expect(atOrAfter('f', 'qf')).toBe(true);
    expect(atOrAfter('r16', 'qf')).toBe(false);
    expect(atOrAfter('qf', 'qf')).toBe(true);
  });

  it('puts the third-place play-off before the final', () => {
    expect(atOrAfter('third-place', 'sf')).toBe(true);
    expect(atOrAfter('f', 'third-place')).toBe(true);
  });
});
