// expo-calendar driver (SDK 57 "Calendar Next" object API). Gameday
// writes ONLY into its own dedicated "Gameday" calendar, and ONLY events
// it ledgered — never a user event. Every event's notes carry a NOTES_TAG
// line with the fixture id for reinstall recovery.

import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import { AppError, err, ok, Result } from '../../../core/result';
import { palette } from '../../../core/tokens';
import { readJson, writeJson } from '../../../core/storage';
import { RecoveredEvent } from '../domain/recovery';

export const NOTES_TAG = 'gameday-fixture:';
const CAL_KEY = 'gamedayCalendarId.v1';
const CAL_TITLE = 'Gameday';

// Non-prompting probe: reports the existing grant WITHOUT ever showing
// the OS dialog. Used as reinstall evidence — an existing grant means
// this device already opted in through the primed flow once.
export async function hasCalendarGrant(): Promise<boolean> {
  try {
    const { status } = await Calendar.getCalendarPermissions();
    return status === 'granted';
  } catch {
    return false;
  }
}

export async function ensureCalendarPermission(): Promise<Result<true>> {
  try {
    const { status } = await Calendar.requestCalendarPermissions();
    if (status !== 'granted') {
      return err<AppError>({ kind: 'permission-denied', resource: 'calendar' });
    }
    return ok(true);
  } catch (e) {
    return err({ kind: 'unknown', message: `calendar permission failed: ${e}` });
  }
}

// Search window for tagged events: generous on both sides so recovery
// sees every fixture we could plausibly have written.
function eventWindow(): { start: Date; end: Date } {
  const start = new Date();
  start.setFullYear(start.getFullYear() - 5);
  const end = new Date();
  end.setFullYear(end.getFullYear() + 3);
  return { start, end };
}

function toIso(d: string | Date): string {
  return new Date(d).toISOString();
}

// Normalise a platform-reported all-day boundary to the UTC day the
// planner wrote. Two read-back shapes exist: an exact UTC boundary
// (kept as-is), or device-local midnight — whose LOCAL calendar date IS
// the intended day. A round-to-nearest cannot cover both: inhabited
// offsets span −11…+14 (25h > 24h), so UTC+13/+14 devices would snap a
// day early.
function nearestUtcDay(input: string | Date): string {
  const d = new Date(input);
  if (d.getTime() % 86_400_000 === 0) return d.toISOString();
  return new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()),
  ).toISOString();
}

async function taggedEventsOf(
  calendar: Calendar.ExpoCalendar,
): Promise<RecoveredEvent[]> {
  const { start, end } = eventWindow();
  const events = await calendar.listEvents(start, end);
  return events
    .filter((e) => e.notes?.startsWith(NOTES_TAG))
    .map((e) => {
      const allDay = e.allDay ?? false;
      return {
        fixtureId: (e.notes ?? '').slice(NOTES_TAG.length).trim(),
        eventId: e.id,
        title: e.title ?? '',
        // All-day reads must be normalised to the UTC day boundary the
        // planner writes (platforms may report local midnight instead).
        // Without this, a recovered placeholder never matches its
        // desired shape and is pointlessly rewritten on every sync
        // after a reinstall.
        startUtc: allDay ? nearestUtcDay(e.startDate) : toIso(e.startDate),
        endUtc: allDay ? nearestUtcDay(e.endDate) : toIso(e.endDate),
        allDay,
      };
    });
}

export async function listTaggedEvents(
  calendarId: string,
): Promise<Result<RecoveredEvent[]>> {
  try {
    const calendar = await Calendar.ExpoCalendar.get(calendarId);
    return ok(await taggedEventsOf(calendar));
  } catch (e) {
    return err({ kind: 'unknown', message: `event scan failed: ${e}` });
  }
}

// If duplicate "Gameday" calendars exist (zombie dev runs, interrupted
// installs), keep the one holding the most tagged events and delete the
// rest — they are ours by construction (title + local account).
async function resolveGamedayCalendar(): Promise<Calendar.ExpoCalendar | null> {
  const cached = readJson<string | null>(CAL_KEY, null);
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  const ours = calendars.filter(
    (c) => c.title === CAL_TITLE || c.id === cached,
  );
  if (ours.length === 0) return null;
  if (ours.length === 1) return ours[0];
  const counted = await Promise.all(
    ours.map(async (c) => ({ c, n: (await taggedEventsOf(c)).length })),
  );
  counted.sort((a, b) => b.n - a.n);
  const [keep, ...drop] = counted;
  for (const { c } of drop) {
    try {
      await c.delete();
    } catch {
      // A calendar we cannot delete stays; it no longer matches the
      // cached id, so it will not be written to again.
    }
  }
  return keep.c;
}

// The user's chosen calendar colour (how Gameday events appear in the
// OS calendar). Stored even before the calendar exists — creation and
// later changes both read it.
const CAL_COLOUR_KEY = 'calendarColour.v1';

export function calendarColour(): string {
  return readJson<string>(CAL_COLOUR_KEY, palette.light.primary);
}

