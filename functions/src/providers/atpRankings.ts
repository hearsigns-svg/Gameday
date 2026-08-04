// The live ATP singles ranking — the men's roster source.
//
// WHY THIS EXISTS. Men's tennis had no live ranking, so the men's browse
// group was a curated constant of world No. 1s: 25 of the 29 retired,
// sorted alphabetically because none of them carried a rank. In an app
// about upcoming events that opened the men's section on Agassi and
// Borg. A ranking fixes it at the root, and it is not a proxy for
// "active" — ATP points are a ROLLING 52-WEEK WINDOW, so being ranked
// IS having played in the last year, which is exactly the rule the
// owner asked for (2026-08-04).
//
// SOURCE, and why it is allowed. en.wikipedia.org via the MediaWiki
// Action API, already approved as a documented programmatic service
// alongside WDQS (DECISIONS, 2026-08-03). Wikipedia is an INDEPENDENT
// PUBLISHER under CC BY-SA; the ranking table it maintains cites
// atptour.com as its reference, and per the citation nuance recorded
// with that ruling a citation is METADATA, NOT A FETCH — we never
// follow it, and this connector makes zero requests to anything the
// ATP operates. atptour.com stays permanently excluded.
//
// DEPTH IS 20, NOT 200 — verified, and stated rather than papered over.
// The owner asked for the top 200 of both tours. The WTA's own API
// serves 200; the Wikipedia table carries the top 20 only (measured
// 2026-08-04: 20 numbered rows). That is the honest ceiling of this
// source. Deeper men's coverage needs a different publisher, and the
// gap is recorded in PLAN.md rather than hidden behind a cap constant.

import { groupTitleOf, RosterEntry } from '../athletes';

export const USER_AGENT =
  'KickOffCal/1.0 (+https://kickoffcal.app; calendar sync; contact hearsigns@gmail.com)';

const API = 'https://en.wikipedia.org/w/api.php';

// The rankings live on one page and are transcluded into `ATP rankings`
// by section label — read the page that holds them, not the one that
// displays them, so a layout change upstream cannot silently empty us.
export const RANKINGS_PAGE = 'Current tennis rankings';
export const ATP_SECTION = 'ATP singles ranking';

// EXACTLY twenty. This is the most fragile source in the system — every
// other one is a machine feed from an organisation with an interest in
// its own correctness, and this is a volunteer-maintained wiki table
// that can go stale, be vandalised, be reformatted or be moved, none of
// which looks like a failure. So the size is an EXPECTATION, not a
// band: if the editors deepen the table (welcome), that is a deliberate
// one-line change here plus its contract test, exactly like the
// 29-No.-1s constant. A silent size change is the failure mode.
export const EXPECTED_ROWS = 20;

// CHURN GATE. Justified from the ranking's own mechanics rather than
// from observed weeks, because the mechanics are the stronger argument:
// ATP points roll over a 52-WEEK WINDOW, so a single refresh can only
// move whatever one week's results add and one week's year-old results
// subtract. To leave a 20-deep list you must shed more points in that
// one week than the gap to #20 — which happens to a handful of players
// after a slam or a Masters, and to almost nobody otherwise. Six
// changes in one week is already an extraordinary week; twenty is not a
// week, it is a different table. So: at least 14 of the previous 20
// must still be present.
//
// This is a CORRUPTION gate, not a churn detector. It is sized to catch
// the failures that actually threaten us — the WTA table parsed as the
// men's, the doubles table, a mass revert, a reformat that shifts every
// cell — while leaving real movement far more headroom than it needs.
export const MIN_CARRY_OVER = 14;

// The table is edited weekly. A date that has not advanced in three
// weeks means nobody is maintaining it, and we would be serving a
// decaying ranking under a live-sounding heading.
export const STALE_AFTER_DAYS = 21;

export interface AtpRankRow {
  rank: number;
  name: string;
  countryCode?: string;
}

export interface AtpRankingTable {
  rows: AtpRankRow[];
  asOf?: string; // ISO date the table states for itself
}

