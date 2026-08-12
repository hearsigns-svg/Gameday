// Calendar preference types + defaults. PURE — no storage imports here
// (the domain layer is jest-testable without native modules). Load/save
// lives in data/prefsStore.ts.

// A reminder for an event whose TIME nobody has published yet. "N
// minutes before" is meaningless against a midnight day sentinel, so
// all-day entries get day-shaped choices anchored to civil hours
// instead: the evening before at 6pm, or the morning of at 9am. The
// hours are fixed, not configurable — two more knobs would outweigh the
// feature (24-review round, Prompt 24).
export type AllDayReminder = 'day-before' | 'morning-of' | null;

export interface CalendarPrefs {
  reminderMinutes: number | null; // null = no reminder
  // For all-day entries. Defaults to NONE: turning it on adds an alarm
  // to every date-only fixture in the calendar, which is a choice, not
  // an upgrade side-effect — a default of 'day-before' would have
  // rewritten every all-day event on the first sync after this shipped.
  allDayReminder: AllDayReminder;
  eventStyle: 'timed' | 'all-day';
  seriesSessions: 'all' | 'race-only'; // F1-style series: include practice/quali?
  // Opt-in removal of events for fixtures that finished more than
  // PAST_RETENTION_DAYS ago. OFF unless the user turns it on: deleting
  // somebody's record of games they went to is not a default.
  autoDeletePast: boolean;
}

export const DEFAULT_PREFS: CalendarPrefs = {
  reminderMinutes: 60,
  allDayReminder: null,
  eventStyle: 'timed',
  // Conservative default (ten-rules brief): a full race weekend is 5+
  // events — opt INTO the flood, never discover it. Stored prefs are
  // untouched; this only shapes new installs.
  seriesSessions: 'race-only',
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
export const REMINDER_OPTIONS: Array<{
  label: string;
  short: string;
  value: number | null;
}> = [
  { label: 'None', short: 'Off', value: null },
  { label: '1 hour before', short: '1h', value: 60 },
  { label: '6 hours before', short: '6h', value: 360 },
  { label: '1 day before', short: '1d', value: 1440 },
];

// The all-day counterpart, same shape so the same controls render it.
export const ALL_DAY_REMINDER_OPTIONS: Array<{
  label: string;
  short: string;
  value: AllDayReminder;
}> = [
  { label: 'None', short: 'Off', value: null },
  { label: 'Evening before, 6pm', short: 'Eve before', value: 'day-before' },
  { label: 'Morning of, 9am', short: 'Morning', value: 'morning-of' },
];
