// firestore.rules rejects a devices write with more than 200 followKeys or
// pollPaths — WHOLESALE, not truncated. A device over the limit silently
// stops being swept, which used to be a console.warn nobody would see.

import { registryOverflow, REGISTRY_KEY_LIMIT } from '../registryLimits';

const keys = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `k${i}`);

describe('registryOverflow', () => {
  test('the limit matches the rule in firestore.rules', () => {
    expect(REGISTRY_KEY_LIMIT).toBe(200);
  });

  test('inside the limit is not an overflow', () => {
    expect(registryOverflow(keys(200), keys(200))).toBeNull();
    expect(registryOverflow([], [])).toBeNull();
  });

  test('either list crossing the limit is an overflow', () => {
    // Rules check both independently, so either one fails the whole write.
    expect(registryOverflow(keys(201), keys(10))).toEqual({
      followKeys: 201,
      pollPaths: 10,
      limit: 200,
    });
    expect(registryOverflow(keys(10), keys(201))?.pollPaths).toBe(201);
  });

  test('it reports the real counts, so the message can name them', () => {
    const o = registryOverflow(keys(250), keys(240));
    expect(o).toEqual({ followKeys: 250, pollPaths: 240, limit: 200 });
  });
});
