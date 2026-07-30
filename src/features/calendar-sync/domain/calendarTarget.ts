// Where fixtures are written — see docs/CALENDAR_TARGET.md.
//
// The product promise is that fixtures land in the calendar you
// already use and follow you across devices. That means the target
// must live in a CLOUD account wherever one exists. PURE: no native
// modules, no I/O — the driver stays thin and this is what the tests
// pin.

export type SourceKind = 'cloud' | 'device' | 'unwritable';

// expo-calendar SourceType values (verified in 57.0.1).
const CLOUD_SOURCES = new Set(['caldav', 'mobileme', 'exchange']);
const NEVER_WRITE = new Set(['subscribed', 'birthdays']);

export interface CalendarLike {
  id: string;
  title: string;
  allowsModifications?: boolean;
  isPrimary?: boolean;
  source?: { id?: string; name?: string; type?: string };
  // Android account fields
  accountName?: string;
  accountType?: string;
}

export function sourceKindOf(cal: CalendarLike): SourceKind {
  const type = (cal.source?.type ?? '').toLowerCase();
  const account = (cal.accountType ?? '').toLowerCase();
  if (cal.allowsModifications === false) return 'unwritable';
  if (NEVER_WRITE.has(type)) return 'unwritable';
  // Android: a Google account calendar is cloud-backed regardless of
  // what the (often empty) source type says.
  if (account && account !== 'local') return 'cloud';
  if (CLOUD_SOURCES.has(type)) return 'cloud';
  return 'device';
}

export const isWritable = (cal: CalendarLike): boolean =>
  sourceKindOf(cal) !== 'unwritable';

// A label for the account/source a calendar belongs to, for the picker
// and for the honest consequence line.
export function accountLabelOf(cal: CalendarLike): string {
  return (
    cal.accountName ||
    cal.source?.name ||
    (sourceKindOf(cal) === 'device' ? 'On this device' : 'Calendar')
  );
}

// The one line that tells the truth about what choosing this means.
// Every string here must be true in the mode it appears in — the
// permission screen's old "your other calendars are never touched" was
// not, once a user calendar can be the target.
export function consequenceOf(cal: CalendarLike, ours: boolean): string {
  const kind = sourceKindOf(cal);
  if (kind === 'device') {
    return "On this device only — won't appear on your other devices";
  }
  return ours
    ? `${accountLabelOf(cal)} — syncs to your other devices`
    : `${accountLabelOf(cal)} — fixtures appear alongside your own events`;
}

export interface TargetChoice {
  calendarId: string | null; // null = create our own
  createInSourceId?: string; // iOS: which source to create in
  reason:
    | 'existing-ours' // our calendar already exists — keep it
    | 'google-primary' // Android: write into their Google calendar
    | 'create-cloud' // iOS: create ours in a cloud source
    | 'create-local'; // no cloud account anywhere — device only
}

// MINIMUM FRICTION: nobody should have to choose anything to get a
// working app. This picks the best target automatically; the picker
// exists only for people with a real choice to make.
export function chooseDefaultTarget(
  calendars: readonly CalendarLike[],
  ourTitles: readonly string[],
  platform: 'ios' | 'android',
): TargetChoice {
  const writable = calendars.filter(isWritable);

  // 1. A calendar we already own always wins — never strand events.
  const ours = writable.find((c) => ourTitles.includes(c.title));
  if (ours) return { calendarId: ours.id, reason: 'existing-ours' };

  if (platform === 'android') {
    // 2. Android cannot CREATE a calendar inside a Google account
    // (only Google's sync adapter can), so we write into one. Prefer
    // the primary; otherwise the first Google-account calendar.
    const google = writable.filter(
      (c) => (c.accountType ?? '').toLowerCase() === 'com.google',
    );
    const primary = google.find((c) => c.isPrimary) ?? google[0];
    if (primary) return { calendarId: primary.id, reason: 'google-primary' };
    return { calendarId: null, reason: 'create-local' };
  }

  // 3. iOS CAN create in a cloud source — dedicated AND synced, with
  // the user doing nothing. Prefer the source their default calendar
  // uses when that is already cloud, so we land where they expect.
  const cloud = writable.filter((c) => sourceKindOf(c) === 'cloud');
  const sourceId = cloud.find((c) => c.isPrimary)?.source?.id ?? cloud[0]?.source?.id;
  if (sourceId) {
    return { calendarId: null, createInSourceId: sourceId, reason: 'create-cloud' };
  }
  return { calendarId: null, reason: 'create-local' };
}

// Picker rows, grouped by account and stably ordered. Two accounts can
// hold same-named calendars ("Personal"), so the account label must
// always be shown, never inferred from the title.
export interface PickerGroup {
  account: string;
  calendars: CalendarLike[];
}

export function groupForPicker(
  calendars: readonly CalendarLike[],
): PickerGroup[] {
  const groups = new Map<string, CalendarLike[]>();
  for (const c of calendars.filter(isWritable)) {
    const key = accountLabelOf(c);
    const bucket = groups.get(key);
    if (bucket) bucket.push(c);
    else groups.set(key, [c]);
  }
  return [...groups.entries()]
    .map(([account, cals]) => ({
      account,
      calendars: [...cals].sort((a, b) => a.title.localeCompare(b.title)),
    }))
    // Cloud accounts first — they are what the promise is about.
    .sort((a, b) => {
      const aCloud = a.calendars.some((c) => sourceKindOf(c) === 'cloud');
      const bCloud = b.calendars.some((c) => sourceKindOf(c) === 'cloud');
      return Number(bCloud) - Number(aCloud) || a.account.localeCompare(b.account);
    });
}
