// The alarm offset for a day-shaped reminder on an all-day event. PURE.
//
// An all-day fixture's start is a midnight day sentinel, so a plain
// "minutes before start" alarm fires at an arbitrary hour — the exact
// reason all-day entries carried no alarm at all until Prompt 24. The
// user's choice is CIVIL ("the evening before at 6pm", "the morning of
// at 9am"), and this converts it into the minutes-before-start number
// the calendar layer actually speaks, per platform:
//
//   Android stores an all-day event's DTSTART as midnight UTC of the
//   date; iOS (EventKit) anchors it at midnight LOCAL. The same civil
//   instant is therefore a DIFFERENT offset on each platform, which is
//   why the anchor is a parameter rather than a guess.
//
// Local time comes from the environment's zone via the Date local-part
// constructor, which is DST-correct for the target date — and is why the
// suite's two-timezone run (UTC and America/Los_Angeles) genuinely
// exercises this file rather than passing vacuously.

import { AllDayReminder } from './prefs';

// Civil hours, fixed by design (see prefs.ts): 6pm the evening before,
// 9am the morning of.
export const DAY_BEFORE_HOUR = 18;
export const MORNING_OF_HOUR = 9;

export type AllDayAnchor = 'utc-midnight' | 'local-midnight';

// `dayUtc` is the fixture's day sentinel (midnight UTC of the event's
// date — its UTC date parts ARE the fixture's calendar date).
// Returns minutes BEFORE the platform's all-day start (positive =
// before), or null when the reminder is off or the sentinel unreadable —
// an unreadable date must cost the alarm, never invent one at a
// nonsense offset.
export function allDayAlarmMinutesBefore(
  dayUtc: string,
  reminder: AllDayReminder,
  anchor: AllDayAnchor,
): number | null {
  if (reminder === null) return null;
  const day = new Date(dayUtc);
  if (Number.isNaN(day.getTime())) return null;
  const y = day.getUTCFullYear();
  const m = day.getUTCMonth();
  const d = day.getUTCDate();

  // The civil instant the alarm should fire, in the device's zone.
  const fireAt =
    reminder === 'day-before'
      ? new Date(y, m, d - 1, DAY_BEFORE_HOUR, 0, 0, 0)
      : new Date(y, m, d, MORNING_OF_HOUR, 0, 0, 0);

  // Where this platform believes the all-day event starts.
  const start =
    anchor === 'utc-midnight'
      ? Date.UTC(y, m, d, 0, 0, 0, 0)
      : new Date(y, m, d, 0, 0, 0, 0).getTime();

  return Math.round((start - fireAt.getTime()) / 60_000);
}