// `{{As of|2026|8|3|df=UK|lc=y}}` — the table's own claim about when it
// was current. Absent is tolerated (the heading is editor-maintained);
// a malformed one is not silently coerced.
export function parseAsOf(wikitext: string): string | undefined {
  const m = wikitext.match(/\{\{As of\|(\d{4})\|(\d{1,2})\|(\d{1,2})/i);
  if (!m) return undefined;
  const [, y, mo, d] = m;
  const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return Number.isNaN(Date.parse(iso)) ? undefined : iso;
}

// Rows are `|<rank>` then `|{{flagathlete|[[Name]]|CTY}} || points || move`,
// with two real variants in the live table: the No. 1 cell is a piped
// wiki-link (`[[List of ATP…|1]]`) and a player with no flag renders
// `{{noflag}}[[Name]]`. Both are covered; anything else is shape rot.
const ROW = /\|\s*(?:\[\[[^\]]*?\|)?(\d+)\]{0,2}\s*\n\|([^\n]+?)\|\|/g;

export function parseAtpRankings(body: unknown): AtpRankingTable {
  const wikitext = (
    body as { parse?: { wikitext?: { '*'?: unknown } } }
  )?.parse?.wikitext?.['*'];
  if (typeof wikitext !== 'string' || wikitext.length === 0) {
    throw new Error('atp rankings: response missing parse.wikitext');
  }
  const begin = wikitext.indexOf(`<section begin=${ATP_SECTION} />`);
  const end = wikitext.indexOf(`<section end=${ATP_SECTION} />`);
  // The section LABEL is the contract with the publisher. If it moves,
  // fail loudly — silently scanning the whole page would happily parse
  // the WTA table into the men's roster.
  if (begin < 0 || end < 0 || end <= begin) {
    throw new Error(
      `atp rankings: section "${ATP_SECTION}" not found — the page's labels moved`,
    );
  }
  const segment = wikitext.slice(begin, end);
  const rows: AtpRankRow[] = [];
  ROW.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ROW.exec(segment)) !== null) {
    const rank = Number(m[1]);
    const cell = m[2];
    const name = cell.match(/\[\[([^\]|]+)/)?.[1]?.trim();
    const countryCode = cell.match(/\|([A-Z]{3})\}\}/)?.[1];
    if (!Number.isFinite(rank) || !name) {
      throw new Error(
        `atp rankings: unparsable row: ${cell.slice(0, 120)}`,
      );
    }
    rows.push({ rank, name, ...(countryCode ? { countryCode } : {}) });
  }
  if (rows.length === 0) {
    throw new Error('atp rankings: zero rows parsed from the ATP section');
  }
  // PROVE THE ORDERING the slice depends on. Two production incidents
  // in this repo came from a capped fetch over an unproven order (PBC's
  // undated sitemap, World Athletics' descending calendar). Ranks must
  // cover 1..N contiguously with no repeats.
  const seen = new Set<number>();
  for (const r of rows) {
    if (seen.has(r.rank)) {
      throw new Error(`atp rankings: rank ${r.rank} appears twice`);
    }
    seen.add(r.rank);
  }
  for (let r = 1; r <= rows.length; r++) {
    if (!seen.has(r)) {
      throw new Error(`atp rankings: rank ${r} missing — the table is not 1..N`);
    }
  }
  const asOf = parseAsOf(segment);
  return { rows, ...(asOf ? { asOf } : {}) };
}

// Named apart from the Wikidata roster's `atp` extraIdentity namespace
// ON PURPOSE: that one carries a real ATP player id (P536), this table
// publishes NAMES ONLY. Reusing 'atp' would let a null externalId
// overwrite a genuine id in the identity map.
export const ATP_RANK_SOURCE = 'atp-rank';

export function rankingEntries(table: AtpRankingTable): RosterEntry[] {
  if (table.rows.length !== EXPECTED_ROWS) {
    throw new Error(
      `atp rankings: ${table.rows.length} rows, expected exactly ${EXPECTED_ROWS} — table reformatted, truncated or deepened; not applied`,
    );
  }
  return table.rows.map((r) => ({
    source: ATP_RANK_SOURCE,
    externalId: null, // names only — matching resolves against the directory
    name: r.name,
    sport: 'tennis',
    grouping: groupTitleOf('atp')!,
    groupingKey: 'atp',
    rank: r.rank,
    ...(r.countryCode ? { countryCode: r.countryCode } : {}),
  }));
}

