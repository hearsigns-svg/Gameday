// UFC roster — Wikipedia's "List of current UFC fighters" (Round 7
// item 1, owner ruling 2026-09-03).
//
// No MMA body publishes a machine-readable roster (ufc.com is
// structured-data-free — the Round 6 finding), so the derived directory
// named one fighter. Wikipedia's list is the one maintained roster in
// the open: every contracted fighter, per division, updated by editors
// within days of a signing or release. It is read through the
// MediaWiki API (`action=parse&prop=wikitext`), which the Wikimedia
// terms permit for a descriptive User-Agent — the same posture as the
// Wikidata/Commons clients this codebase already runs. Names are facts;
// nothing else on the page is copied.
//
// CADENCE: quarterly, by ruling — the refreshRosters loop skips the
// slice while its last success is younger than UFC_ROSTER_CADENCE_DAYS.
//
// IDENTITY: a linked fighter (`{{sortname|First|Last}}`,
// `[[Article|Name]]`) carries the article title as the wikipedia
// externalId — stable across renames of the display form; an unlinked
// fighter is name-keyed, and the record says so (`externalId: null`),
// exactly as the IBF's name-only roster does. Country from
// `{{flagicon|XXX}}` where it is a three-letter code (the nationality
// table accepts IOC and ISO alpha-3 spellings); a spelled-out country
// ("Myanmar") is dropped rather than guessed.
//
// ALL-OR-NOTHING: a page whose division sections cannot all be found,
// or whose total falls under the floor, throws — absence accounting
// must never run against a half-parsed roster.

import { RosterEntry } from '../athletes';
import { normaliseName } from '../identity';

const PAGE = 'List_of_current_UFC_fighters';
export const UFC_ROSTER_URL = `https://en.wikipedia.org/w/api.php?action=parse&page=${PAGE}&prop=wikitext&format=json&formatversion=2`;

export const USER_AGENT =
  'KickOffCal/1.0 (+https://kickoffcal.app; calendar sync; contact hearsigns@gmail.com)';

export const UFC_ROSTER_CADENCE_DAYS = 90;
// A full roster is ~600 fighters across eleven divisions; the floor
// catches a gutted or half-rendered page without being brittle about
// week-to-week movement.
export const UFC_ROSTER_MIN_ENTRIES = 300;
export const UFC_DIVISION_MIN_ROWS = 8;

export const UFC_SOURCE = 'wikipedia';

interface Division {
  heading: RegExp; // the level-3 section heading, sans limits
  slug: string;
  label: string;
  female: boolean;
}

