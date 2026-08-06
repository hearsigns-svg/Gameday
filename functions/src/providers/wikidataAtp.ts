// ATP players from Wikidata — the men's tennis roster source.
//
// atptour.com is permanently excluded (robots names ClaudeBot); Wikidata
// is a DIFFERENT publisher making its own decision about its own
// property graph, under a verified CC0 grant ("All structured data in
// the main, property and lexeme namespaces is made available under the
// Creative Commons CC0 License"). Consuming it involves zero requests
// to anything ATP operates; a statement that cites atptour.com as its
// reference is metadata, not a fetch, and we never follow it.
//
// ACCESS, per the owner ruling (2026-08-03, DECISIONS): the Wikidata
// Query Service is used as the documented programmatic service it is —
// robots.txt is a crawler protocol, and a publisher does not write a
// User-Agent policy, rate limits and bot etiquette docs for the thing
// it is refusing. Conditions honoured here: honest UA with contact,
// weekly cadence (the roster scheduler), ONE enumeration query per
// refresh — never a crawl — and if WDQS starts timing out or
// throttling at this cadence, the failure surfaces loudly in the
// roster run record and the owner decides, the same way the ICS 429s
// were handled.
//
// THE THRESHOLD (owner-validated 2026-08-03 before any minting): the
// P536 universe is ~6,559 humans back to the 1830s; importing all of
// them makes search worse. A player imports if
//   (plausibly current AND multi-language notable) OR ever top 10.
// "Plausibly current": career end absent-or-recent, or career start
// recent, or born 1985+. "Notable": 3+ Wikipedia sitelinks. "Ever top
// 10": any P1352 ranking statement <= 10 — the historically-notable
// arm, objective rather than taste. VALIDATED against the live Toronto
// ATP draw (111 players, the "playing this week" population): 110
// matched and every one passed; the miss (a wildcard with no Wikidata
// item at all) is a universe bound, not a threshold drop.

import { groupTitleOf, RosterEntry } from '../athletes';

// THE MINT GATE — OPENED 2026-08-03 on the owner's approval of the
// validated counts (Prompt 10c: universe 6,559 → selected 1,513;
// 110/110 on the live-draw check). The weekly scheduler owns the
// refresh from here, under the WDQS ruling's conditions.
// RETIRED 2026-08-06 (owner ruling). The men's directory is now the
// vendor's ranked 500 — one maintained source instead of 1,394 mostly
// inactive Wikidata men. Left as a flag rather than deleted because the
// query, the dual-IOC-code handling and the dissolved-state filtering
// are hard-won and would be expensive to rediscover; but it MUST stay
// false, because a weekly run of this would re-mint every athlete the
// reset removed and silently undo it.
export const ATP_ROSTER_ENABLED = false;

export const USER_AGENT =
  'KickOffCal/1.0 (+https://kickoffcal.app; calendar sync; contact hearsigns@gmail.com)';

const WDQS = 'https://query.wikidata.org/sparql';

// One query, lean shapes: EXISTS flags instead of aggregate subqueries
// (the aggregate form 502s; this form answered 6,603 rows in ~18s).
// Rows repeat when a player carries multiple dob/career statements —
// folded in code, never in SPARQL.
export const ATP_ENUM_QUERY = `SELECT ?p ?label ?atp ?dob ?start ?end ?links ?top10 ?wta ?itf ?death WHERE {
  ?p wdt:P536 ?atp .
  OPTIONAL { ?p rdfs:label ?labelEn FILTER(LANG(?labelEn) = "en") }
  BIND(COALESCE(?labelEn, STR(?atp)) AS ?label)
  OPTIONAL { ?p wdt:P569 ?dobRaw }
  OPTIONAL { ?p wdt:P2031 ?startRaw }
  OPTIONAL { ?p wdt:P2032 ?endRaw }
  OPTIONAL { ?p wikibase:sitelinks ?links }
  OPTIONAL { ?p wdt:P597 ?wta }
  OPTIONAL { ?p wdt:P599 ?itf }
  OPTIONAL { ?p wdt:P570 ?deathRaw }
  BIND(EXISTS { ?p p:P1352/ps:P1352 ?r0 . FILTER(?r0 <= 10) } AS ?top10)
  BIND(YEAR(?dobRaw) AS ?dob)
  BIND(YEAR(?startRaw) AS ?start)
  BIND(YEAR(?endRaw) AS ?end)
  BIND(YEAR(?deathRaw) AS ?death)
}`;

