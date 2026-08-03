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

import { RosterEntry } from '../athletes';

// THE MINT GATE — OPENED 2026-08-03 on the owner's approval of the
// validated counts (Prompt 10c: universe 6,559 → selected 1,513;
// 110/110 on the live-draw check). The weekly scheduler owns the
// refresh from here, under the WDQS ruling's conditions.
export const ATP_ROSTER_ENABLED = true;

export const USER_AGENT =
  'KickOffCal/1.0 (+https://kickoffcal.app; calendar sync; contact hearsigns@gmail.com)';

const WDQS = 'https://query.wikidata.org/sparql';

// One query, lean shapes: EXISTS flags instead of aggregate subqueries
// (the aggregate form 502s; this form answered 6,603 rows in ~18s).
// Rows repeat when a player carries multiple dob/career statements —
// folded in code, never in SPARQL.
export const ATP_ENUM_QUERY = `SELECT ?p ?label ?atp ?dob ?start ?end ?links ?top10 ?wta ?itf WHERE {
  ?p wdt:P536 ?atp .
  OPTIONAL { ?p rdfs:label ?labelEn FILTER(LANG(?labelEn) = "en") }
  BIND(COALESCE(?labelEn, STR(?atp)) AS ?label)
  OPTIONAL { ?p wdt:P569 ?dobRaw }
  OPTIONAL { ?p wdt:P2031 ?startRaw }
  OPTIONAL { ?p wdt:P2032 ?endRaw }
  OPTIONAL { ?p wikibase:sitelinks ?links }
  OPTIONAL { ?p wdt:P597 ?wta }
  OPTIONAL { ?p wdt:P599 ?itf }
  BIND(EXISTS { ?p p:P1352/ps:P1352 ?r0 . FILTER(?r0 <= 10) } AS ?top10)
  BIND(YEAR(?dobRaw) AS ?dob)
  BIND(YEAR(?startRaw) AS ?start)
  BIND(YEAR(?endRaw) AS ?end)
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
  const no1 = ATP_SINGLES_NO1_QIDS.has(p.qid);
  return {
    source: 'wikidata',
    externalId: p.qid,
    name: p.label,
    sport: 'tennis',
    // ONLY the curated singles No. 1s get a browse group: there is no
    // honest live rank to cut the other ~1,500 by, and a 50-cap
    // alphabetical slice of them would be an arbitrary lie. Everyone
    // else is search-first — findable, followable, ungrouped.
    ...(no1 ? { grouping: 'Former world No. 1s', groupingKey: 'atp-no1' } : {}),
    ...(no1 ? { honours: ['former-no1'] } : {}),
    extraIdentities: [
      { source: 'atp', externalId: p.atpId },
      ...(p.itfId ? [{ source: 'itf', externalId: p.itfId }] : []),
    ],
  };
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
  return { rawCount: players.length, entries: atpRosterEntries(players) };
}
