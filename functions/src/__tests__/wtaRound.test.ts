// The WTA feed's MatchID is a BRACKET POSITION, so the round is the
// depth of the slot — no vendor, no second player-id namespace, no
// extra request. These pin the derivation and, more importantly, the
// four cases where it must REFUSE rather than guess a rung.

import { roundFromMatchId } from '../providers/wtaTennis';

describe('the ladder', () => {
  it('reads the rung off a full 2^k bracket, top-down', () => {
    expect(roundFromMatchId('LS001')).toBe('f');
    expect(roundFromMatchId('LS002')).toBe('sf');
    expect(roundFromMatchId('LS003')).toBe('sf');
    expect(roundFromMatchId('LS004')).toBe('qf');
    expect(roundFromMatchId('LS007')).toBe('qf');
    expect(roundFromMatchId('LS008')).toBe('r16');
    expect(roundFromMatchId('LS015')).toBe('r16');
    expect(roundFromMatchId('LS016')).toBe('r32');
    expect(roundFromMatchId('LS031')).toBe('r32');
  });

  it('THE PROOF IT IS A BRACKET, NOT A COUNTER', () => {
    // On the DC Open's last day the WTA singles final, the ATP singles
    // final and the ATP doubles final are all …001 — three draws, two
    // tours, one number. A per-draw counter could not do that.
    for (const id of ['LS001', 'MS001', 'MD001']) {
      expect(roundFromMatchId(id)).toBe('f');
    }
  });

  it('survives BYES, which is what kills the counting approach', () => {
    // LS028 exists in a 28-player draw, which plays 27 matches — a
    // contiguous counter could never mint 28. And 28 players with 4
    // byes gives 12 first-round matches, so "count and double" would
    // have produced 24, which is not a round.
    expect(roundFromMatchId('LS028')).toBe('r32');
  });

  it('is unmoved by a walkover', () => {
    // LS013 carries Winner "5" (walkover) and still sits at slot 13.
    expect(roundFromMatchId('LS013')).toBe('r16');
  });

  it('handles doubles, which run a rung ahead on the same day', () => {
    expect(roundFromMatchId('LD004')).toBe('qf');
    expect(roundFromMatchId('LD008')).toBe('r16');
  });
});

describe('what it REFUSES — each one a wrong rung avoided', () => {
  it('EXCLUDES QUALIFYING by draw level', () => {
    // RS007 would otherwise read as a quarter-final. A qualifying
    // draw's last round is not one.
    expect(roundFromMatchId('LS007', 'Q')).toBeUndefined();
    expect(roundFromMatchId('LS007', 'M')).toBe('qf');
  });

  it('EXCLUDES QUALIFYING by bracket letter, when the level is absent', () => {
    expect(roundFromMatchId('RS007')).toBeUndefined();
    expect(roundFromMatchId('QS007')).toBeUndefined();
  });

  it('returns nothing beyond the ladder rather than the nearest rung', () => {
    // A round of 128 has 64 MATCHES, so it occupies slots 64–127 — the
    // slot number is a position, not a draw size. LS128 would be a round
    // of 256, which tennis does not have, and it yields nothing rather
    // than being rounded down to the biggest rung we know.
    expect(roundFromMatchId('LS064')).toBe('r128');
    expect(roundFromMatchId('LS127')).toBe('r128');
    expect(roundFromMatchId('LS032')).toBe('r64');
    expect(roundFromMatchId('LS128')).toBeUndefined();
    expect(roundFromMatchId('LS256')).toBeUndefined();
  });

  it('NEVER DEFAULTS on a malformed id', () => {
    expect(roundFromMatchId('')).toBeUndefined();
    expect(roundFromMatchId(undefined)).toBeUndefined();
    expect(roundFromMatchId('LS')).toBeUndefined();
    expect(roundFromMatchId('LS000')).toBeUndefined();
    expect(roundFromMatchId('nonsense')).toBeUndefined();
    // Never a fixed slice(2) — a longer prefix must not silently shift.
    expect(roundFromMatchId('LSX013')).toBeUndefined();
  });
});
