// MMA fighters — PURE (Round 6 item 5, owner ruling 2026-09-02).
//
// No MMA body publishes a roster, so the fighter directory is DERIVED
// from the cards we already hold: every participant of an upcoming card,
// unique by FOLDED NAME (the one discipline that stops "Jon Jones" and
// "Jon Jones " being two people), grouped by promotion. A fighter follow
// is the folded-name key stamped onto the CARD fixture (MMA has no
// appearance docs), and the same key names the directory card, so the
// follow reaches the fixture through the ordinary query path. Marks come
// from the standing photo pipeline on the client (by name); the treatment
// floor is the generated monogram. The poll path of the promotion rides
// on the card so a fighter-only follower still keeps that source warm.

export interface MmaFixtureLike {
  id: string;
  sport: string;
  competition: string;
  competitionId: string;
  title: string;
  startUtc: string;
  status: string;
  followKeys: string[];
  homeTeam?: string;
  awayTeam?: string;
}

export const MMA_SPORT = 'ufc';
export const MMA_KEY_PREFIX = 'mma-';

// Lower-case, diacritics stripped, one hyphen between alphanumeric runs.
export function foldMmaName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function mmaFighterKey(name: string): string | null {
  const fold = foldMmaName(name);
  // A single token is not a person we can name safely ("TBA", "Winner").
  if (!fold || !fold.includes('-')) return null;
  return `${MMA_KEY_PREFIX}${fold}`;
}

// Stamp both participants' keys onto an MMA card. Idempotent; other
// sports pass through untouched.
export function stampMmaFighterKeys<T extends MmaFixtureLike>(fixtures: readonly T[]): T[] {
  return fixtures.map((f) => {
    if (f.sport !== MMA_SPORT) return f;
    const keys = [f.homeTeam, f.awayTeam]
      .map((n) => (n ? mmaFighterKey(n) : null))
      .filter((k): k is string => k !== null && !f.followKeys.includes(k));
    return keys.length === 0 ? f : { ...f, followKeys: [...f.followKeys, ...keys] };
  });
}

// ─── The roster join (Round 7 item 1, owner ruling 2026-09-03) ────────
//
// The UFC roster (providers/ufcRoster.ts, from Wikipedia's "List of
// current UFC fighters", refreshed quarterly) lives in the canonical
// `athletes` collection, so a roster fighter's follow key is the
// canonical athlete id — the same convention every other directory
// uses, and what makes the roster searchable through global search. A
// card names its fighters as text, so at ingest each side is matched
// against the directory with the standing surname discipline
// (athletes.ts::matchAthlete: a full name, unique in the sport, or
// nothing) and the athlete id is stamped beside the folded-name key.
// Both keys deliver the card; the folded-name key stays for fighters
// the roster does not carry (other promotions, new signings).

export interface MmaAthleteLike {
  id: string;
  displayName: string;
  sport: string;
  countryCode?: string;
  accentHue?: number;
  groupingKey?: string;
  grouping?: string;
}

export interface MmaNameMatcher {
  // The directory's own matcher: null unless the name resolves to
  // exactly one MMA athlete.
  match: (name: string) => MmaAthleteLike | null;
}

export function stampMmaAthleteIds<T extends MmaFixtureLike>(
  fixtures: readonly T[],
  matcher: MmaNameMatcher,
): T[] {
  return fixtures.map((f) => {
    if (f.sport !== MMA_SPORT) return f;
    const ids = [f.homeTeam, f.awayTeam]
      .map((n) => (n ? matcher.match(n) : null))
      .filter((a): a is MmaAthleteLike => a !== null)
      .map((a) => a.id)
      .filter((id) => !f.followKeys.includes(id));
    return ids.length === 0 ? f : { ...f, followKeys: [...f.followKeys, ...ids] };
  });
}

export interface MmaFighterCard {
  key: string;
  name: string;
  sportKey: 'ufc';
  grouping: string; // the promotion
  nextStartUtc: string;
  pollPath?: string;
  accentHue: number;
}

export interface MmaBrowse {
  groups: Array<{ grouping: string; groupingKey: string; athletes: MmaFighterCard[] }>;
  competingSoon: MmaFighterCard[];
}

