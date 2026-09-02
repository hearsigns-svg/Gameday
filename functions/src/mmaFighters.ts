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
