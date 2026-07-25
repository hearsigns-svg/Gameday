// Followed followable keys. Slice scope: teams only, stored locally.
// Server-side user state joins with real auth (post-slice).

import { readJson, writeJson } from '../../../core/storage';

const KEY = 'follows.v1';

export function loadFollows(): string[] {
  return readJson<string[]>(KEY, []);
}

export function setFollowed(key: string, followed: boolean): string[] {
  const current = new Set(loadFollows());
  if (followed) current.add(key);
  else current.delete(key);
  const next = [...current];
  writeJson(KEY, next);
  return next;
}
