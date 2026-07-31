// Parsing fighters out of combat-sport event titles.
//
// TheSportsDB publishes these as a card with a title and no participant
// fields. The fighters are in the title, but the title is event branding
// first and a bout second — and a WRONG athlete key is far worse than a
// missing one, because it becomes a followable that silently matches
// another man's fights.

import { athleteKey, isFollowableName, parseBout } from '../participants';

describe('titles we can parse with confidence', () => {
  test.each([
    ['Rolando Romero vs Teofimo Lopez', 'Rolando Romero', 'Teofimo Lopez'],
    ['UFC 330 Makhachev vs Machado Garry', 'Makhachev', 'Machado Garry'],
    ['Prime Video Boxing 16 Inoue vs Tenshin II', 'Inoue', 'Tenshin'],
    ['UFC Fight Night 286 Nurmagomedov vs Song', 'Nurmagomedov', 'Song'],
    ['Leigh Wood vs Josh Warrington 2', 'Leigh Wood', 'Josh Warrington'],
    ["Pierce O'Leary vs Mark Chamberlain", "Pierce O'Leary", 'Mark Chamberlain'],
    ['Aaron McKenna  vs  Etinosa Oliha', 'Aaron McKenna', 'Etinosa Oliha'],
    ['MVPW 05 Johnson vs Thorslund', 'Johnson', 'Thorslund'],
    ['Zuffa Boxing 10 Ryan Garcia vs Conor Benn', 'Ryan Garcia', 'Conor Benn'],
    ['Lamont Roach Jr. vs William Zepeda', 'Lamont Roach Jr.', 'William Zepeda'],
  ])('%s', (title, first, second) => {
    expect(parseBout(title, 'boxing')).toEqual({ first, second });
  });

  test('a number in the branding is the boundary, not part of the name', () => {
    // "UFC 330" — everything after the last numeric token is the fighter.
    expect(parseBout('UFC 330 Makhachev vs Garry', 'ufc')?.first).toBe(
      'Makhachev',
    );
  });

  test('diacritics survive', () => {
    const b = parseBout('UFC Fight Night 283 Medić vs Rodriguez', 'ufc');
    expect(b?.first).toBe('Medić');
  });
});

describe('titles we DECLINE rather than guess at', () => {
  test.each([
    // A city sits between the branding and the name, and a city is
    // indistinguishable from a surname.
    ['BKFC Fight Night Belgrade Faulkner vs Prašović'],
    ['PFL Dubai Nurmagomedov vs Davis'],
    ['PFL Madrid van Steenis vs Edwards 2'],
    // No bout named at all.
    ['ONE Fight Night 46'],
    ['ONE Friday Fights 165'],
    ['UFC Fight Night 287 '],
    ['BKFC Knucklemania VI'],
    // Three-way is not a bout.
    ['A vs B vs C'],
  ])('%s', (title) => {
    expect(parseBout(title, 'ufc')).toBeNull();
  });

  test('only combat sports are parsed at all', () => {
    // "Arsenal v Liverpool" must never become two athletes.
    expect(parseBout('Arsenal v Liverpool', 'soccer')).toBeNull();
    expect(parseBout('Knicks vs 76ers', 'basketball')).toBeNull();
  });

  test('a name identical on both sides is a parse artefact, not a bout', () => {
    expect(parseBout('Smith vs Smith', 'boxing')).toBeNull();
  });
});

describe('only a full name earns a follow key', () => {
  test('a surname alone is not an identity', () => {
    // Nurmagomedov, Rodriguez and Silva are each several fighters. A key
    // built from one would quietly deliver another man's fights.
    expect(isFollowableName('Nurmagomedov')).toBe(false);
    expect(isFollowableName('Rodriguez')).toBe(false);
  });

  test('a full name is', () => {
    expect(isFollowableName('Teofimo Lopez')).toBe(true);
    expect(isFollowableName('Lamont Roach Jr.')).toBe(true);
  });
});

describe('athlete keys are stable across spellings', () => {
  test('diacritics and case fold to one key', () => {
    expect(athleteKey('Teófimo López')).toBe(athleteKey('Teofimo Lopez'));
    expect(athleteKey('teofimo lopez')).toBe('athlete-teofimo-lopez');
  });

  test('punctuation becomes a separator, exactly as the alias table does', () => {
    // normaliseName maps every non-alphanumeric to a space, so an
    // apostrophe splits rather than vanishing. Pinned because the athlete
    // key and the club alias key MUST normalise identically — they are the
    // same function, and a divergence would resolve one and not the other.
    expect(athleteKey("Pierce O'Leary")).toBe('athlete-pierce-o-leary');
    expect(athleteKey('Pierce O’Leary')).toBe('athlete-pierce-o-leary');
  });
});