// ─── The gates that need the directory ────────────────────────────────
//
// Everything above can be judged from the payload alone. These two need
// to know what we already hold, so they run between the fetch and the
// write — and they THROW, which in refreshRosters means the update is
// not applied and the previous ranking stands untouched. That is the
// rule: A STALE CORRECT LIST BEATS A FRESH CORRUPTED ONE. The failure
// is recorded in this slice's own sourceRuns record, and because the
// staleness marker only advances on a fully-applied refresh, a run of
// failures raises `roster_stale` on its own.
//
// Pure, so every branch is testable without Firestore.

export interface RankingGateContext {
  // Normalised names of the tennis athletes a ranking row may join to.
  // Built from the men's directory — a men's ranking name that only
  // matches a WTA-id-backed woman has NOT resolved.
  resolvableNames: ReadonlySet<string>;
  // Normalised name → rank, from the ranking we are about to replace.
  // Empty on the first ever run, which skips the churn gate.
  previous: ReadonlyMap<string, number>;
}

export function gateRanking(
  entries: readonly RosterEntry[],
  ctx: RankingGateContext,
  normalise: (name: string) => string,
): void {
  // EVERY NAME MUST RESOLVE. An unresolvable name is the signature of
  // vandalism or a reformat, and letting it through would mint a
  // name-keyed junk athlete that then poisons that name for real
  // matching. Note the ordering that makes this survivable: the
  // Wikidata directory refresh runs BEFORE this source in the same
  // pass, so a genuinely new top-20 entrant is imported minutes earlier
  // and resolves normally. A name that fails here is one Wikidata does
  // not know either.
  const unresolved = entries
    .map((e) => e.name)
    .filter((n) => !ctx.resolvableNames.has(normalise(n)));
  if (unresolved.length > 0) {
    throw new Error(
      `atp rankings: ${unresolved.length} name(s) resolve to no directory athlete (${unresolved
        .slice(0, 5)
        .join(', ')}) — keeping the previous ranking`,
    );
  }
  // CHURN. Skipped with no previous ranking to compare against: the
  // first run has nothing to be implausible relative to.
  if (ctx.previous.size === 0) return;
  const now = new Set(entries.map((e) => normalise(e.name)));
  let carried = 0;
  for (const name of ctx.previous.keys()) if (now.has(name)) carried++;
  if (carried < MIN_CARRY_OVER) {
    throw new Error(
      `atp rankings: only ${carried} of the previous ${ctx.previous.size} players remain (min ${MIN_CARRY_OVER}) — this is a different table, not a week's movement; keeping the previous ranking`,
    );
  }
}

export function warnIfStale(asOf: string | undefined, nowIso: string): void {
  if (!asOf) return;
  const days = (Date.parse(nowIso) - Date.parse(asOf)) / 86_400_000;
  if (days > STALE_AFTER_DAYS) {
    console.error(
      `[kickoffcal-alert] atp_ranking_stale: the table states ${asOf}, ${Math.floor(days)} days old — it is no longer being maintained weekly`,
    );
  }
}

export async function fetchAtpRankings(): Promise<{
  rawCount: number;
  entries: RosterEntry[];
}> {
  const url =
    `${API}?action=parse&page=${encodeURIComponent(RANKINGS_PAGE)}` +
    `&prop=wikitext&format=json&formatversion=2&redirects=1`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`wikipedia action api http ${res.status}`);
  const body = await res.json();
  // formatversion=2 flattens wikitext to a string; the parser accepts
  // the legacy shape too, so normalise rather than branch at the edge.
  const normalised =
    typeof (body as { parse?: { wikitext?: unknown } })?.parse?.wikitext ===
    'string'
      ? { parse: { wikitext: { '*': (body as any).parse.wikitext } } }
      : body;
  const table = parseAtpRankings(normalised);
  warnIfStale(table.asOf, new Date().toISOString());
  return { rawCount: table.rows.length, entries: rankingEntries(table) };
}
