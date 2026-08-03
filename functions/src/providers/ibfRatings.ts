// IBF championship ratings — the boxing roster source.
//
// The four sanctioning bodies were probed individually (2026-08-03):
//   WBC  — robots.txt names ClaudeBot with `Disallow: /`. EXCLUDED, the
//          atptour/MVP class: an explicit refusal, never revisited.
//   WBA  — robots permits, but ratings exist ONLY as HTML tables (the
//          wp-json REST API answers 401). HTML-soup: declined by
//          standing rule, not built.
//   WBO  — robots permits; champions pages are HTML lists, wp-json 401.
//          Same answer.
//   IBF  — robots permits (Crawl-delay: 10, honoured), and the ratings
//          page is fed by the site's OWN JSON API:
//          /wp-json/ratings/v1/filter?weight=<class>&org=<org>
//          Internal JSON — the api.wtatennis.com class, not HTML.
//
// So the boxing directory is built from the IBF's published data. One
// endpoint carries, per weight class: the IBF champion, the IBF top 15,
// AND the WBA/WBC/WBO champions as the IBF's own published fields — so
// champions across all four bodies come from one permitted creator
// without touching the refused host. The IBF publishes NAMES ONLY (no
// fighter ids), so every boxing roster athlete is name-keyed and the
// record says so (`nameKeyed`, `externalId: null`) — that limitation is
// explicit, exactly as the brief requires.
//
// ALL-OR-NOTHING: any class fetch failing fails the whole run — absence
// accounting (missedRefreshes → inactive) must never run against a
// half-fetched roster.

import { RosterEntry } from '../athletes';
import { normaliseName } from '../identity';

const BASE = 'https://www.ibf-usba-boxing.com/wp-json/ratings/v1/filter';

export const USER_AGENT =
  'KickOffCal/1.0 (+https://kickoffcal.app; calendar sync; contact hearsigns@gmail.com)';

// The site publishes Crawl-delay: 10; honoured literally between
// requests, same as PBC's.
export const IBF_CRAWL_DELAY_MS = 10_000;

// The weight classes the IBF's own filter offers, minus the exclusions
// its own page script encodes (ratings-filter.js, captured 2026-08-03):
// IBF male excludes jr-mini-flyweight; female excludes heavyweight and
// cruiserweight.
export const IBF_MALE_CLASSES = [
  'heavyweight',
  'cruiserweight',
  'light-heavyweight',
  'super-middleweight',
  'middleweight',
  'jr-middleweight',
  'welterweight',
  'jr-welterweight',
  'lightweight',
  'jr-lightweight',
  'featherweight',
  'jr-featherweight',
  'bantamweight',
  'jr-bantamweight',
  'flyweight',
  'jr-flyweight',
  'mini-flyweight',
];
export const IBF_FEMALE_CLASSES = [
  'light-heavyweight',
  'super-middleweight',
  'middleweight',
  'jr-middleweight',
  'welterweight',
  'jr-welterweight',
  'lightweight',
  'jr-lightweight',
  'featherweight',
  'jr-featherweight',
  'bantamweight',
  'jr-bantamweight',
  'flyweight',
  'jr-flyweight',
  'mini-flyweight',
  'jr-mini-flyweight',
];

