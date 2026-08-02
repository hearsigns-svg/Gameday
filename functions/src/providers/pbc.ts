// Premier Boxing Champions — the one boxing promoter with structured data.
//
// PBC publishes JSON-LD `SportsEvent` on every card page, and a sitemap
// enumerating all of them. Verified live 2026-07-31 and re-verified
// 2026-08-02 (payload banked in __tests__/fixtures/pbc-sample.html): the
// August 22 card carries four SportsEvent nodes — ONE PER BOUT, main
// event first, all sharing the card's start time, each with a
// `performer` array of two Person nodes carrying givenName/familyName.
//
// The CARD is still the fixture a promoter-follower gets — four calendar
// entries at the same time for one night of boxing is noise. Since
// Prompt 5 the OTHER nodes stop being discarded: every bout becomes an
// APPEARANCE doc (appearances.ts), which is how a fighter on the prelims
// stops being invisible. No extra requests — the bouts ride the page we
// already fetch.
//
// Names come from performer givenName+familyName, NOT the node's `name`:
// the captured card's third bout is named "Victor Santillan vs Antonio
// Russell" while its performer is "Gary Antonio Russell" — the node name
// abbreviates, the Person record does not. (The Person `name` field
// itself embeds nicknames in quotes, including an empty `""` when the
// fighter has none, so it is not used either.)
//
// robots.txt allows every path we touch and asks for `Crawl-delay: 10`,
// which we honour — see PBC_CRAWL_DELAY_MS.

import { appearanceFor } from '../appearances';
import { Fixture } from '../fixture';
import { ProviderFetch } from './fetchResult';

const SITEMAP =
  'https://www.premierboxingchampions.com/sites/default/files/google-sitemap/gs-events.xml';

// PBC's robots.txt: "Crawl-delay: 10". Honoured literally.
export const PBC_CRAWL_DELAY_MS = 10_000;

// Identify ourselves honestly. A site owner who wants to block us must be
// able to, and cannot if we hide.
export const USER_AGENT =
  'KickOffCal/1.0 (+https://kickoffcal.app; calendar sync; contact hearsigns@gmail.com)';

export interface LdPerson {
  '@type'?: string;
  name?: string; // embeds the nickname in quotes — do not use
  givenName?: string;
  familyName?: string;
}

export interface LdSportsEvent {
  '@type'?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  url?: string;
  eventStatus?: string;
  location?: { name?: string } | string;
  performer?: LdPerson[];
}

// Card URLs carry their date in the slug: `fight-night-august-22-2026`.
// Used to skip past cards without fetching them — the sitemap holds 319
// and all but a handful have already happened.
const SLUG_DATE =
  /fight-night-([a-z]+)-(\d{1,2})-(\d{4})$/i;
const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

export function cardDateFromUrl(url: string): string | null {
  const m = SLUG_DATE.exec(url.replace(/\/$/, ''));
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  if (month < 0) return null;
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (!Number.isInteger(day) || !Number.isInteger(year)) return null;
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

export function parseSitemapUrls(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

// Which card pages to fetch, in which order, under the cap. DATED
// upcoming cards first (soonest first), undated slugs after — the cap
// must never let undated slugs starve a card we KNOW is upcoming.
// Found live 2026-08-02 by the appearance-funnel instrumentation: the
// sitemap carried 19 undated URLs ahead of the one dated upcoming card
// in document order, so `slice(0, 12)` fetched twelve past cards and
// the August 22 card had never entered the cache at all.
export function candidateOrder(urls: string[], fromDate: string): string[] {
  const dated: Array<{ url: string; date: string }> = [];
  const undated: string[] = [];
  for (const u of urls) {
    const d = cardDateFromUrl(u);
    if (d === null) {
      // Kept: better one wasted fetch than a silently skipped card
      // because PBC changed its URL shape.
      undated.push(u);
    } else if (d >= fromDate) {
      dated.push({ url: u, date: d });
    }
  }
  dated.sort((a, b) => a.date.localeCompare(b.date));
  return [...dated.map((d) => d.url), ...undated];
}

// Every JSON-LD block on a page, flattened — PBC emits arrays.
export function extractLdJson(html: string): LdSportsEvent[] {
  const out: LdSportsEvent[] = [];
  for (const m of html.matchAll(
    /<script[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1].trim());
    } catch {
      continue; // one malformed block must not lose the others
    }
    for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
      if (item && typeof item === 'object') out.push(item as LdSportsEvent);
    }
  }
  return out;
}

const CANCELLED = /EventCancelled/i;
const POSTPONED = /EventPostponed/i;

