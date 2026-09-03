// Group nodes in the Following strip — PURE (Round 6 item 6, reshaped by
// the owner 2026-09-03; Olympics only for now, built to take other
// groups later).
//
// Followed Olympic sports collapse under one "Summer Olympics" /
// "Winter Olympics" node whose icon is a MEDAL in the emoji-tile style
// (never the rings — statute) with the COUNT of followed sports
// bottom-right. The node does not expand in place (the in-strip spread
// was tried and withdrawn): tapping it opens the season's own following
// page, which lists the followed sports and opens each sport's fixtures.
// The strip renders whatever items it is given, per copy.

export interface RailGroupInput {
  key: string;
  label: string;
  caption: string;
  glyph: string;
  startUtc: string | null; // the item's next fixture, for the node caption
}

export interface GroupNode<T> {
  kind: 'group';
  key: string; // 'olympics:summer' | 'olympics:winter'
  season: OlympicSeason;
  label: string;
  caption: string;
  glyph: string; // 🏅 — the medal, never the rings
  members: T[]; // the followed sports, soonest first
}

export type OlympicSeason = 'summer' | 'winter';

const OLYMPIC_SPORT_KEY = /^olympics-(\d{4})-[a-z0-9-]+$/;

// Season from the edition year: Summer Games fall in leap years
// (2028, 2032 …), Winter Games two years off (2026, 2030 …).
export function olympicSeasonOf(key: string): OlympicSeason | null {
  const m = OLYMPIC_SPORT_KEY.exec(key);
  if (!m) return null;
  return Number(m[1]) % 4 === 0 ? 'summer' : 'winter';
}

export const GROUP_KEY_PREFIX = 'olympics:';

export function isGroupKey(key: string): boolean {
  return key.startsWith(GROUP_KEY_PREFIX);
}

export function groupSeasonOf(key: string): OlympicSeason | null {
  if (!isGroupKey(key)) return null;
  const s = key.slice(GROUP_KEY_PREFIX.length);
  return s === 'summer' || s === 'winter' ? s : null;
}

// Collapse the Olympic sport items into per-season nodes, in the position
// of the first member; every other item passes through untouched. The
// node's caption is its soonest member's; its members keep the order
// they arrived in (soonest first).
export function groupOlympicItems<T extends RailGroupInput>(
  items: readonly T[],
  labels: Readonly<Record<OlympicSeason, string>>,
  nothingScheduled: string,
): Array<T | GroupNode<T>> {
  const out: Array<T | GroupNode<T>> = [];
  const nodes = new Map<OlympicSeason, GroupNode<T>>();
  for (const item of items) {
    const season = olympicSeasonOf(item.key);
    if (!season) {
      out.push(item);
      continue;
    }
    let node = nodes.get(season);
    if (!node) {
      node = {
        kind: 'group',
        key: `${GROUP_KEY_PREFIX}${season}`,
        season,
        label: labels[season],
        caption: nothingScheduled,
        glyph: '🏅',
        members: [],
      };
      nodes.set(season, node);
      out.push(node);
    }
    node.members.push(item);
  }
  for (const node of nodes.values()) {
    const soonest = node.members
      .filter((m) => m.startUtc !== null)
      .sort((a, b) => (a.startUtc as string).localeCompare(b.startUtc as string))[0];
    node.caption = soonest ? soonest.caption : nothingScheduled;
  }
  return out;
}
