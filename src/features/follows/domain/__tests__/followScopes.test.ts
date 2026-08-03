// Per-follow granularity (Prompt 11): scope decides query keys and the
// F1 sessions override; nothing touches the ledger or fixture ids.

import { Followable } from '../../data/followStore';
import {
  followQueryKeys,
  scopesFor,
  seriesScopesFrom,
} from '../followScopes';

const follow = (over: Partial<Followable>): Followable => ({
  key: 'k',
  label: 'L',
  sportKey: 'tennis',
  type: 'competition',
  ...over,
});

describe('followQueryKeys', () => {
  test('default scope queries the bare key — today’s behaviour, unchanged', () => {
    expect(followQueryKeys(follow({ key: 'tennis-t-wimbledon' }))).toEqual([
      'tennis-t-wimbledon',
    ]);
    expect(followQueryKeys(follow({ key: 'tsdb-league-4425', sportKey: 'golf' }))).toEqual([
      'tsdb-league-4425',
    ]);
  });

  test('tennis finals scope ADDS the scoped slot key — banner plus final', () => {
    expect(
      followQueryKeys(follow({ key: 'tennis-t-wimbledon', scope: 'finals' })),
    ).toEqual(['tennis-t-wimbledon', 'tennis-t-wimbledon-finals']);
  });

  test('golf final-round scope SWAPS to the scoped key — one event per tournament', () => {
    expect(
      followQueryKeys(
        follow({ key: 'tsdb-league-4425', sportKey: 'golf', scope: 'final-round' }),
      ),
    ).toEqual(['tsdb-league-4425-final']);
  });

  test('a scope on a key outside its family is inert — a stale stored value cannot corrupt the query', () => {
    expect(
      followQueryKeys(follow({ key: 'fdorg-comp-PL', scope: 'finals' })),
    ).toEqual(['fdorg-comp-PL']);
    expect(
      followQueryKeys(follow({ key: 'tennis-t-wimbledon', scope: 'final-round' })),
    ).toEqual(['tennis-t-wimbledon']);
  });

  test('F1 scopes never change the query — sessions filter in the planner', () => {
    expect(
      followQueryKeys(
        follow({ key: 'f1-series-1', type: 'series', scope: 'race-only' }),
      ),
    ).toEqual(['f1-series-1']);
  });
});

describe('scopesFor', () => {
  test('tennis tournaments, catalogued golf tours and the F1 series offer options; everything else none', () => {
    expect(scopesFor(follow({ key: 'tennis-t-us-open' })).map((o) => o.scope)).toEqual([
      null,
      'finals',
    ]);
    expect(
      scopesFor(follow({ key: 'tsdb-league-5329', sportKey: 'golf' })).map((o) => o.scope),
    ).toEqual([null, 'final-round']);
    expect(
      scopesFor(follow({ key: 'f1-series-1', type: 'series' })).map((o) => o.scope),
    ).toEqual(['all-sessions', 'race-only']);
    expect(scopesFor(follow({ key: 'fdorg-comp-PL' }))).toEqual([]);
    expect(scopesFor(follow({ key: 'tsdb-league-4445', sportKey: 'boxing' }))).toEqual([]);
    // The athletes route must never grow a selector by accident.
    expect(scopesFor(follow({ key: 'athlete_000001', type: 'athlete' }))).toEqual([]);
  });

  test('the tennis finals option says the ATP asymmetry out loud', () => {
    const finals = scopesFor(follow({ key: 'tennis-t-wimbledon' })).find(
      (o) => o.scope === 'finals',
    )!;
    expect(finals.note).toContain('WTA');
    expect(finals.note).toContain('ATP');
  });
});

describe('seriesScopesFrom', () => {
  test('collects only F1 session scopes, keyed by follow key', () => {
    const m = seriesScopesFrom([
      follow({ key: 'f1-series-1', type: 'series', scope: 'race-only' }),
      follow({ key: 'tennis-t-us-open', scope: 'finals' }),
      follow({ key: 'fdorg-comp-PL' }),
    ]);
    expect([...m.entries()]).toEqual([['f1-series-1', 'race-only']]);
  });

  test('all-sessions maps to all', () => {
    const m = seriesScopesFrom([
      follow({ key: 'f1-series-1', type: 'series', scope: 'all-sessions' }),
    ]);
    expect(m.get('f1-series-1')).toBe('all');
  });
});
