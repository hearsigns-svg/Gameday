// Reconcile the device's pending reminders with what should exist — the
// entry point the sync engine calls after every fixture refresh. Two
// gates before any OS call, both silent: the user's own choice, then
// the OS permission (read, never requested — the dialog belongs to the
// screen where the user opts in).

import { reminderChoice } from './data/reminderChoice';
import {
  applyNotificationDiff,
  ensureFixturesChannel,
  listScheduledFixtureNotifications,
  readNotificationPermission,
} from './data/notificationScheduler';
import {
  desiredNotifications,
  diffNotifications,
  ReminderFixture,
} from './domain/reminderPlan';
import { ok, Result } from '../../core/result';

export interface ReconcileOptions {
  nowMs: number;
  minutesBefore: number;
  excluded?: ReadonlySet<string>;
  body: (f: ReminderFixture, minutesBefore: number) => string;
  // Localised Android channel name; when given, the channel is ensured
  // before anything new is scheduled. No-op off Android.
  channelName?: string;
}

export interface ReconcileOutcome {
  scheduled: number;
  cancelled: number;
  skipped: 'choice' | 'permission' | null;
}

export async function reconcileFixtureReminders(
  fixtures: readonly ReminderFixture[],
  opts: ReconcileOptions,
): Promise<Result<ReconcileOutcome>> {
  if (reminderChoice() !== 'enabled') {
    return ok({ scheduled: 0, cancelled: 0, skipped: 'choice' });
  }
  const permission = await readNotificationPermission();
  if (permission.status !== 'granted') {
    return ok({ scheduled: 0, cancelled: 0, skipped: 'permission' });
  }

  const listed = await listScheduledFixtureNotifications();
  if (!listed.ok) return listed;

  const desired = desiredNotifications(fixtures, {
    nowMs: opts.nowMs,
    minutesBefore: opts.minutesBefore,
    excluded: opts.excluded,
    body: opts.body,
  });
  const diff = diffNotifications(desired, listed.value);

  if (opts.channelName !== undefined && diff.toSchedule.length > 0) {
    await ensureFixturesChannel(opts.channelName);
  }
  const applied = await applyNotificationDiff(diff);
  if (!applied.ok) return applied;

  console.log(
    `[gameday] reminders reconciled: ${desired.length} desired, ${listed.value.length} were pending, ` +
      `${applied.value.scheduled} scheduled, ${applied.value.cancelled} cancelled`,
  );
  return ok({ ...applied.value, skipped: null });
}
