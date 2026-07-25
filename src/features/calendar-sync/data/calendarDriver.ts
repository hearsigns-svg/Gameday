// expo-calendar driver. Gameday writes ONLY into its own dedicated
// "Gameday" calendar, and ONLY events it ledgered — never a user event.
// Every event's notes carry a NOTES_TAG line with the fixture id for
// reinstall recovery.

import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import { AppError, err, ok, Result } from '../../../core/result';
import { palette } from '../../../core/tokens';
import { readJson, writeJson } from '../../../core/storage';

export const NOTES_TAG = 'gameday-fixture:';
const CAL_KEY = 'gamedayCalendarId.v1';
const CAL_TITLE = 'Gameday';

export async function ensureCalendarPermission(): Promise<Result<true>> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== 'granted') {
    return err<AppError>({ kind: 'permission-denied', resource: 'calendar' });
  }
  return ok(true);
}

async function findExistingGamedayCalendar(): Promise<string | null> {
  const cached = readJson<string | null>(CAL_KEY, null);
  const calendars = await Calendar.getCalendarsAsync(
    Calendar.EntityTypes.EVENT,
  );
  if (cached && calendars.some((c) => c.id === cached)) return cached;
  const byTitle = calendars.find((c) => c.title === CAL_TITLE);
  return byTitle ? byTitle.id : null;
}

export async function ensureGamedayCalendar(): Promise<Result<string>> {
  const existing = await findExistingGamedayCalendar();
  if (existing) {
    writeJson(CAL_KEY, existing);
    return ok(existing);
  }
  try {
    let id: string;
    if (Platform.OS === 'ios') {
      const dflt = await Calendar.getDefaultCalendarAsync();
      id = await Calendar.createCalendarAsync({
        title: CAL_TITLE,
        color: palette.light.primary,
        entityType: Calendar.EntityTypes.EVENT,
        sourceId: dflt.source.id,
        name: CAL_TITLE,
      });
    } else {
      id = await Calendar.createCalendarAsync({
        title: CAL_TITLE,
        color: palette.light.primary,
        entityType: Calendar.EntityTypes.EVENT,
        source: { isLocalAccount: true, name: CAL_TITLE, type: 'LOCAL' },
        name: CAL_TITLE,
        ownerAccount: CAL_TITLE,
        accessLevel: Calendar.CalendarAccessLevel.OWNER,
      });
    }
    writeJson(CAL_KEY, id);
    return ok(id);
  } catch (e) {
    return err({ kind: 'unknown', message: `calendar create failed: ${e}` });
  }
}

export interface EventInput {
  fixtureId: string;
  title: string;
  startUtc: string;
  endUtc: string;
  reminderMinutesBefore: number | null;
}

function toEventDetails(input: EventInput) {
  return {
    title: input.title,
    startDate: new Date(input.startUtc),
    endDate: new Date(input.endUtc),
    notes: `${NOTES_TAG}${input.fixtureId}`,
    alarms:
      input.reminderMinutesBefore === null
        ? []
        : [{ relativeOffset: -input.reminderMinutesBefore }],
  };
}

export async function createFixtureEvent(
  calendarId: string,
  input: EventInput,
): Promise<Result<string>> {
  try {
    const eventId = await Calendar.createEventAsync(
      calendarId,
      toEventDetails(input),
    );
    return ok(eventId);
  } catch (e) {
    return err({ kind: 'unknown', message: `event create failed: ${e}` });
  }
}

export async function updateFixtureEvent(
  eventId: string,
  input: EventInput,
): Promise<Result<string>> {
  try {
    await Calendar.updateEventAsync(eventId, toEventDetails(input));
    return ok(eventId);
  } catch (e) {
    return err({ kind: 'unknown', message: `event update failed: ${e}` });
  }
}

export async function deleteFixtureEvent(eventId: string): Promise<Result<true>> {
  try {
    await Calendar.deleteEventAsync(eventId);
    return ok(true);
  } catch {
    // Already gone (user deleted it by hand) — treat as success; the
    // ledger entry is being removed either way.
    return ok(true);
  }
}
