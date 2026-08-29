// Calendar preference types + defaults. PURE — no storage imports here
// (the domain layer is jest-testable without native modules). Load/save
// lives in data/prefsStore.ts. Display strings come from the typed
// catalog (Round 3 Phase C) — t/tn are pure functions, so the layer
// stays jest-testable, and en values are the previous literals
// byte-for-byte.

import { t, tn } from '../../../core/i18n';

// A reminder for an event whose TIME nobody has published yet. "N
// minutes before" is meaningless against a midnight day sentinel, so
// all-day entries get day-shaped choices anchored to civil hours
// instead: the evening before at 6pm, or the morning of at 9am. The
// hours are fixed, not configurable — two more knobs would outweigh the
// feature (24-review round, Prompt 24).
export type AllDayReminder = 'day-before' | 'morning-of' | null;

export interface CalendarPrefs {
  reminderMinutes: number | null; // null = no reminder
  // Reminder slots 2 and 3 (Stage 5). Slot 1 IS `reminderMinutes` — the
  // field every stored pref, per-event override and ledger compare
  // already understands — and these two ride beside it, POSITIONAL and
  // nullable (fixed length 2) so "Reminder 2 off, Reminder 3 at 2h"
  // survives edits without the slots shifting under their labels.
  // Values are minutes before the start; they apply to TIMED events
  // only (day sentinels keep the day-shaped channel below) and stand
  // down entirely when an event carries a per-event override — the
  // override is the whole answer for that event, not slot 1 of one.
  extraReminders: Array<number | null>;
  // For all-day entries. Defaults to NONE: turning it on adds an alarm
  // to every date-only fixture in the calendar, which is a choice, not
  // an upgrade side-effect — a default of 'day-before' would have
  // rewritten every all-day event on the first sync after this shipped.
  allDayReminder: AllDayReminder;
  eventStyle: 'timed' | 'all-day';
  seriesSessions: 'all' | 'race-only'; // F1-style series: include practice/quali?
  // Tournament calendar tiers (Round 3 B3). What a followed multi-day
  // tournament writes to the calendar:
  //   block — the full-span all-day block, as always; its description
  //           carries the pointer to the in-app card.
  //   key   — the block is REPLACED by two single-day bookend notes
  //           ("US Open begins" / "US Open — final day", pointer on the
  //           opening note) with the KEY-ROUND matches between them as
  //           normal events — finals, semis, quarters, where the data
  //           can name them.
  //   all   — bookends plus every match on the card.
  tournamentTier: TournamentTier;
  // Opt-in removal of events for fixtures that finished more than
  // PAST_RETENTION_DAYS ago. OFF unless the user turns it on: deleting
  // somebody's record of games they went to is not a default.
  autoDeletePast: boolean;
}

export type TournamentTier = 'block' | 'key' | 'all';

export const DEFAULT_PREFS: CalendarPrefs = {
  reminderMinutes: 60,
  // The ORIGINAL THREE TIMES as the default set (owner directive
  // 2026-08-28, reversing the slots-off default): 1 hour, 6 hours, a
  // day — the intervals the app always offered. Deliberate consequence,
  // owner-accepted: an upgrading install's synced events gain the two
  // extra alarms on their next sync.
  extraReminders: [360, 1440],
  allDayReminder: null,
  eventStyle: 'timed',
  // Conservative default (ten-rules brief): a full race weekend is 5+
  // events — opt INTO the flood, never discover it. Stored prefs are
  // untouched; this only shapes new installs.
  seriesSessions: 'race-only',
  // Key rounds is the RULED default (Round 3 B3, finalised model).
  // Deliberate consequence, owner-accepted: an existing install's
  // tournament blocks morph into bookends on the next sync (same
  // fixture id, so the block UPDATES in place to the opening note).
  tournamentTier: 'key',
  // Never on without an explicit opt-in.
  autoDeletePast: false,
};