// Heavy → light, men then women — the order every MMA fan knows and
// the one search.ts::groupOrderKey serves.
export const UFC_DIVISIONS: readonly Division[] = [
  { heading: /^Heavyweights\b/, slug: 'heavyweight', label: 'Heavyweight', female: false },
  { heading: /^Light heavyweights\b/, slug: 'light-heavyweight', label: 'Light Heavyweight', female: false },
  { heading: /^Middleweights\b/, slug: 'middleweight', label: 'Middleweight', female: false },
  { heading: /^Welterweights\b/, slug: 'welterweight', label: 'Welterweight', female: false },
  { heading: /^Lightweights\b/, slug: 'lightweight', label: 'Lightweight', female: false },
  { heading: /^Featherweights\b/, slug: 'featherweight', label: 'Featherweight', female: false },
  { heading: /^Bantamweights\b/, slug: 'bantamweight', label: 'Bantamweight', female: false },
  { heading: /^Flyweights\b/, slug: 'flyweight', label: 'Flyweight', female: false },
  { heading: /^Women's bantamweights\b/, slug: 'bantamweight', label: "Women's Bantamweight", female: true },
  { heading: /^Women's flyweights\b/, slug: 'flyweight', label: "Women's Flyweight", female: true },
  { heading: /^Women's strawweights\b/, slug: 'strawweight', label: "Women's Strawweight", female: true },
];

export function ufcGroupingKey(d: { slug: string; female: boolean }): string {
  return d.female ? `mma-w-${d.slug}` : `mma-${d.slug}`;
}

// ─── Wikitext helpers — PURE ──────────────────────────────────────────

// Level-2/3 sections: heading text → body. Trailing HTML comments on a
// heading line ("<!--If you wish to add a fighter…") are stripped; the
// weight limits in parentheses are left for the division regex to skip.
export function sectionsOf(wikitext: string): Array<{ heading: string; body: string }> {
  const out: Array<{ heading: string; body: string }> = [];
  const re = /^(={2,3})\s*(.+?)\s*\1[^\n]*$/gm;
  let m: RegExpExecArray | null;
  const marks: Array<{ heading: string; start: number; end: number }> = [];
  while ((m = re.exec(wikitext)) !== null) {
    marks.push({ heading: m[2].replace(/<!--.*$/, '').trim(), start: m.index, end: m.index + m[0].length });
  }
  marks.forEach((mk, i) => {
    const next = marks[i + 1];
    out.push({ heading: mk.heading, body: wikitext.slice(mk.end, next ? next.start : wikitext.length) });
  });
  return out;
}

// The rows of the FIRST wikitable in a body: each row as its cells
// (lines beginning with `|`, `||`-split), header lines (`!`) ignored.
// Multi-line cells (a <ref> spanning lines) contribute their first line
// only — the name and flag cells are single-line by construction.
export function tableRows(body: string): string[][] {
  const start = body.indexOf('{|');
  if (start < 0) return [];
  const end = body.indexOf('\n|}', start);
  const table = body.slice(start, end < 0 ? body.length : end);
  const rows = table.split(/^\|-.*$/m).slice(1);
  return rows
    .map((row) =>
      row
        .split('\n')
        .filter((line) => line.startsWith('|') && !line.startsWith('|}'))
        .flatMap((line) => line.slice(1).split('||'))
        .map((cell) => cell.trim()),
    )
    .filter((cells) => cells.length > 0);
}

const stripMarkup = (s: string): string =>
  s
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/'{2,}/g, '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export interface ParsedName {
  name: string;
  article: string | null; // the linked Wikipedia article, when linked
}

// One name cell → display name + article. Handles the three shapes the
// page uses: {{sortname|First|Last[|Article]}}, [[Article|Display]] /
// [[Name]], and plain text for unlinked fighters. `nolink` and dab=
// forms of sortname are treated as unlinked/linked respectively as the
// template itself does.
export function parseNameCell(cell: string): ParsedName | null {
  const sort = /\{\{\s*sortname\s*\|([^|}]*)\|([^|}]*)(?:\|([^}]*))?\}\}/i.exec(cell);
  if (sort) {
    const first = sort[1].trim();
    const last = sort[2].trim();
    const name = `${first} ${last}`.trim();
    if (!name) return null;
    const extra = (sort[3] ?? '').trim();
    let article: string | null = name;
    if (extra) {
      const named = /^(\w+)=(.*)$/.exec(extra);
      if (named) {
        if (named[1] === 'nolink') article = null;
        else if (named[1] === 'dab') article = `${name} (${named[2].trim()})`;
      } else if (/^nolink$/i.test(extra)) {
        article = null;
      } else {
        article = extra.split('|')[0].trim() || name;
      }
    }
    return { name, article };
  }
  const link = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(cell);
  if (link) {
    const article = link[1].trim();
    const display = (link[2] ?? link[1]).trim();
    const name = stripMarkup(display);
    return name ? { name, article } : null;
  }
  const plain = stripMarkup(cell);
  return plain ? { name: plain, article: null } : null;
}

export function parseFlagCell(cell: string): string | undefined {
  const m = /\{\{\s*flagicon\s*\|\s*([^|}]+?)\s*(?:\|[^}]*)?\}\}/i.exec(cell);
  const code = m?.[1]?.trim();
  return code && /^[A-Z]{3}$/.test(code) ? code : undefined;
}

