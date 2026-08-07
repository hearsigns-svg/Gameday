// World Athletics — the meeting-level calendar.
//
// The competition calendar is server-rendered into Next.js page data.
// robots.txt has no Disallow directive at all and no crawl-delay; the
// path is fully permitted. Verified live 2026-07-31: 1,247 meetings for
// Aug–Dec 2026, 100 per page, pagination by &offset=.
//
// Meeting level only — Diamond League legs, continental tour, indoor
// meetings, championships and nationals are each ONE event. Individual
// disciplines within a meeting are Prompt 5's problem.

import { Fixture } from '../fixture';
import { nameSlug, normaliseName } from '../identity';
import { ProviderFetch } from './fetchResult';

const BASE = 'https://worldathletics.org/competition/calendar-results';

export const USER_AGENT =
  'KickOffCal/1.0 (+https://kickoffcal.app; calendar sync; contact hearsigns@gmail.com)';

export interface WaEvent {
  id?: string | number;
  name?: string;
  venue?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;
  competitionGroup?: string | null;
  rankingCategory?: string | null;
}

export function extractNextData(html: string): unknown {
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) {
    // The page shape changed, or we were served something else entirely.
    // Either way it is a read failure, not an empty calendar.
    throw new Error('worldathletics: __NEXT_DATA__ block not found');
  }
  return JSON.parse(m[1]);
}

export function eventsFromNextData(data: unknown): {
  hits: number;
  results: WaEvent[];
} {
  const initial = (data as Record<string, any>)?.props?.pageProps
    ?.initialEvents;
  if (!initial || typeof initial !== 'object') {
    throw new Error('worldathletics: pageProps.initialEvents missing');
  }
  const results = initial.results;
  if (!Array.isArray(results)) {
    throw new Error('worldathletics: initialEvents.results is not an array');
  }
  const hits = Number(initial.hits ?? results.length);
  // The tail-first walk STEERS BY hits — an unparseable value must be
  // shape rot that fails loudly, never a silent walk that fetches
  // offset 0 alone with clean run records (the exact quiet starvation
  // this connector just recovered from).
  if (!Number.isFinite(hits) || hits < 0) {
    throw new Error(
      `worldathletics: initialEvents.hits is not a number (got ${JSON.stringify(initial.hits)})`,
    );
  }
  return { hits, results };
}

// A stable follow key per competition GROUP. The calendar carries 1,247
// meetings for a five-month window, overwhelmingly minor road races — one
// key for all of them would mean following athletics floods a calendar
// with parkruns. The group is what a fan actually follows: the Diamond
// League, the Continental Tour, the indoor circuit, the championships.
export function groupKey(group: string | null | undefined): string | null {
  const slug = nameSlug(group);
  return slug === null ? null : `wa-${slug}`;
}

function dayToUtc(v: string | undefined): string | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return null;
  return new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])),
  ).toISOString();
}

export function meetingToFixture(
  e: WaEvent,
  updatedAt: string,
): Fixture | null {
  const startUtc = dayToUtc(e.startDate);
  if (!startUtc || !e.name || e.id === undefined) return null;
  const endUtc = dayToUtc(e.endDate);
  // endDate is INCLUSIVE here (a one-day meeting has start === end), the
  // opposite of the ICS convention — so a one-day meeting is one day.
  const days =
    endUtc && endUtc > startUtc
      ? Math.round((Date.parse(endUtc) - Date.parse(startUtc)) / 86_400_000) + 1
      : 1;
  const group = e.competitionGroup?.trim();
  const gk = groupKey(group);
  // Both granularities: the group for people who want the Diamond League,
  // and the catch-all for people who want everything.
  const followKeys = gk ? [gk, 'wa-calendar'] : ['wa-calendar'];
  return {
    id: `wa-${e.id}`,
    sport: 'athletics',
    competition: group && group.length > 0 ? group : 'World Athletics',
    competitionId: gk ?? 'wa-calendar',
    title: e.name,
    followKeys,
    startUtc,
    status: 'scheduled',
    durationHours: days * 24,
    // The calendar publishes days, never session times.
    timePrecision: 'date_only',
    confidence: 'confirmed',
    updatedAt,
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Which offsets to fetch, given the feed's total and our page budget.
// THE CALENDAR SORTS DESCENDING BY DATE, so offset 0 is the FURTHEST
// future — walking 0,100,200,… captured the far tail of a year-long
// window and NOTHING near today. Found by the Prompt 6 slice audit:
// 406 stored athletics fixtures, zero inside 30 days, soonest
// October 17 — in peak outdoor season, with clean runs throughout
// (the PBC candidate-order bug's exact shape, one connector over).
// The NEAREST meetings live at the HIGHEST offsets, so page 0 is
// fetched for the total, then the tail pages, highest offset first.
export function tailOffsets(hits: number, maxPages: number): number[] {
  const last = Math.max(0, Math.floor((hits - 1) / 100) * 100);
  const out: number[] = [];
  for (let o = last; o > 0 && out.length < maxPages - 1; o -= 100) {
    out.push(o);
  }
  return out;
}

export interface WaFetch extends ProviderFetch {
  // TRUE when the fetched pages covered EVERY meeting the feed reported
  // for the window (ceil(hits/100) pages within the budget) — measured
  // per run, never assumed. This is what lets pollAthletics arm the
  // reaper without relaxing its rule: the rule stays "only a complete
  // fetch testifies to absence"; completeness became a fact the fetch
  // itself establishes. When a peak-season window outgrows the budget
  // the run is honestly incomplete and the slice is unreapable that day.
  complete: boolean;
}

export async function fetchWorldAthletics(
  startDate: string,
  endDate: string,
  maxPages = 14,
): Promise<WaFetch> {
  const now = new Date().toISOString();
  const fixtures: Fixture[] = [];
  const fetchPage = async (
    offset: number,
  ): Promise<{ hits: number; results: WaEvent[] }> => {
    const url = `${BASE}?startDate=${startDate}&endDate=${endDate}&offset=${offset}`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`worldathletics http ${res.status}`);
    return eventsFromNextData(extractNextData(await res.text()));
  };
  // Page 0 answers "how many" (and carries the furthest-future 100,
  // which still count — they are real meetings in the window).
  const first = await fetchPage(0);
  let raw = first.results.length;
  for (const r of first.results) {
    const f = meetingToFixture(r, now);
    if (f) fixtures.push(f);
  }
  for (const offset of tailOffsets(first.hits, maxPages)) {
    await wait(1_000); // no crawl-delay published; be polite anyway
    const page = await fetchPage(offset);
    raw += page.results.length;
    for (const r of page.results) {
      const f = meetingToFixture(r, now);
      if (f) fixtures.push(f);
    }
    // NO break on an empty page: the walk runs HIGH offset → low, so an
    // empty page means hits shrank since page 0 — the LOWER offsets
    // still hold the nearest meetings, which are the whole point.
  }
  const complete = Math.ceil(first.hits / 100) <= maxPages;
  return { rawCount: raw, fixtures, complete };
}