// `short` is the form a one-row control uses: the durations have to fit
// side by side, and a segment reading "15 minutes before" is a paragraph
// wearing a chip. Preferences keeps the long form, where there is room.
// SPORTS-SHAPED INTERVALS (Prompt 24 B2). 15m/30m were "already
// watching" times — by fifteen minutes out you either have plans or you
// don't. The set now covers the three real decisions a fixture asks of
// you: plan the day (1d), arrange the evening (6h), leave the house or
// sit down (1h). Off stays a real choice rather than a fifth interval.
// A stored 15 or 30 from before this change keeps working — the engine
// honours any minutes value; the chips simply show no selection, which
// is honest about a value the set no longer offers.
// Labels ride the offset functions below — the same catalog-backed
// vocabulary the chips and pickers use, so one key set serves all.
export const REMINDER_OPTIONS: Array<{
  label: string;
  short: string;
  value: number | null;
}> = [
  { label: t('calendar.reminder.none'), short: t('calendar.offset.off'), value: null },
  { label: offsetLabel(60), short: offsetShortLabel(60), value: 60 },
  { label: offsetLabel(360), short: offsetShortLabel(360), value: 360 },
  { label: offsetLabel(1440), short: offsetShortLabel(1440), value: 1440 },
];

// The all-day counterpart, same shape so the same controls render it.
export const ALL_DAY_REMINDER_OPTIONS: Array<{
  label: string;
  short: string;
  value: AllDayReminder;
}> = [
  { label: t('calendar.reminder.none'), short: t('calendar.offset.off'), value: null },
  {
    label: t('calendar.allDayReminder.eveningBefore'),
    short: t('calendar.allDayReminder.eveningBeforeShort'),
    value: 'day-before',
  },
  {
    label: t('calendar.allDayReminder.morningOf'),
    short: t('calendar.allDayReminder.morningOfShort'),
    value: 'morning-of',
  },
];

// ─── Offset vocabulary (Stage 5 wheel pickers) ────────────────────────
//
// FREE RANGE (owner directive 2026-08-28, superseding the brief's
// 12-hour stepping beyond 24): minutes 1–59 and hours 1–72, both in
// single steps — the stepped grid read as the wheel "not allowing free
// choice". Everything is STORED as minutes; the wheels are a view.

export const OFFSET_MINUTE_VALUES: readonly number[] = Array.from(
  { length: 59 },
  (_, i) => i + 1,
);

export const OFFSET_HOUR_VALUES: readonly number[] = Array.from(
  { length: 72 },
  (_, i) => i + 1,
);

// "45 min before" / "2 hours before" / "1 day before" / "36 hours
// before". Days only where the offset IS whole days — 36h said as
// "1.5 days" reads like arithmetic, not a reminder.
export function offsetLabel(minutes: number | null): string {
  if (minutes === null) return t('calendar.offset.off');
  if (minutes < 60) return t('calendar.offset.minBefore', { n: minutes });
  if (minutes % 1440 === 0) {
    return tn('calendar.offset.daysBefore', minutes / 1440);
  }
  return tn('calendar.offset.hoursBefore', minutes / 60);
}

// The chip form: "45m", "2h", "1d", "36h".
export function offsetShortLabel(minutes: number): string {
  if (minutes < 60) return t('calendar.offset.shortMinutes', { n: minutes });
  if (minutes % 1440 === 0) {
    return t('calendar.offset.shortDays', { n: minutes / 1440 });
  }
  return t('calendar.offset.shortHours', { n: minutes / 60 });
}

// The dropdown form (Stage 5 redesign, mock-canonical): "15 m",
// "5 hrs", "1 day" — whole-day multiples say days (24/48/72h), 36 and
// 60 stay in hrs, and an off slot reads "Off".
export function offsetPickerLabel(minutes: number | null): string {
  if (minutes === null) return t('calendar.offset.off');
  if (minutes < 60) return t('calendar.offset.pickerMinutes', { n: minutes });
  if (minutes % 1440 === 0) {
    return tn('calendar.offset.pickerDays', minutes / 1440);
  }
  return tn('calendar.offset.pickerHours', minutes / 60);
}

// Every configured offset, deduped in slot order — what a hero card's
// reminder chips display and what an unoverridden timed event carries.
export function reminderSlotValues(prefs: CalendarPrefs): number[] {
  const out: number[] = [];
  for (const m of [prefs.reminderMinutes, ...prefs.extraReminders]) {
    if (m !== null && !out.includes(m)) out.push(m);
  }
  return out;
}
