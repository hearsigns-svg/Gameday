// Fixture reminders as SYSTEM notifications — the pure plan. No expo, no
// firebase: this file decides WHAT should be pending on the device;
// data/notificationScheduler.ts is the only place that talks to the OS.
//
// Platform facts the plan encodes (Round 5 Stage 2):
//   - iOS keeps at most 64 pending local notifications per app and drops
//     the rest silently, soonest-firing kept. The plan caps at PENDING_CAP
//     with headroom and keeps the SOONEST, so what iOS would keep and what
//     we asked for are the same set.
//   - Android alarms are inexact (no SCHEDULE_EXACT_ALARM): a reminder is
//     "about N minutes before", never a stopwatch. The reschedule
//     tolerance below is a minute for the same reason.
//
// Time is UTC milliseconds throughout — ISO strings in, epoch ms out.
// Nothing here constructs a local Date.

export interface ReminderFixture {
  id: string;
  title: string;
  startUtc: string; // ISO 8601
  status: string;
  timePrecision?: string;
}

export const NOTIFICATION_ID_PREFIX = 'fixture:';

// Headroom under iOS's 64-pending ceiling.
export const PENDING_CAP = 50;

// A pending notification whose fire time is within this of the desired
// one is left alone; beyond it (or unreadable) it is cancelled and
// rescheduled. Anything tighter would churn on Android's inexact alarms
// and on iOS's whole-second trigger truncation.
export const RESCHEDULE_TOLERANCE_MS = 60_000;

export interface DesiredNotification {
  identifier: string;
  fixtureId: string;
  fireAtMs: number;
  title: string;
  body: string;
}

// What the OS reports as pending. fireAtMs is null when the trigger
// could not be read back as an absolute time.
export interface ScheduledNotification {
  identifier: string;
  fireAtMs: number | null;
}

const NOT_NOTIFIABLE_STATUSES: ReadonlySet<string> = new Set([
  'cancelled',
  'postponed',
]);

// A fixture earns a reminder only when it has a real start instant. A
// day-only sentinel would ring at midnight-minus-N; a cancelled or
// postponed fixture has nothing to be reminded of.
export function isNotifiable(f: ReminderFixture): boolean {
  if (NOT_NOTIFIABLE_STATUSES.has(f.status)) return false;
  if (f.timePrecision === 'date_only') return false;
  return true;
}

export function notificationIdentifier(fixtureId: string): string {
  return NOTIFICATION_ID_PREFIX + fixtureId;
}

export function isOurIdentifier(identifier: string): boolean {
  return identifier.startsWith(NOTIFICATION_ID_PREFIX);
}

export function fixtureIdOfIdentifier(identifier: string): string | null {
  return isOurIdentifier(identifier)
    ? identifier.slice(NOTIFICATION_ID_PREFIX.length)
    : null;
}

export interface DesiredNotificationOptions {
  nowMs: number;
  minutesBefore: number;
  excluded?: ReadonlySet<string>;
  cap?: number;
  body: (f: ReminderFixture, minutesBefore: number) => string;
  title?: (f: ReminderFixture) => string;
}

const defaultTitle = (f: ReminderFixture): string => f.title;

// The soonest `cap` reminders that should exist right now. Skips excluded
// ids, non-notifiable fixtures, unparseable starts, and anything that
// would already have fired. Deduplicates by fixture id (first record
// wins). Output is sorted by fire time ascending, ties by id.
export function desiredNotifications(
  fixtures: readonly ReminderFixture[],
  opts: DesiredNotificationOptions,
): DesiredNotification[] {
  const cap = opts.cap ?? PENDING_CAP;
  const title = opts.title ?? defaultTitle;
  const seen = new Set<string>();
  const out: DesiredNotification[] = [];

  for (const f of fixtures) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    if (opts.excluded?.has(f.id)) continue;
    if (!isNotifiable(f)) continue;
    const startMs = Date.parse(f.startUtc);
    if (!Number.isFinite(startMs)) continue;
    const fireAtMs = startMs - opts.minutesBefore * 60_000;
    if (fireAtMs <= opts.nowMs) continue;
    out.push({
      identifier: notificationIdentifier(f.id),
      fixtureId: f.id,
      fireAtMs,
      title: title(f),
      body: opts.body(f, opts.minutesBefore),
    });
  }

  out.sort(byFireTime);
  return cap >= out.length ? out : out.slice(0, Math.max(0, cap));
}

function byFireTime(a: DesiredNotification, b: DesiredNotification): number {
  if (a.fireAtMs !== b.fireAtMs) return a.fireAtMs - b.fireAtMs;
  if (a.fixtureId === b.fixtureId) return 0;
  return a.fixtureId < b.fixtureId ? -1 : 1;
}

export interface NotificationDiff {
  toCancel: string[];
  toSchedule: DesiredNotification[];
}

// What to cancel and what to schedule so that the OS's pending set
// becomes exactly `desired`. Only identifiers carrying our prefix are
// ever cancelled — every other pending notification on the device is
// invisible to this diff. Idempotent: once applied, the same inputs
// diff to nothing.
export function diffNotifications(
  desired: readonly DesiredNotification[],
  scheduled: readonly ScheduledNotification[],
): NotificationDiff {
  const desiredById = new Map<string, DesiredNotification>();
  for (const d of desired) {
    if (!desiredById.has(d.identifier)) desiredById.set(d.identifier, d);
  }

  const toCancel = new Set<string>();
  const toSchedule = new Map<string, DesiredNotification>();
  const present = new Set<string>();

  for (const s of scheduled) {
    if (!isOurIdentifier(s.identifier)) continue;
    present.add(s.identifier);
    const d = desiredById.get(s.identifier);
    if (!d) {
      toCancel.add(s.identifier);
      continue;
    }
    const drifted =
      s.fireAtMs === null ||
      Math.abs(s.fireAtMs - d.fireAtMs) >= RESCHEDULE_TOLERANCE_MS;
    if (drifted) {
      toCancel.add(s.identifier);
      toSchedule.set(d.identifier, d);
    }
  }

  for (const d of desiredById.values()) {
    if (!present.has(d.identifier)) toSchedule.set(d.identifier, d);
  }

  return {
    toCancel: [...toCancel],
    toSchedule: [...toSchedule.values()].sort(byFireTime),
  };
}