// One card → one fixture. Returns null when the page has no SportsEvent,
// which is the honest outcome for a page that is not a card.
export function cardToFixture(
  url: string,
  html: string,
  updatedAt: string,
): Fixture | null {
  const events = extractLdJson(html).filter(
    (e) => e['@type'] === 'SportsEvent' && e.startDate && e.name,
  );
  if (events.length === 0) return null;
  const main = events[0]; // the main event heads the list
  const start = new Date(main.startDate!);
  if (Number.isNaN(start.getTime())) return null;
  const status = CANCELLED.test(main.eventStatus ?? '')
    ? 'cancelled'
    : POSTPONED.test(main.eventStatus ?? '')
      ? 'postponed'
      : 'scheduled';
  // The provider publishes the card's own window (startDate–endDate);
  // use it when it is coherent, keep the 4h assumption when it is not.
  // Coherent means a PLAUSIBLE card window — between half an hour and a
  // day. The JSON-LD is hand-fed marketing data: a year-typo endDate
  // would otherwise mint a year-long timed event that isPast keeps
  // un-frozen for a year, and a 2-minute one rounds to a zero-length
  // event that freezes at its own start.
  // (Prompt 6: durationHours stops being a per-league constant wherever
  // a provider supplies the real thing.)
  const end = main.endDate ? new Date(main.endDate) : null;
  const rawHours = end ? (end.getTime() - start.getTime()) / 3_600_000 : NaN;
  const durationHours =
    Number.isFinite(rawHours) && rawHours >= 0.5 && rawHours <= 24
      ? Math.round(rawHours * 10) / 10
      : 4;
  return {
    id: `pbc-${url.replace(/\/$/, '').split('/').pop()}`,
    sport: 'boxing',
    competition: 'Premier Boxing Champions',
    competitionId: 'pbc-cards',
    title: main.name!,
    followKeys: ['pbc-cards'],
    startUtc: start.toISOString(),
    status,
    durationHours,
    // The published time is the CARD start (first bell / broadcast), not
    // the main-event ringwalk, which drifts with the undercard. Real
    // instant, unsettled — exactly what nominal is for.
    timePrecision: status === 'postponed' ? 'date_only' : 'nominal',
    confidence: 'provisional',
    updatedAt,
  };
}

// One fighter's name from a performer node. givenName+familyName is the
// authoritative pair (see header); a node missing either is unusable.
function performerName(p: LdPerson): string | null {
  const given = p.givenName?.trim();
  const family = p.familyName?.trim();
  return given && family ? `${given} ${family}` : null;
}

// Every bout on a card page → appearance docs against the card fixture.
// One SportsEvent node per bout, main event first; a node whose
// performers cannot both be named contributes nothing (no invented
// names, no half-parsed bouts).
export function cardAppearances(
  card: Fixture,
  html: string,
  updatedAt: string,
): Fixture[] {
  const events = extractLdJson(html).filter(
    (e) => e['@type'] === 'SportsEvent' && e.startDate && e.name,
  );
  const out: Fixture[] = [];
  for (const e of events) {
    const performers = (e.performer ?? []).map(performerName);
    if (performers.length !== 2 || performers.some((n) => n === null)) {
      continue;
    }
    const [first, second] = performers as [string, string];
    const a = appearanceFor(card, {
      athletes: [first, second],
      title: `${first} vs ${second}`,
      updatedAt,
    });
    if (a) out.push(a);
  }
  return out;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface PbcFetch extends ProviderFetch {
  // Bout-level appearance docs, built from the SAME page fetches as the
  // cards — ingested under their own slice by the caller.
  appearances: Fixture[];
  // Funnel stage A for the appearance slice: bout nodes seen on fetched
  // pages, before the both-fighters-named and followable-name gates.
  appearanceRawCount: number;
}

// Fetch the sitemap, then only the cards that have not already happened.
// Honours the crawl delay between page fetches.
export async function fetchPbcCards(
  fromDate: string, // ISO date; cards before this are not fetched
  maxCards = 12,
): Promise<PbcFetch> {
  const res = await fetch(SITEMAP, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`pbc http ${res.status}`);
  const urls = parseSitemapUrls(await res.text());
  if (urls.length === 0) {
    throw new Error('pbc: sitemap contained no <loc> entries');
  }
  const candidates = candidateOrder(urls, fromDate);
  const now = new Date().toISOString();
  const fixtures: Fixture[] = [];
  const appearances: Fixture[] = [];
  let appearanceRawCount = 0;
  for (const url of candidates.slice(0, maxCards)) {
    const page = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (page.ok) {
      const html = await page.text();
      const f = cardToFixture(url, html, now);
      if (f) {
        fixtures.push(f);
        // Appearances only for cards inside the window — an undated
        // slug can resolve to a page for a long-finished card, and a
        // finished bout needs no appearance doc (same gate as the TSDB
        // derivation window).
        if (f.startUtc >= fromDate) {
          const boutNodes = extractLdJson(html).filter(
            (e) => e['@type'] === 'SportsEvent' && e.startDate && e.name,
          ).length;
          appearanceRawCount += boutNodes;
          appearances.push(...cardAppearances(f, html, now));
        }
      }
    }
    await wait(PBC_CRAWL_DELAY_MS);
  }
  return { rawCount: candidates.length, fixtures, appearances, appearanceRawCount };
}
