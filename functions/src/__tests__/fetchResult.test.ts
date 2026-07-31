// The shape/content boundary. Separating a read FAILURE from an empty
// RESULT is the standing invariant; the inverse mistake — calling a real
// empty season an outage — would make every off-season league look broken.
//
// The provider conventions asserted here were verified live on 2026-07-31
// against all six APIs; see docs/PLAN.md Stage 1b.

import { requireArray } from '../providers/fetchResult';

describe('content: legitimate empties are NOT failures', () => {
  test('explicit null is the documented empty (TheSportsDB)', () => {
    // Live: eventsseason.php?id=4482&s=2026-2027 → {"events": null}, and
    // the same for a league id that does not exist.
    expect(requireArray(null, 'thesportsdb', 'events')).toEqual([]);
  });

  test('an empty array is empty (football-data, NHL, MLB, Jolpica)', () => {
    expect(requireArray([], 'football-data', 'matches')).toEqual([]);
  });

  test('a populated array passes through untouched', () => {
    const rows = [{ id: 1 }, { id: 2 }];
    expect(requireArray(rows, 'nhl api-web', 'games')).toBe(rows);
  });
});

describe('shape: anything we do not recognise is a read failure', () => {
  test('a missing key throws and names the field', () => {
    expect(() => requireArray(undefined, 'football-data', 'matches')).toThrow(
      'football-data: response missing "matches"',
    );
  });

  test.each([
    ['a string', 'oops', 'string'],
    ['an object', { events: [] }, 'object'],
    ['a number', 0, 'number'],
    ['a boolean', false, 'boolean'],
  ])('%s is rejected as shape rot, not counted as rows', (_label, value, kind) => {
    // The overshoot this test exists for: `value ?? []` waved all of these
    // through. A string then reported its CHARACTER COUNT as rawCount
    // ("oops" → 4 rows) before failing downstream with "value.map is not a
    // function"; an object reported rawCount undefined.
    expect(() =>
      requireArray(value as unknown as unknown[], 'probe', 'field'),
    ).toThrow(`probe: "field" is not an array (got ${kind})`);
  });

  test('a non-array cannot reach a row count', () => {
    // Pins the actual consequence, not just the throw.
    let counted: number | undefined;
    try {
      counted = requireArray('oops' as unknown as unknown[], 'p', 'f').length;
    } catch {
      counted = undefined;
    }
    expect(counted).toBeUndefined();
  });
});
