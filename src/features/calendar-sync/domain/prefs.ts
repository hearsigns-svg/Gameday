// Calendar preference types + defaults. PURE — no storage imports here
// (the domain layer is jest-testable without native modules). Load/save
// lives in data/prefsStore.ts.

export interface CalendarPrefs {
  reminderMinutes: number | null; // null = no reminder
  eventStyle: 'timed' | 'all-day';
  seriesSessions: 'all' | 'race-only'; // F1-style series: include practice/quali?
  // Opt-in removal of events for fixtures that finished more than
  // PAST_RETENTION_DAYS ago. OFF unless the user turns it on: deleting
  // somebody's record of games they went to is not a default.
  autoDeletePast: boolean;
}

export const DEFAULT_PREFS: CalendarPrefs = {
  reminderMinutes: 60,
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
export const REMINDER_OPTIONS: Array<{
  label: string;
  short: string;
  value: number | null;
}> = [
  { label: 'None', short: 'Off', value: null },
  { label: '15 minutes before', short: '15m', value: 15 },
  { label: '30 minutes before', short: '30m', value: 30 },
  { label: '1 hour before', short: '1h', value: 60 },
];