const classLabel = (slug: string, female: boolean): string => {
  const base = slug
    .split('-')
    .map((w) => (w === 'jr' ? 'Jr' : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
  return female ? `Women's ${base}` : base;
};

interface IbfRatingRow {
  ratings?: string;
  champ?: string;
  interim_champ?: string;
  wba?: string;
  wbc?: string;
  wbo?: string;
  wc?: string;
}

// "Liam Paro,Australia (AUS),;06/22/2026;;;" → the fighter segment is
// everything before the first ';'. Within it: name, country, state.
// "(AUS)" → countryCode AUS.
function parsePerson(
  segment: string | undefined,
): { name: string; countryCode?: string } | null {
  if (!segment) return null;
  const fields = segment.split(',');
  const name = fields[0]?.trim();
  if (!name || /vacant/i.test(name)) return null;
  const cc = /\(([A-Z]{2,3})\)/.exec(fields[1] ?? '')?.[1];
  return { name, ...(cc ? { countryCode: cc } : {}) };
}

export const IBF_RATING_DEPTH = 15;

// One class payload → entries. Champion first (the browse structure
// users already understand), then the rated 1..15 with unfilled
// positions skipped — "NOT RATED" is a hole in the list, not a fighter.
export function classToEntries(
  row: IbfRatingRow,
  classSlug: string,
  female: boolean,
): RosterEntry[] {
  const grouping = classLabel(classSlug, female);
  const groupingKey = female ? `boxing-w-${classSlug}` : `boxing-${classSlug}`;
  const base = {
    source: 'ibf',
    externalId: null,
    sport: 'boxing',
    grouping,
    groupingKey,
  };
  const out: RosterEntry[] = [];
  const champ = parsePerson(row.champ?.split(';')[0]);
  if (champ) out.push({ ...base, ...champ, championOf: ['IBF'] });
  const interim = parsePerson(row.interim_champ?.split(';')[0]);
  if (interim) out.push({ ...base, ...interim, championOf: ['IBF Interim'] });
  for (const org of ['wba', 'wbc', 'wbo'] as const) {
    const p = parsePerson(row[org]);
    if (p) out.push({ ...base, ...p, championOf: [org.toUpperCase()] });
  }
  const slots = (row.ratings ?? '').split(';');
  slots.slice(0, IBF_RATING_DEPTH).forEach((slot, i) => {
    const p = parsePerson(slot);
    if (p) out.push({ ...base, ...p, rank: i + 1 });
  });
  return out;
}

// Merge duplicate people across the emitted entries: the same fighter
// appears as champion of two bodies (Usyk holds WBA and WBC at
// heavyweight), or as champion in one class and rated in another.
// Names are all the IBF publishes, so the merge key is the normalised
// name WITHIN a gender division — a male and a female fighter sharing
// a name are never one person, and the men's/women's lists are
// disjoint, so scoping the key costs nothing and removes that whole
// collision class (review round). The residual same-gender risk is
// what the name-keyed flag declares. championOf unions; the FIRST
// class encountered keeps the grouping (classes iterate heavy →
// light, so a two-division fighter sits with the heavier class); the
// best (lowest) rank wins.
export function mergeEntries(entries: readonly RosterEntry[]): RosterEntry[] {
  const byName = new Map<string, RosterEntry>();
  for (const e of entries) {
    const division = e.groupingKey?.startsWith('boxing-w-') ? 'w' : 'm';
    const key = `${division}|${normaliseName(e.name)}`;
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, { ...e });
      continue;
    }
    const orgs = [
      ...new Set([...(prev.championOf ?? []), ...(e.championOf ?? [])]),
    ];
    byName.set(key, {
      ...prev,
      ...(orgs.length > 0 ? { championOf: orgs } : {}),
      ...(e.rank !== undefined &&
      (prev.rank === undefined || e.rank < prev.rank)
        ? { rank: e.rank }
        : {}),
    });
  }
  return [...byName.values()];
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchIbfRatings(): Promise<{
  rawCount: number;
  entries: RosterEntry[];
}> {
  const jobs: Array<{ slug: string; female: boolean }> = [
    ...IBF_MALE_CLASSES.map((slug) => ({ slug, female: false })),
    ...IBF_FEMALE_CLASSES.map((slug) => ({ slug, female: true })),
  ];
  const collected: RosterEntry[] = [];
  let raw = 0;
  let first = true;
  for (const job of jobs) {
    if (!first) await wait(IBF_CRAWL_DELAY_MS);
    first = false;
    const org = job.female ? 'ibf-female' : 'ibf';
    const res = await fetch(`${BASE}?weight=${job.slug}&org=${org}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) {
      throw new Error(`ibf http ${res.status} for ${org}/${job.slug}`);
    }
    const body = (await res.json()) as IbfRatingRow[] | null;
    if (!Array.isArray(body)) {
      throw new Error(`ibf: non-array body for ${org}/${job.slug}`);
    }
    // The class list is CURATED from the site's own filter script —
    // every class on it has a published sheet. An empty [] for one is
    // therefore param/filter rot, not a documented empty, and letting
    // it pass would run absence accounting against a half-fetched
    // roster: fighters in the broken classes would go inactive within
    // two refreshes (review round). All-or-nothing means empty throws
    // too; the roster keeps its last state, and the error names the
    // class.
    if (body.length === 0) {
      throw new Error(`ibf: empty ratings body for ${org}/${job.slug}`);
    }
    raw++;
    collected.push(...classToEntries(body[0], job.slug, job.female));
  }
  return { rawCount: raw, entries: mergeEntries(collected) };
}