// THE 29 ATP SINGLES WORLD No. 1s — CURATED, not queried. P1352 cannot
// carry this group honestly in either direction: it lists doubles
// No. 1s and pre-ranking-era retrospectives (Jamie Murray, Arthur
// Gore), and it MISSES four singles No. 1s whose items record no =1
// statement (Agassi, Murray, Năstase, Ríos). The set is closed, known,
// and changes only as world news — the DC-Open-alias class of curation.
// Source: en.wikipedia.org/wiki/List_of_ATP_number_1_ranked_singles_
// tennis_players, extracted 2026-08-03, all 29 resolved to Q-ids
// against the live P536 enumeration ('Pat Rafter' is Wikidata's
// 'Patrick Rafter', Q204068). Membership also IMPORTS: a former
// singles No. 1 belongs in the directory whatever his career dates —
// this is the "historically notable" clause with an objective anchor.
export const ATP_SINGLES_NO1_QIDS = new Map<string, string>([
  ['Q7407', 'Andre Agassi'],
  ['Q10125', 'Andy Murray'],
  ['Q54584', 'Andy Roddick'],
  ['Q104506', 'Björn Borg'],
  ['Q76334', 'Boris Becker'],
  ['Q85518537', 'Carlos Alcaraz'],
  ['Q193361', 'Carlos Moyá'],
  ['Q21622022', 'Daniil Medvedev'],
  ['Q190723', 'Gustavo Kuerten'],
  ['Q106113', 'Ilie Năstase'],
  ['Q182736', 'Ivan Lendl'],
  ['Q54812588', 'Jannik Sinner'],
  ['Q53396', 'Jim Courier'],
  ['Q53393', 'Jimmy Connors'],
  ['Q16474', 'John McEnroe'],
  ['Q312464', 'John Newcombe'],
  ['Q185722', 'Juan Carlos Ferrero'],
  ['Q180104', 'Lleyton Hewitt'],
  ['Q133318', 'Marat Safin'],
  ['Q272532', 'Marcelo Ríos'],
  ['Q16475', 'Mats Wilander'],
  ['Q5812', 'Novak Djokovic'],
  ['Q204068', 'Patrick Rafter'],
  ['Q9446', 'Pete Sampras'],
  ['Q10132', 'Rafael Nadal'],
  ['Q1426', 'Roger Federer'],
  ['Q189542', 'Stefan Edberg'],
  ['Q219966', 'Thomas Muster'],
  ['Q207705', 'Yevgeny Kafelnikov'],
]);

export interface AtpPlayer {
  qid: string; // Q5812 — the canonical cross-provider identity
  label: string;
  atpId: string; // P536, atptour's own namespace ('D643')
  dob?: number;
  careerStart?: number;
  careerEnd?: number;
  sitelinks: number;
  everTop10: boolean;
  wtaId?: string;
  itfId?: string;
  died?: number; // P570 — 9 of the selected 1,513 carry one
}

interface SparqlBinding {
  [k: string]: { value: string } | undefined;
}

