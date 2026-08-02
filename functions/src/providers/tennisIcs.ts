// ATP tournament calendar, from the ICS feed Tennis TV publishes.
//
// Tennis TV (ATP Media) created this feed for subscription and documented
// how to add it to Outlook and Apple Calendar. We fetch the one URL they
// published, ONCE A DAY, identifying ourselves honestly — that is
// subscribing, which is what an ICS feed is for.
//
// TAKEN: the structured fields only — UID, SUMMARY, LOCATION, DTSTART,
// DTEND. NOT taken: the VEVENT DESCRIPTION text. See docs/DECISIONS.md
// 2026-07-31 for why this and atptour.com are answered differently.
//
// Verified live 2026-07-31: 340 VEVENTs spanning 2022-09 → 2027-11, every
// one date-only, tournament level with venue.

import { Fixture } from '../fixture';
import { ProviderFetch, requireArray } from './fetchResult';

const FEED =
  'https://calendar.google.com/calendar/ical/ds7uamao3ic6d8q322prob1suk%40group.calendar.google.com/public/basic.ics';

export const USER_AGENT =
  'KickOffCal/1.0 (+https://kickoffcal.app; calendar sync; contact hearsigns@gmail.com)';

export interface VEvent {
  uid: string;
  summary: string;
  location: string;
  start: string; // YYYYMMDD or YYYYMMDDTHHMMSSZ
  end: string;
}

// RFC 5545 line folding: a continuation line starts with a space or tab.
export function unfoldIcs(raw: string): string[] {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
}

function valueOf(line: string): string {
  const i = line.indexOf(':');
  return i < 0 ? '' : line.slice(i + 1).trim();
}

export function parseVEvents(raw: string): VEvent[] {
  const out: VEvent[] = [];
  let cur: Partial<VEvent> | null = null;
  for (const line of unfoldIcs(raw)) {
    if (line.startsWith('BEGIN:VEVENT')) cur = {};
    else if (line.startsWith('END:VEVENT')) {
      if (cur?.uid && cur.summary && cur.start) out.push(cur as VEvent);
      cur = null;
    } else if (cur) {
      if (line.startsWith('UID')) cur.uid = valueOf(line);
      else if (line.startsWith('SUMMARY')) cur.summary = valueOf(line);
      else if (line.startsWith('LOCATION')) cur.location = valueOf(line);
      else if (line.startsWith('DTSTART')) cur.start = valueOf(line);
      else if (line.startsWith('DTEND')) cur.end = valueOf(line);
      // DESCRIPTION is deliberately not read.
    }
  }
  return out;
}

// "20260802" → 2026-08-02T00:00:00.000Z. Date-only values are floating
// days; the tournament runs on that calendar date wherever you are.
function icsDateToUtc(v: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(v);
  if (!m) return null;
  const d = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d) ? null : new Date(d).toISOString();
}

export function tournamentToFixture(
  e: VEvent,
  updatedAt: string,
): Fixture | null {
  const startUtc = icsDateToUtc(e.start);
  if (!startUtc) return null;
  const endUtc = e.end ? icsDateToUtc(e.end) : null;
  // DTEND is EXCLUSIVE for date values: 20260802→20260814 is Aug 2 through
  // Aug 13, twelve days. Getting this wrong would end every tournament a
  // day late.
  const days =
    endUtc && endUtc > startUtc
      ? Math.round(
          (Date.parse(endUtc) - Date.parse(startUtc)) / 86_400_000,
        )
      : 1;
  return {
    id: `tennis-${e.uid.split('@')[0]}`,
    sport: 'tennis',
    competition: 'ATP Tour',
    competitionId: 'tennis-atp',
    title: e.summary,
    followKeys: ['tennis-atp'],
    startUtc,
    status: 'scheduled',
    durationHours: days * 24,
    // A tournament is a span of days, not an instant — the feed carries no
    // time and no order of play. Draws and start times are Prompt 5.
    timePrecision: 'date_only',
    confidence: 'confirmed',
    updatedAt,
  };
}

export async function fetchTennisTournaments(): Promise<ProviderFetch> {
  const res = await fetch(FEED, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`tennistv ics http ${res.status}`);
  const body = await res.text();
  if (!body.includes('BEGIN:VCALENDAR')) {
    // A login page or an error body would otherwise parse to zero events
    // and read as "the tour has no tournaments".
    throw new Error('tennistv ics: response is not an iCalendar document');
  }
  const events = parseVEvents(body);
  const now = new Date().toISOString();
  const fixtures = events
    .map((e) => tournamentToFixture(e, now))
    .filter((f): f is Fixture => f !== null);
  return { rawCount: events.length, fixtures: requireArray(fixtures, 'tennistv', 'events') };
}
