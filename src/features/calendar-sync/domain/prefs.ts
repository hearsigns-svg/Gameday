// Calendar preference types + defaults. PURE — no storage imports here
// (the domain layer is jest-testable without native modules). Load/save
// lives in data/prefsStore.ts.

export interface CalendarPrefs {
  reminderMinutes: number | null; // null = no reminder
  eventStyle: 'timed' | 'all-day';
  seriesSessions: 'all' | 'race-only'; // F1-style series: include practice/quali?
}

export const DEFAULT_PREFS: CalendarPrefs = {
  reminderMinutes: 60,
  eventStyle: 'timed',
  seriesSessions: 'all',
};

export const REMINDER_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: 'None', value: null },
  { label: '15 minutes before', value: 15 },
  { label: '30 minutes before', value: 30 },
  { label: '1 hour before', value: 60 },
];
