// Followed followables, labeled for display. v2 stores objects; v1
// (bare keys, M1 slice) migrates on first load. Server-side user state
// joins with real auth (post-slice).

import { readJson, writeJson } from '../../../core/storage';
import { FollowableType } from '../domain/sportsConfig';

export interface Followable {
  key: string;
  label: string;
  sportKey: string;
  type: FollowableType;
  // Functions path polled when this follow syncs; attached at follow
  // time from config. Absent on legacy follows → provider-prefix routes.
  pollPath?: string;
  // Identity artwork/colour captured at follow time where the provider
  // offers it — the favourites provide the identity. Colour is a raw
  // hex or kit-colour text; it only reaches UI slots via teamTheme().
  crestUrl?: string;
  brandColour?: string;
}

const KEY_V2 = 'follows.v2';
const KEY_V1 = 'follows.v1';

// The only key the M1 slice could follow.
const V1_KNOWN: Record<string, Followable> = {
  'apisports-team-40': {
    key: 'apisports-team-40',
    label: 'Liverpool FC',
    sportKey: 'soccer',
    type: 'team',
  },
};

export function loadFollowables(): Followable[] {
  const v2 = readJson<Followable[] | null>(KEY_V2, null);
  if (v2) return v2;
  const v1 = readJson<string[]>(KEY_V1, []);
  const migrated = v1.map(
    (key) =>
      V1_KNOWN[key] ?? { key, label: key, sportKey: 'soccer', type: 'team' as const },
  );
  writeJson(KEY_V2, migrated);
  return migrated;
}

export function loadFollowKeys(): string[] {
  return loadFollowables().map((f) => f.key);
}

export function isFollowed(key: string): boolean {
  return loadFollowables().some((f) => f.key === key);
}

export function setFollowed(item: Followable, followed: boolean): Followable[] {
  const current = loadFollowables().filter((f) => f.key !== item.key);
  const next = followed ? [...current, item] : current;
  writeJson(KEY_V2, next);
  return next;
}
