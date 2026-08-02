// Premier Boxing Champions — the one boxing promoter with structured data.
//
// PBC publishes JSON-LD `SportsEvent` on every card page, and a sitemap
// enumerating all of them. Verified live 2026-07-31: 319 card URLs, and
// the August 22 card carries four SportsEvent blocks — ONE PER BOUT, all
// sharing the card's start time.
//
// We take the CARD, not the bouts. Bout-level granularity is Prompt 5's
// problem; a card is one thing a person attends or watches, and four
// calendar entries at the same time for one night of boxing is noise.
// The main event is the first block and gives the card its title.
//
// robots.txt allows every path we touch and asks for `Crawl-delay: 10`,
// which we honour — see PBC_CRAWL_DELAY_MS.

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

export interface LdSportsEvent {
  '@type'?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  url?: string;
  eventStatus?: string;
  location?: { name?: string } | string;
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
  return {
    id: `pbc-${url.replace(/\/$/, '').split('/').pop()}`,
    sport: 'boxing',
    competition: 'Premier Boxing Champions',
    competitionId: 'pbc-cards',
    title: main.name!,
    followKeys: ['pbc-cards'],
    startUtc: start.toISOString(),
    status,
    // A card runs several hours; the bouts all share the card's start.
    durationHours: 4,
    // The published time is the CARD start (first bell / broadcast), not
    // the main-event ringwalk, which drifts with the undercard. Real
    // instant, unsettled — exactly what nominal is for.
    timePrecision: status === 'postponed' ? 'date_only' : 'nominal',
    confidence: 'provisional',
    updatedAt,
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fetch the sitemap, then only the cards that have not already happened.
// Honours the crawl delay between page fetches.
export async function fetchPbcCards(
  fromDate: string, // ISO date; cards before this are not fetched
  maxCards = 12,
): Promise<ProviderFetch> {
  const res = await fetch(SITEMAP, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`pbc http ${res.status}`);
  const urls = parseSitemapUrls(await res.text());
  if (urls.length === 0) {
    throw new Error('pbc: sitemap contained no <loc> entries');
  }
  // Undated slugs are kept: better one wasted fetch than a silently
  // skipped card because PBC changed its URL shape.
  const candidates = urls.filter((u) => {
    const d = cardDateFromUrl(u);
    return d === null || d >= fromDate;
  });
  const now = new Date().toISOString();
  const fixtures: Fixture[] = [];
  for (const url of candidates.slice(0, maxCards)) {
    const page = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (page.ok) {
      const f = cardToFixture(url, await page.text(), now);
      if (f) fixtures.push(f);
    }
    await wait(PBC_CRAWL_DELAY_MS);
  }
  return { rawCount: candidates.length, fixtures };
}