// Shape rot throws; an empty result throws (the standing invariant —
// 6,559 humans do not become zero honestly).
export function parseAtpPlayers(body: unknown): AtpPlayer[] {
  const bindings = (body as { results?: { bindings?: unknown } })?.results
    ?.bindings;
  if (!Array.isArray(bindings)) {
    throw new Error('wikidata: sparql response missing results.bindings');
  }
  const byQ = new Map<string, AtpPlayer>();
  for (const raw of bindings as SparqlBinding[]) {
    const uri = raw.p?.value;
    const atpId = raw.atp?.value;
    const label = raw.label?.value;
    if (!uri || !atpId || !label) {
      throw new Error(
        `wikidata: row missing p/atp/label: ${JSON.stringify(raw).slice(0, 120)}`,
      );
    }
    const qid = uri.split('/').pop()!;
    const prev = byQ.get(qid);
    const num = (k: string): number | undefined => {
      const v = raw[k]?.value;
      if (v === undefined) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    const merged: AtpPlayer = {
      qid,
      label: prev?.label ?? label,
      atpId: prev?.atpId ?? atpId,
      // Multiple statements (a second imprecise DOB, a career restart):
      // keep the EARLIEST dob/start and the LATEST end — the widest
      // honest career window.
      dob: minDef(prev?.dob, num('dob')),
      careerStart: minDef(prev?.careerStart, num('start')),
      careerEnd: maxDef(prev?.careerEnd, num('end')),
      sitelinks: Math.max(prev?.sitelinks ?? 0, num('links') ?? 0),
      everTop10: (prev?.everTop10 ?? false) || raw.top10?.value === 'true',
      died: minDef(prev?.died, num('death')),
      ...(prev?.wtaId ?? raw.wta?.value
        ? { wtaId: prev?.wtaId ?? raw.wta?.value }
        : {}),
      ...(prev?.itfId ?? raw.itf?.value
        ? { itfId: prev?.itfId ?? raw.itf?.value }
        : {}),
    };
    byQ.set(qid, merged);
  }
  if (byQ.size === 0) throw new Error('wikidata: zero P536 holders parsed');
  return [...byQ.values()];
}

const minDef = (a?: number, b?: number): number | undefined =>
  a === undefined ? b : b === undefined ? a : Math.min(a, b);
const maxDef = (a?: number, b?: number): number | undefined =>
  a === undefined ? b : b === undefined ? a : Math.max(a, b);

export function plausiblyCurrent(p: AtpPlayer): boolean {
  if (p.careerEnd !== undefined && p.careerEnd < 2023) return false;
  if (p.careerEnd !== undefined) return true;
  if (
    p.careerStart !== undefined &&
    p.careerStart >= 2005 &&
    (p.dob ?? 0) >= 1980
  ) {
    return true;
  }
  return (p.dob ?? 0) >= 1985;
}

// ─── Recorded retirement (Prompt 12) ──────────────────────────────────
//
// SEPARATE FROM `plausiblyCurrent`, deliberately. That predicate is an
// IMPORT threshold — "is this person worth putting in the directory" —
// and it answers with a guess by design: its last arm is `dob >= 1985`,
// which calls 594 unmarked men aged 33–40 current and calls Rohan
// Bopanna (doubles world No. 1 in 2024, aged 43) retired. Asking it the
// product question would ship that guess as a fact.
//
// This predicate only reports what a SOURCE STATES: an end-of-work-
// period year (P2032) or a date of death (P570). Measured against the
// live enumeration on 2026-08-04: 117 of the selected 1,513 carry
// P2032, 9 carry P570, union 119 (7.9%). Against the 29 curated singles
// No. 1s — the one population where the truth is independently known —
// it is 100% correct in BOTH directions: all 25 retirees carry an end
// year, all four still playing (Djokovic, Alcaraz, Sinner, Medvedev)
// carry none.
//
// SO: HIGH PRECISION, LOW RECALL, AND ABSENCE IS NOT A CLAIM. The
// newest end-year anywhere in the roster is 2024 — zero players carry
// 2025 or 2026 — so a recent retirement is invisible for a year or
// more, and Berdych, Gasquet, Wawrinka and Dolgopolov all sit unmarked.
// `undefined` here means "no source says", never "still competing", and
// no caller may invert it.
export function isRetired(p: AtpPlayer): boolean {
  return p.died !== undefined || p.careerEnd !== undefined;
}

// The year to show beside "Retired". A death year is not a career end,
// so it is never displayed as one — a player with only P570 gets the
// bare marker.
export function careerEndYearOf(p: AtpPlayer): number | undefined {
  return p.careerEnd;
}

export function passesThreshold(p: AtpPlayer): boolean {
  return (
    (plausiblyCurrent(p) && p.sitelinks >= 3) ||
    p.everTop10 ||
    ATP_SINGLES_NO1_QIDS.has(p.qid)
  );
}

// The universe cannot honestly be smaller than this (6,559 at build
// time, growing) — a smaller answer is a truncated response, and a
// truncated roster applied would deactivate real athletes.
export const MIN_UNIVERSE = 4_000;
// The selected roster's plausible band (1,513 at validation). The
// ceiling was first set at 4,000 — 250 under the 5,000 athlete
// scan-cap's hard throw once the other rosters' 757 are counted, which
// is a tripwire, not headroom (owner review, 10c). Now: 2,500 — 65%
// organic growth over validation before anything binds, worst-case
// total ~3,300 athletes against the 5,000 cap — and the APPROACH pages
// first: past WARN_SELECTED the run logs a stable-prefix console.error
// that Cloud Error Reporting groups and notifies on, so the ceiling
// can never again become binding with nothing recording that it bound
// (the follow-cap and sweep-ceiling lesson). The throw itself stays:
// a same-week doubling is feed or threshold corruption, and a
// corrupted roster applied would deactivate real athletes.
export const MIN_SELECTED = 800;
export const MAX_SELECTED = 2_500;
export const WARN_SELECTED = 2_000; // 80% of the ceiling

export function atpRosterEntries(players: readonly AtpPlayer[]): RosterEntry[] {
  const selected = players.filter(passesThreshold);
  if (selected.length < MIN_SELECTED || selected.length > MAX_SELECTED) {
    throw new Error(
      `wikidata atp: selected ${selected.length} outside [${MIN_SELECTED}, ${MAX_SELECTED}] — threshold or feed drift, not applied`,
    );
  }
  if (selected.length > WARN_SELECTED) {
    console.error(
      `[kickoffcal-alert] atp_roster_near_ceiling: selected ${selected.length} of ${MAX_SELECTED} — raise the band deliberately before it binds`,
    );
  }
  return selected.map(rosterEntryOf);
}

export function rosterEntryOf(p: AtpPlayer): RosterEntry {
  const retired = isRetired(p);
  // THIS ROSTER NO LONGER GROUPS ANYONE (owner ruling 2026-08-04). It
  // is the DIRECTORY — who exists, and who is recorded as retired — and
  // nothing more. The men's browse section is now the live ATP ranking
  // (providers/atpRankings.ts), which is a better answer to "who is
  // playing" than any curated constant: ATP points roll over 52 weeks,
  // so being ranked IS having played this year. The curated
  // world-No.-1s group, and the `honours` field that existed only to
  // build it, are deleted. `ATP_SINGLES_NO1_QIDS` survives for one
  // reason only — the import threshold's historically-notable arm, so
  // Borg and Federer stay FINDABLE.
  const endYear = careerEndYearOf(p);
  return {
    source: 'wikidata',
    externalId: p.qid,
    name: p.label,
    sport: 'tennis',
    // The alphabetical directory group (Prompt 12b) — every man we are
    // not told has retired. The live-ranking pass runs AFTER this one
    // in the same refresh and promotes its top 20 out of here into the
    // ranked group, so the order of rosterSources() is load-bearing.
    ...(retired
      ? {}
      : {
          grouping: groupTitleOf('atp-directory')!,
          groupingKey: 'atp-directory',
        }),
    // Carried for EVERY selected player, not just the No. 1s: the
    // marker is what makes a retired man's page and follow honest, and
    // 1,484 of the 1,513 are only ever reached by search.
    ...(retired ? { careerStatus: 'retired' as const } : {}),
    ...(retired && endYear !== undefined ? { careerEndYear: endYear } : {}),
    extraIdentities: [
      { source: 'atp', externalId: p.atpId },
      ...(p.itfId ? [{ source: 'itf', externalId: p.itfId }] : []),
    ],
  };
}

// ─── Nationality (Prompt 16 B) ────────────────────────────────────────
//
// The directory's 1,374 browsable men carried NO country code at all,
// while the 20 ranked men and 203 WTA women did — so the flag that is
// now an athlete's identity mark was missing from the largest
// population we have. The Q-id is already stored, so this needs no new
// source: P27 (country of citizenship) → P984 (that country's IOC
// code), which is the same 3-letter standard the tennis feeds publish.
//
// MEASURED on the live graph, 2026-08-04: 1,359/1,513 carry P27
// (89.8%), and 1,321/1,513 resolve onward to an IOC code (87.3%).
//
// A SEPARATE QUERY, deliberately. The enumeration query walks 6,559
// humans and already answers in ~18s; bolting two more OPTIONALs onto
// it risks the timeout that would fail the whole refresh for the sake
// of a flag. This one is bounded by VALUES over the SELECTED players,
// and if it fails the roster still applies — countryCode merges, so
// absence leaves whatever each document already had.
export function countryQueryFor(qids: readonly string[]): string {
  // P576 (dissolved/abolished) rides along because CITIZENSHIP OUTLIVES
  // COUNTRIES: Djokovic holds Serbia AND Serbia-and-Montenegro, and a
  // state that no longer exists cannot be the one he competes for.
  return `SELECT ?p ?country ?ioc ?dissolved WHERE {
  VALUES ?p { ${qids.map((q) => `wd:${q}`).join(' ')} }
  ?p wdt:P27 ?country .
  ?country wdt:P984 ?ioc .
  OPTIONAL { ?country wdt:P576 ?dissolved }
}`;
}

export function parseCountryCodes(body: unknown): Map<string, string> {
  const bindings = (body as { results?: { bindings?: unknown } })?.results
    ?.bindings;
  if (!Array.isArray(bindings)) {
    throw new Error('wikidata: country response missing results.bindings');
  }
  // Grouped by COUNTRY, not by code — the two are not the same thing.
  // Spain is the only country on Wikidata carrying two IOC codes (ESP
  // and the historical SPA), and treating that as ambiguity dropped
  // every Spanish player's flag.
  const byAthlete = new Map<string, Map<string, { codes: Set<string>; dissolved: boolean }>>();
  for (const raw of bindings as SparqlBinding[]) {
    const qid = raw.p?.value?.split('/').pop();
    const ioc = raw.ioc?.value;
    const country = raw.country?.value ?? ioc; // pre-P576 shape: code IS the group
    if (!qid || !ioc || !country) continue;
    const countries = byAthlete.get(qid) ?? new Map();
    const entry = countries.get(country) ?? { codes: new Set<string>(), dissolved: false };
    entry.codes.add(ioc);
    if (raw.dissolved?.value) entry.dissolved = true;
    countries.set(country, entry);
    byAthlete.set(qid, countries);
  }
  const out = new Map<string, string>();
  for (const [qid, countries] of byAthlete) {
    // A DEFUNCT STATE IS NOT A NATIONALITY. Citizenship statements
    // outlive countries — the USSR, Yugoslavia, Serbia and Montenegro,
    // Czechoslovakia — and nobody competes for one.
    const live = [...countries.values()].filter((c) => !c.dissolved);
    const usable = live.length > 0 ? live : [];
    // GENUINE DUAL CITIZENSHIP MINTS NOTHING: nothing in the data says
    // which nation an athlete represents, and a wrong flag on a real
    // person is the failure the no-generated-likeness ruling exists to
    // avoid. Same rule as an ambiguous NAME (athletes.ts) — the row
    // keeps its monogram.
    if (usable.length !== 1) continue;
    out.set(qid, [...usable[0].codes].sort()[0]);
  }
  return out;
}

async function fetchCountryCodes(
  qids: readonly string[],
): Promise<Map<string, string>> {
  const res = await fetch(WDQS, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/sparql-results+json',
    },
    body: `query=${encodeURIComponent(countryQueryFor(qids))}`,
  });
  if (!res.ok) throw new Error(`wikidata country sparql http ${res.status}`);
  return parseCountryCodes(await res.json());
}