// Persists the choice always; applies it live when the calendar already
// exists. Returns whether it was applied now (false = saved for when
// the calendar is created/connected).
export async function setCalendarColour(hex: string): Promise<boolean> {
  writeJson(CAL_COLOUR_KEY, hex);
  const id = readJson<string | null>(CAL_KEY, null);
  if (!id) return false;
  try {
    const cal = await Calendar.ExpoCalendar.get(id);
    await cal.update({ color: hex });
    return true;
  } catch {
    return false; // no permission / calendar gone — applies on next create
  }
}

export async function ensureGamedayCalendar(): Promise<Result<string>> {
  try {
    const existing = await resolveGamedayCalendar();
    if (existing) {
      writeJson(CAL_KEY, existing.id);
      // A colour picked before the calendar connected must still land —
      // creation applies it, so resolution has to as well. Cosmetic:
      // never let it fail the sync.
      const want = calendarColour();
      if ((existing.color ?? '').slice(0, 7).toLowerCase() !== want.toLowerCase()) {
        try {
          await existing.update({ color: want });
        } catch {
          // keep the platform's colour
        }
      }
      return ok(existing.id);
    }
    const details: NonNullable<Parameters<typeof Calendar.createCalendar>[0]> = {
      title: CAL_TITLE,
      color: calendarColour(),
      entityType: Calendar.EntityTypes.EVENT,
      name: CAL_TITLE,
    };
    if (Platform.OS === 'ios') {
      details.sourceId = Calendar.getDefaultCalendarSync().source.id;
    } else {
      details.source = { isLocalAccount: true, name: CAL_TITLE, type: 'LOCAL' };
      details.ownerAccount = CAL_TITLE;
      details.accessLevel = Calendar.CalendarAccessLevel.OWNER;
    }
    const created = await Calendar.createCalendar(details);
    writeJson(CAL_KEY, created.id);
    return ok(created.id);
  } catch (e) {
    return err({ kind: 'unknown', message: `calendar create failed: ${e}` });
  }
}

export interface EventInput {
  fixtureId: string;
  title: string;
  startUtc: string;
  endUtc: string;
  allDay: boolean;
  reminderMinutesBefore: number | null;
}

function toEventDetails(input: EventInput) {
  // The planner's all-day span is EXCLUSIVE next-midnight (Android's
  // CalendarContract convention). EventKit treats the end date's DAY as
  // INCLUSIVE — passing next-midnight made every one-day placeholder
  // render as a two-day banner on iOS (verified in the sim's calendar
  // store: 00:00 → next day 23:59:59). On iOS the end must stay inside
  // the SAME day; EventKit snaps it to end-of-day itself.
  const allDayEnd =
    Platform.OS === 'ios'
      ? new Date(new Date(input.startUtc).getTime() + 3_600_000)
      : new Date(input.endUtc);
  return {
    title: input.title,
    startDate: new Date(input.startUtc),
    endDate: input.allDay ? allDayEnd : new Date(input.endUtc),
    allDay: input.allDay,
    // All-day placeholders are built from a UTC day boundary
    // (dayStartUtc). Without pinning the zone, the platform reads those
    // date components in DEVICE-LOCAL time, so a user west of UTC sees
    // the placeholder a day EARLY (2026-08-23T00:00Z is Aug 22, 17:00
    // in Los Angeles). Timed events must NOT be pinned — they are true
    // instants and have to render in the viewer's own zone.
    ...(input.allDay ? { timeZone: 'UTC' } : {}),
    notes: `${NOTES_TAG}${input.fixtureId}`,
    alarms:
      input.reminderMinutesBefore === null
        ? []
        : [{ relativeOffset: -input.reminderMinutesBefore }],
  };
}

// One shared calendar object per sync run — instantiating a native
// shared object per event exhausts bridge handles and hangs mid-run.
export async function getGamedayCalendarObject(
  calendarId: string,
): Promise<Result<Calendar.ExpoCalendar>> {
  try {
    return ok(await Calendar.ExpoCalendar.get(calendarId));
  } catch (e) {
    return err({ kind: 'unknown', message: `calendar get failed: ${e}` });
  }
}

export async function createFixtureEvent(
  calendar: Calendar.ExpoCalendar,
  input: EventInput,
): Promise<Result<string>> {
  try {
    const event = await calendar.createEvent(toEventDetails(input));
    return ok(event.id);
  } catch (e) {
    return err({ kind: 'unknown', message: `event create failed: ${e}` });
  }
}

export async function updateFixtureEvent(
  eventId: string,
  input: EventInput,
): Promise<Result<string>> {
  try {
    const event = await Calendar.ExpoCalendarEvent.get(eventId);
    await event.update(toEventDetails(input));
    return ok(eventId);
  } catch (e) {
    return err({ kind: 'unknown', message: `event update failed: ${e}` });
  }
}

export async function deleteFixtureEvent(eventId: string): Promise<Result<true>> {
  try {
    const event = await Calendar.ExpoCalendarEvent.get(eventId);
    await event.delete();
    return ok(true);
  } catch (e) {
    // Only a true not-found is success (user deleted it by hand). Any
    // other failure must abort the sync BEFORE the ledger entry is
    // dropped — swallowing real errors once orphaned events into
    // duplicates (see DECISIONS.md).
    if (/not.?found|no such event|does not exist/i.test(String(e))) {
      return ok(true);
    }
    return err({ kind: 'unknown', message: `event delete failed: ${e}` });
  }
}
