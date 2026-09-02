// Group nodes in the Following strip — PURE (Round 6 item 6; Olympics
// only for now, built to take other groups later).
//
// Followed Olympic sports collapse under one "Summer Olympics" /
// "Winter Olympics" node whose icon is a MEDAL in the emoji-tile style
// (never the rings — statute). Tapping the node expands it in place into
// the followed sports' emoji-style icons, the node icon becoming the
// expand/collapse toggle; tapping a sport icon opens that sport's
// following fixtures (the caller's ordinary press). The strip renders
// whatever items it is given, per copy, so an expansion travels with the
// drift and the wrap for free.

export interface RailGroupInput {
  key: string;
  label: string;
  caption: string;
  glyph: string;
  startUtc: string | null; // the item's next fixture, for the node caption
}

export interface RailGroupOutput<T extends RailGroupInput> {
  items: Array<T | GroupNode<T>>;
}

export interface GroupNode<T> {
  kind: 'group';
  key: string; // 'olympics:summer' | 'olympics:winter'
  label: string;
  caption: string;
  glyph: string; // 🏅 — the medal, never the rings
  expanded: boolean;
  members: T[];
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
// of the first member; every other item passes through untouched. An
// expanded node is followed by its members (the sport icons).
export function groupOlympicItems<T extends RailGroupInput>(
  items: readonly T[],
  expanded: Readonly<Record<OlympicSeason, boolean>>,
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
        label: labels[season],
        caption: nothingScheduled,
        glyph: '🏅',
        expanded: expanded[season],
        members: [],
      };
      nodes.set(season, node);
      out.push(node);
    }
    node.members.push(item);
  }
  // The node's caption is its soonest member's; members follow their node
  // when it is expanded, in the order they arrived (soonest first).
  const result: Array<T | GroupNode<T>> = [];
  for (const entry of out) {
    if ((entry as GroupNode<T>).kind !== 'group') {
      result.push(entry);
      continue;
    }
    const node = entry as GroupNode<T>;
    const soonest = node.members
      .filter((m) => m.startUtc !== null)
      .sort((a, b) => (a.startUtc as string).localeCompare(b.startUtc as string))[0];
    node.caption = soonest ? soonest.caption : nothingScheduled;
    result.push(node);
    if (node.expanded) result.push(...node.members);
  }
  return result;
}
