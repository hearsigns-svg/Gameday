// Followed followables, labeled for display. v2 stores objects; v1
// (bare keys, M1 slice) migrates on first load. Server-side user state
// joins with real auth (post-slice).

import { readJson, writeJson } from '../../../core/storage';
import { applyArtHydration, ArtRow } from '../domain/followArt';
import {
  CalendarPref,
  inclusionPredicate,
  InclusionFollow,
} from '../domain/calendarInclusion';
import { followQueryKeys, FollowScope } from '../domain/followScopes';
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
  brandColour?: string;
  // Crest / competition logo captured at follow time (Prompt 13), so
  // the Following rail, Home and the entity page inherit it without a
  // directory read. Absent on every follow made before Prompt 13 and on
  // anything the imagery policy suppresses — the generated treatment
  // covers both.
  crestUrl?: string;
  // Per-follow granularity (Prompt 11) — what this follow delivers,
  // where the sport offers a choice (domain/followScopes.ts). Absent =
  // the default: today's behaviour, unchanged.
  scope?: FollowScope;
  // Nationality, captured at follow time. An athlete has no crest, so
  // on the Following rail a boxer was a monogram in a colour and
  // nothing else — five of them read as five anonymous tokens. The flag
  // IS the identity mark (Prompt 16 B); it just never reached the
  // follow.
  countryCode?: string;
  // The browse population this athlete belongs to, captured at follow
  // time so the page reached from the Following rail — which carries no
  // directory data — can still say what a follow will deliver.
  grouping?: string;
  // Recorded retirement, captured at follow time (Prompt 12) so the
  // athlete's page is still honest when it is reached from the
  // Following rail, which carries no directory data of its own. Absent
  // on every follow made before Prompt 12 — and absent means unknown,
  // so the page simply falls back to the ordinary empty state.
  careerStatus?: 'retired';
  careerEndYear?: number;
  // Per-follow calendar control (owner brief 2026-09-23): whether this
  // follow's fixtures go in the calendar. ABSENT READS AS `in` — every
  // follow before this field existed was in the calendar, and the launch
  // normalizer (data/followMigrations.ts::migrateCalendarPrefs) stamps
  // the explicit value. A new follow gets its starting state in
  // followActions.follow (domain/calendarInclusion.ts).
  calendar?: CalendarPref;
  // NOTE: venue photography is no longer cached here. A ground belongs
  // to the HOME team of a given fixture, not to whoever you follow, so
  // it is keyed by team name in data/photoCache.ts. Stored follows may
  // still carry a stale `venueArt` key; it is read by nothing.
}

const KEY_V2 = 'follows.v2';
const KEY_V1 = 'follows.v1';

// Screens and controls that must agree the moment a follow changes — a
// calendar glyph tapped on a hero card repaints the Following row at
// once, before any sync runs. Fired by every write
// below; never by the read path's one-time v1 migration.
type FollowsListener = () => void;
const followsListeners = new Set<FollowsListener>();

export function subscribeFollows(fn: FollowsListener): () => void {
  followsListeners.add(fn);
  return () => {
    followsListeners.delete(fn);
  };
}

function store(next: Followable[]): void {
  writeJson(KEY_V2, next);
  for (const fn of [...followsListeners]) fn();
}

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

// QUERY keys, scope-expanded: a follow's granularity decides which
// fixture keys it queries (a finals scope adds the scoped slot key, a
// final-round scope swaps to the scoped round key). Everything that
// fetches or matches fixtures must use these, not bare `.key`s.
export function loadFollowKeys(): string[] {
  return [...new Set(loadFollowables().flatMap((f) => followQueryKeys(f)))];
}

// Update one stored follow's scope in place. No-op if the follow is
// gone (unfollowed on another screen while its page was open).
export function setFollowScope(key: string, scope: FollowScope | null): void {
  const next = loadFollowables().map((f) => {
    if (f.key !== key) return f;
    const { scope: _drop, ...rest } = f;
    return scope === null ? rest : { ...rest, scope };
  });
  store(next);
}

// The calendar preference, absent-means-in.
export function calendarPrefOf(f: Pick<Followable, 'calendar'>): CalendarPref {
  return f.calendar ?? 'in';
}

// Set the calendar preference of the named follows in place. Keys that
// are not followed are ignored (unfollowed on another screen meanwhile).
export function setFollowCalendar(keys: readonly string[], pref: CalendarPref): void {
  const wanted = new Set(keys);
  store(loadFollowables().map((f) => (wanted.has(f.key) ? { ...f, calendar: pref } : f)));
}

// The follows as the inclusion rule sees them.
export function toInclusionFollow(f: Followable): InclusionFollow {
  return {
    key: f.key,
    type: f.type,
    calendar: calendarPrefOf(f),
    queryKeys: followQueryKeys(f),
  };
}

export function inclusionFollows(
  follows: readonly Followable[] = loadFollowables(),
): InclusionFollow[] {
  return follows.map(toInclusionFollow);
}

// Is a fixture with these keys in the calendar by preference, right now?
// Pins and per-event exclusions are the caller's business.
export function fixtureWantedByFollows(
  follows: readonly Followable[] = loadFollowables(),
): (fixtureKeys: readonly string[]) => boolean {
  return inclusionPredicate(inclusionFollows(follows));
}

export function isFollowed(key: string): boolean {
  return loadFollowables().some((f) => f.key === key);
}

// A GLOBAL tournament-tier change clears every per-tournament override
// (Round 7 item 7, owner ruling 2026-09-03). The per-tournament chips
// are a divergence FROM the preference; a user who then changes the
// preference has stated a rule for every tournament, and a stale
// override quietly winning over it is how "All matches" delivered
// nothing — the retired 'Tournament + final' migration had left
// 'key-rounds' pinned on the follow. Returns the keys cleared.
const TOURNAMENT_TIER_SCOPES: ReadonlySet<string> = new Set([
  'block',
  'key-rounds',
  'all-matches',
]);

export function clearTournamentTierOverrides(): string[] {
  const cleared: string[] = [];
  const next = loadFollowables().map((f) => {
    if (f.scope === undefined || !TOURNAMENT_TIER_SCOPES.has(f.scope)) return f;
    cleared.push(f.key);
    const { scope: _drop, ...rest } = f;
    return rest;
  });
  if (cleared.length > 0) store(next);
  return cleared;
}

// Bring stored follows' artwork up to date from freshly fetched
// directory rows (domain/followArt.ts explains the rules, including why
// an absence can clear a crest). Returns true when anything changed, so
// a screen can repaint without a needless render on every fetch.
export function hydrateFollowArt(rows: readonly ArtRow[]): boolean {
  const { next, changed } = applyArtHydration(loadFollowables(), rows);
  if (changed) store(next);
  return changed;
}

// Whole-store replacement for launch-time normalizers
// (data/followMigrations.ts) — the ONE writer besides setFollowed, so
// the storage key never leaks out of this module.
export function replaceFollowables(next: Followable[]): void {
  store(next);
}

// Attach lazily-resolved venue art to an existing follow. No-op if the
// follow has gone (unfollowed while resolving).
export function setFollowed(item: Followable, followed: boolean): Followable[] {
  const current = loadFollowables().filter((f) => f.key !== item.key);
  const next = followed ? [...current, item] : current;
  store(next);
  return next;
}
