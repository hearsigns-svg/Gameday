// The ONLY file in the app that schedules local notifications. Every
// exported function swallows its own failures into a Result or a
// conservative value — the sync engine calling this must never see a
// throw from the notification stack.
//
// Shares the expo-notifications module with the silent-push path
// (calendar-sync/backgroundSync.ts registerTaskAsync, deviceRegistry.ts
// getDevicePushTokenAsync) and touches none of it: no task registration,
// no token calls, no category or badge changes. The foreground handler
// below only decides presentation of notifications the OS is already
// about to present; a silent push never reaches it.

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { err, ok, Result } from '../../../core/result';
import {
  FIRE_AT_DATA_KEY,
  FIXTURE_ID_DATA_KEY,
  fireAtMsOfRequest,
  fixtureIdOfResponse,
  PermissionState,
  permissionStateOf,
  responseKey,
  UNREADABLE_PERMISSION,
} from '../domain/notificationMapping';
import {
  DesiredNotification,
  isOurIdentifier,
  NotificationDiff,
  ScheduledNotification,
} from '../domain/reminderPlan';

export type { PermissionState };

export const FIXTURES_CHANNEL_ID = 'fixtures';

const TAG = '[gameday] reminders:';

function unknownError(e: unknown): Result<never> {
  return err({ kind: 'unknown', message: String(e) });
}

// Reads the OS state. NEVER prompts — getPermissionsAsync only. iOS
// provisional/ephemeral authorization counts as granted.
export async function readNotificationPermission(): Promise<PermissionState> {
  try {
    return permissionStateOf(await Notifications.getPermissionsAsync());
  } catch (e) {
    console.warn(`${TAG} permission unreadable: ${String(e)}`);
    return UNREADABLE_PERMISSION;
  }
}

// The one place the OS dialog can come from. Callers gate it on the
// user's own choice first (reminderChoice === 'enabled').
export async function requestNotificationPermission(): Promise<PermissionState> {
  try {
    return permissionStateOf(
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: false },
      }),
    );
  } catch (e) {
    console.warn(`${TAG} permission request failed: ${String(e)}`);
    return UNREADABLE_PERMISSION;
  }
}

// Android 8+ routes every notification through a channel; DEFAULT
// importance shows a banner with sound and no heads-up interruption.
// No-op elsewhere. Idempotent — Android lets us rename, nothing more.
export async function ensureFixturesChannel(name: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(FIXTURES_CHANNEL_ID, {
      name,
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch (e) {
    console.warn(`${TAG} channel setup failed: ${String(e)}`);
  }
}

// Everything pending that carries our prefix, with the fire time the OS
// (or our data stamp) can vouch for — null when neither can.
export async function listScheduledFixtureNotifications(): Promise<
  Result<ScheduledNotification[]>
> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    return ok(
      all
        .filter((r) => isOurIdentifier(r.identifier))
        .map((r) => ({
          identifier: r.identifier,
          fireAtMs: fireAtMsOfRequest(r),
        })),
    );
  } catch (e) {
    return unknownError(e);
  }
}

// Cancels, then schedules. Each item stands alone: one failure is logged
// and skipped, never aborts the batch. Counts are successes only.
export async function applyNotificationDiff(
  diff: NotificationDiff,
): Promise<Result<{ cancelled: number; scheduled: number }>> {
  try {
    let cancelled = 0;
    let scheduled = 0;
    for (const identifier of diff.toCancel) {
      try {
        await Notifications.cancelScheduledNotificationAsync(identifier);
        cancelled += 1;
      } catch (e) {
        console.warn(`${TAG} cancel failed for ${identifier}: ${String(e)}`);
      }
    }
    for (const d of diff.toSchedule) {
      try {
        await Notifications.scheduleNotificationAsync(requestFor(d));
        scheduled += 1;
      } catch (e) {
        console.warn(`${TAG} schedule failed for ${d.identifier}: ${String(e)}`);
      }
    }
    return ok({ cancelled, scheduled });
  } catch (e) {
    return unknownError(e);
  }
}

function requestFor(d: DesiredNotification): Notifications.NotificationRequestInput {
  const trigger: Notifications.DateTriggerInput = {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date: new Date(d.fireAtMs),
  };
  if (Platform.OS === 'android') trigger.channelId = FIXTURES_CHANNEL_ID;
  return {
    identifier: d.identifier,
    content: {
      title: d.title,
      body: d.body,
      data: {
        [FIXTURE_ID_DATA_KEY]: d.fixtureId,
        // iOS cannot read a DATE trigger's absolute time back; the diff
        // reads this stamp instead (domain/notificationMapping.ts).
        [FIRE_AT_DATA_KEY]: d.fireAtMs,
      },
    },
    trigger,
  };
}

// Without a handler, a reminder firing while the app is open is dropped
// on the floor. Show it like the OS would: banner, list, sound; the badge
// is never ours to touch.
export function installForegroundHandler(): void {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (e) {
    console.warn(`${TAG} foreground handler unavailable: ${String(e)}`);
  }
}

// Fires `cb` with the fixture id behind every tapped reminder — live taps
// through the response listener, and the tap that cold-started the app
// through the last-response check made once on install. The same tap
// reported by both paths reaches `cb` once. Returns an unsubscribe.
export function onNotificationOpened(
  cb: (fixtureId: string) => void,
): () => void {
  let active = true;
  const handled = new Set<string>();
  const deliver = (response: Notifications.NotificationResponse): void => {
    if (!active) return;
    const fixtureId = fixtureIdOfResponse(response);
    if (!fixtureId) return;
    const key = responseKey(response);
    if (handled.has(key)) return;
    handled.add(key);
    cb(fixtureId);
  };

  let subscription: { remove(): void } | null = null;
  try {
    subscription = Notifications.addNotificationResponseReceivedListener(deliver);
  } catch (e) {
    console.warn(`${TAG} response listener unavailable: ${String(e)}`);
  }

  try {
    const last = Notifications.getLastNotificationResponse();
    if (last) deliver(last);
  } catch (e) {
    console.warn(`${TAG} last response unreadable: ${String(e)}`);
  }

  return () => {
    active = false;
    subscription?.remove();
    subscription = null;
  };
}