// The derived directory: fighters on cards that have not started (or are
// under way), one card per folded name, grouped by promotion, promotions
// ordered by their soonest card, fighters by their next card then name.
export function deriveMmaBrowse(
  fixtures: readonly MmaFixtureLike[],
  nowIso: string,
  pollPathOf: (f: MmaFixtureLike) => string | undefined,
  accentHueOf: (key: string) => number,
): MmaBrowse {
  const byKey = new Map<string, MmaFighterCard>();
  for (const f of fixtures) {
    if (f.sport !== MMA_SPORT || f.status === 'cancelled') continue;
    if (f.startUtc < nowIso) continue;
    for (const name of [f.homeTeam, f.awayTeam]) {
      if (!name) continue;
      const key = mmaFighterKey(name);
      if (!key) continue;
      const existing = byKey.get(key);
      if (existing && existing.nextStartUtc <= f.startUtc) continue;
      const pollPath = pollPathOf(f);
      byKey.set(key, {
        key,
        name: name.trim(),
        sportKey: 'ufc',
        grouping: f.competition,
        nextStartUtc: f.startUtc,
        ...(pollPath ? { pollPath } : {}),
        accentHue: accentHueOf(key),
      });
    }
  }
  const groups = new Map<string, MmaFighterCard[]>();
  for (const card of byKey.values()) {
    const list = groups.get(card.grouping) ?? [];
    list.push(card);
    groups.set(card.grouping, list);
  }
  const shaped = [...groups.entries()]
    .map(([grouping, athletes]) => ({
      grouping,
      groupingKey: `mma-${foldMmaName(grouping)}`,
      athletes: athletes.sort(
        (a, b) => a.nextStartUtc.localeCompare(b.nextStartUtc) || a.name.localeCompare(b.name),
      ),
    }))
    .sort((a, b) => a.athletes[0].nextStartUtc.localeCompare(b.athletes[0].nextStartUtc));
  const soonCutoff = new Date(Date.parse(nowIso) + 14 * 86_400_000).toISOString();
  const competingSoon = [...byKey.values()]
    .filter((c) => c.nextStartUtc <= soonCutoff)
    .sort((a, b) => a.nextStartUtc.localeCompare(b.nextStartUtc) || a.name.localeCompare(b.name));
  return { groups: shaped, competingSoon };
}

// ─── Roster ∪ cards: the served directory (Round 7 item 1) ────────────
//
// The ROSTER owns the UFC: its division groups (Heavyweight →
// Strawweight, men then women) replace the card-derived "UFC" promotion
// group, and a card-derived fighter who IS a roster athlete is served
// under the athlete's own key and name — never twice. Fighters the
// roster does not carry keep their card-derived cards: the other
// promotions' groups whole, and any UFC-card name the wiki has not
// caught up with under "UFC — on announced cards". "Competing soon" is
// card-derived by construction (the roster knows nobody's next card),
// re-keyed to the roster identity where one exists.

export interface MmaBrowseGroup<T> {
  grouping: string;
  groupingKey: string;
  athletes: T[];
}

export interface MergedMmaCard {
  key: string;
  name: string;
  sportKey: string; // 'ufc' — the directory's AthleteCard shape, which is string-typed
  grouping?: string;
  nextStartUtc?: string;
  pollPath?: string;
  accentHue: number;
  countryCode?: string;
  championOf?: string[];
  rank?: number;
}

export const UFC_PROMOTION = 'UFC';
export const UFC_UNLISTED_GROUP_KEY = 'mma-ufc-unlisted';
export const UFC_UNLISTED_GROUP = 'UFC — on announced cards';

export function mergeMmaBrowse(
  roster: { groups: Array<MmaBrowseGroup<MergedMmaCard>>; competingSoon: MergedMmaCard[] },
  derived: MmaBrowse,
  matcher: MmaNameMatcher,
  accentHueOf: (key: string) => number,
): { groups: Array<MmaBrowseGroup<MergedMmaCard>>; competingSoon: MergedMmaCard[] } {
  const rosterOf = (c: MmaFighterCard): MergedMmaCard | null => {
    const a = matcher.match(c.name);
    if (!a) return null;
    return {
      key: a.id,
      name: a.displayName,
      sportKey: 'ufc',
      accentHue: a.accentHue ?? accentHueOf(a.id),
      nextStartUtc: c.nextStartUtc,
      ...(a.grouping ? { grouping: a.grouping } : {}),
      ...(a.countryCode ? { countryCode: a.countryCode } : {}),
      ...(c.pollPath ? { pollPath: c.pollPath } : {}),
    };
  };
  const asMerged = (c: MmaFighterCard): MergedMmaCard => ({
    key: c.key,
    name: c.name,
    sportKey: 'ufc',
    grouping: c.grouping,
    nextStartUtc: c.nextStartUtc,
    accentHue: c.accentHue,
    ...(c.pollPath ? { pollPath: c.pollPath } : {}),
  });
  const groups: Array<MmaBrowseGroup<MergedMmaCard>> = [...roster.groups];
  for (const g of derived.groups) {
    if (g.grouping === UFC_PROMOTION) {
      const unlisted = g.athletes.filter((c) => rosterOf(c) === null).map(asMerged);
      if (unlisted.length > 0) {
        groups.push({
          grouping: UFC_UNLISTED_GROUP,
          groupingKey: UFC_UNLISTED_GROUP_KEY,
          athletes: unlisted,
        });
      }
      continue;
    }
    groups.push({ ...g, athletes: g.athletes.map(asMerged) });
  }
  const seen = new Set<string>();
  const competingSoon: MergedMmaCard[] = [];
  for (const c of derived.competingSoon) {
    const card = rosterOf(c) ?? asMerged(c);
    if (seen.has(card.key)) continue;
    seen.add(card.key);
    competingSoon.push(card);
  }
  return { groups, competingSoon };
}
