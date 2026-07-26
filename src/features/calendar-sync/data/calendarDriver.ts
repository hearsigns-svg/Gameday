// expo-calendar driver (SDK 57 "Calendar Next" object API). Gameday
// writes ONLY into its own dedicated "Gameday" calendar, and ONLY events
// it ledgered — never a user event. Every event's notes carry a NOTES_TAG
// line with the fixture id for reinstall recovery.

import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import { AppError, err, ok, Result } from '../../../core/result';
import { palette } from '../../../core/tokens';
import { readJson, writeJson } from '../../../core/storage';

export const NOTES_TAG = 'gameday-fixture:';
const CAL_KEY = 'gamedayCalendarId.v1';
const CAL_TITLE = 'Gameday';

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

async function findExistingGamedayCalendar(): Promise<Calendar.ExpoCalendar | null> {
  const cached = readJson<string | null>(CAL_KEY, null);
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  return (
    calendars.find((c) => c.id === cached) ??
    calendars.find((c) => c.title === CAL_TITLE) ??
    null
  );
}

export async function ensureGamedayCalendar(): Promise<Result<string>> {
  try {
    const existing = await findExistingGamedayCalendar();
    if (existing) {
      writeJson(CAL_KEY, existing.id);
      return ok(existing.id);
    }
    const details: NonNullable<Parameters<typeof Calendar.createCalendar>[0]> = {
      title: CAL_TITLE,
      color: palette.light.primary,
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
  return {
    title: input.title,
    startDate: new Date(input.startUtc),
    endDate: new Date(input.endUtc),
    allDay: input.allDay,
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
