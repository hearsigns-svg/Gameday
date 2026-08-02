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
import { normaliseName } from '../identity';
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
  return { hits: Number(initial.hits ?? results.length), results };
}

// A stable follow key per competition GROUP. The calendar carries 1,247
// meetings for a five-month window, overwhelmingly minor road races — one
// key for all of them would mean following athletics floods a calendar
// with parkruns. The group is what a fan actually follows: the Diamond
// League, the Continental Tour, the indoor circuit, the championships.
export function groupKey(group: string | null | undefined): string | null {
  const slug = normaliseName(group ?? '').replace(/\s+/g, '-');
  return slug.length > 0 ? `wa-${slug}` : null;
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

export async function fetchWorldAthletics(
  startDate: string,
  endDate: string,
  maxPages = 4,
): Promise<ProviderFetch> {
  const now = new Date().toISOString();
  const fixtures: Fixture[] = [];
  let raw = 0;
  for (let page = 0; page < maxPages; page++) {
    const url = `${BASE}?startDate=${startDate}&endDate=${endDate}&offset=${page * 100}`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`worldathletics http ${res.status}`);
    const { hits, results } = eventsFromNextData(
      extractNextData(await res.text()),
    );
    raw += results.length;
    for (const r of results) {
      const f = meetingToFixture(r, now);
      if (f) fixtures.push(f);
    }
    if (results.length === 0 || (page + 1) * 100 >= hits) break;
    await wait(1_000); // no crawl-delay published; be polite anyway
  }
  return { rawCount: raw, fixtures };
}