// A division table row → an entry, or nothing for a row that names
// nobody (a stray header, a blank line).
function rowToEntry(cells: readonly string[], d: Division): RosterEntry | null {
  if (cells.length < 2) return null;
  const parsed = parseNameCell(cells[1]);
  if (!parsed) return null;
  const countryCode = parseFlagCell(cells[0]);
  return {
    source: UFC_SOURCE,
    externalId: parsed.article,
    name: parsed.name,
    sport: 'ufc',
    grouping: d.label,
    groupingKey: ufcGroupingKey(d),
    ...(countryCode ? { countryCode } : {}),
  };
}

// The champions table ("Current champions, weight classes and status"):
// the champion cell follows the gender cell (`M` / `W`) in each row.
// Returns the champions' display names; a vacant title has no link and
// contributes nothing.
export function parseChampions(wikitext: string): string[] {
  const section = sectionsOf(wikitext).find((s) => /^Current champions/i.test(s.heading));
  if (!section) return [];
  const out: string[] = [];
  for (const cells of tableRows(section.body)) {
    const gender = cells.findIndex((c) => /^(?:style="[^"]*"\s*\|\s*)?[MW]$/.test(c.replace(/\s+/g, ' ').trim()));
    if (gender < 0 || gender + 1 >= cells.length) continue;
    const parsed = parseNameCell(cells[gender + 1]);
    if (parsed && !/vacant/i.test(parsed.name)) out.push(parsed.name);
  }
  return out;
}

// Merge duplicate people within a division (the page lists a fighter
// once per division, but a template variant can render twice); union
// championOf like the IBF merge.
export function mergeEntries(entries: readonly RosterEntry[]): RosterEntry[] {
  const byKey = new Map<string, RosterEntry>();
  for (const e of entries) {
    const key = `${e.groupingKey}|${normaliseName(e.name)}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...e });
      continue;
    }
    const orgs = [...new Set([...(prev.championOf ?? []), ...(e.championOf ?? [])])];
    byKey.set(key, {
      ...prev,
      ...(prev.externalId === null && e.externalId ? { externalId: e.externalId } : {}),
      ...(orgs.length > 0 ? { championOf: orgs } : {}),
    });
  }
  return [...byKey.values()];
}

export function rosterFromWikitext(wikitext: string): {
  entries: RosterEntry[];
  divisions: Record<string, number>;
} {
  const sections = sectionsOf(wikitext);
  const champions = new Set(parseChampions(wikitext).map(normaliseName));
  const entries: RosterEntry[] = [];
  const divisions: Record<string, number> = {};
  for (const d of UFC_DIVISIONS) {
    const section = sections.find((s) => d.heading.test(s.heading));
    if (!section) throw new Error(`ufc roster: division section missing: ${d.label}`);
    const rows = tableRows(section.body)
      .map((cells) => rowToEntry(cells, d))
      .filter((e): e is RosterEntry => e !== null)
      .map((e) => (champions.has(normaliseName(e.name)) ? { ...e, championOf: ['UFC'] } : e));
    if (rows.length < UFC_DIVISION_MIN_ROWS) {
      throw new Error(`ufc roster: ${d.label} parsed ${rows.length} rows — page shape changed?`);
    }
    divisions[ufcGroupingKey(d)] = rows.length;
    entries.push(...rows);
  }
  const merged = mergeEntries(entries);
  if (merged.length < UFC_ROSTER_MIN_ENTRIES) {
    throw new Error(`ufc roster: ${merged.length} fighters is under the ${UFC_ROSTER_MIN_ENTRIES} floor`);
  }
  return { entries: merged, divisions };
}

// ─── I/O ──────────────────────────────────────────────────────────────

export async function fetchUfcRoster(): Promise<{ rawCount: number; entries: RosterEntry[] }> {
  const res = await fetch(UFC_ROSTER_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`wikipedia http ${res.status}`);
  const body = (await res.json()) as { parse?: { wikitext?: unknown } };
  const wikitext = body.parse?.wikitext;
  if (typeof wikitext !== 'string' || wikitext.length < 10_000) {
    // A login page, an error object or a stub must never read as "the
    // UFC has no fighters".
    throw new Error('wikipedia: response carries no roster wikitext');
  }
  const { entries, divisions } = rosterFromWikitext(wikitext);
  return { rawCount: Object.keys(divisions).length, entries };
}