export async function fetchAtpRoster(): Promise<{
  rawCount: number;
  entries: RosterEntry[];
}> {
  const res = await fetch(WDQS, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/sparql-results+json',
    },
    body: `query=${encodeURIComponent(ATP_ENUM_QUERY)}`,
  });
  if (!res.ok) {
    // 429/503 here is Wikimedia's signal — it surfaces in the roster
    // run record and roster_stale, and per the ruling the owner
    // decides; nothing retries inside the run.
    throw new Error(`wikidata sparql http ${res.status}`);
  }
  const players = parseAtpPlayers(await res.json());
  if (players.length < MIN_UNIVERSE) {
    throw new Error(
      `wikidata atp: universe ${players.length} < ${MIN_UNIVERSE} — truncated response, not applied`,
    );
  }
  const entries = atpRosterEntries(players);
  // Nationality is a nice-to-have on a roster whose job is identity:
  // a failure here is logged and the refresh proceeds. It must never
  // be silent, though — an unlogged failure and "nobody has a
  // nationality" would look identical.
  try {
    const codes = await fetchCountryCodes(
      entries.map((e) => e.externalId!).filter(Boolean),
    );
    for (const entry of entries) {
      const code = entry.externalId ? codes.get(entry.externalId) : undefined;
      if (code) entry.countryCode = code;
    }
    console.log(
      `[kickoffcal] atp roster: ${codes.size}/${entries.length} country codes resolved`,
    );
  } catch (e) {
    // An Error object, not a bare string: gen-2 Error Reporting ingests
    // stack-shaped logs, and a silent nationality failure would be
    // indistinguishable from "nobody has one".
    console.error(
      new Error(`[kickoffcal] atp country codes failed (roster applied without them): ${e}`),
    );
  }
  return { rawCount: players.length, entries };
}
