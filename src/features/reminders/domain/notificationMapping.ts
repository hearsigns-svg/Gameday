// Pure readers for what expo-notifications hands back — structural types
// only, so this file has no expo import and tests run without the native
// module. data/notificationScheduler.ts feeds it the SDK objects.

import { fixtureIdOfIdentifier } from './reminderPlan';

export type PermissionState = {
  status: 'granted' | 'denied' | 'undetermined';
  canAskAgain: boolean;
};

// getPermissionsAsync threw or the module was absent. A combination that
// never occurs naturally (an undetermined OS state is always askable), so
// a reader can tell "unreadable" from "not yet asked" — and nothing
// prompts on it.
export const UNREADABLE_PERMISSION: PermissionState = {
  status: 'undetermined',
  canAskAgain: false,
};

// UNAuthorizationStatus raw values. expo-notifications' iOS requester maps
// only .authorized → 'granted' and .denied → 'denied'; provisional and
// ephemeral come back as 'undetermined' with the raw status alongside.
// Both DO deliver notifications, so they count as granted here.
export const IOS_AUTHORIZATION_PROVISIONAL = 3;
export const IOS_AUTHORIZATION_EPHEMERAL = 4;

export interface PermissionResponseLike {
  status: string;
  granted?: boolean;
  canAskAgain?: boolean;
  ios?: { status?: number } | null;
}

export function permissionStateOf(r: PermissionResponseLike): PermissionState {
  const iosStatus = r.ios?.status;
  const granted =
    r.status === 'granted' ||
    r.granted === true ||
    iosStatus === IOS_AUTHORIZATION_PROVISIONAL ||
    iosStatus === IOS_AUTHORIZATION_EPHEMERAL;
  if (granted) return { status: 'granted', canAskAgain: r.canAskAgain ?? false };
  if (r.status === 'denied') {
    return { status: 'denied', canAskAgain: r.canAskAgain ?? false };
  }
  return { status: 'undetermined', canAskAgain: r.canAskAgain ?? true };
}

// The absolute fire time is stamped into content.data at schedule time
// because iOS cannot hand it back: a DATE trigger is built natively as a
// UNTimeIntervalNotificationTrigger and reads back as
// { type: 'timeInterval', seconds } — an interval relative to a moment
// nobody recorded. Android reads back { type: 'date', value: <ms> }.
export const FIRE_AT_DATA_KEY = 'fireAtMs';
export const FIXTURE_ID_DATA_KEY = 'fixtureId';

export interface ScheduledRequestLike {
  identifier: string;
  content?: { data?: Record<string, unknown> | null } | null;
  trigger?: unknown;
}

// The trigger's own absolute time, when it carries one.
export function fireAtMsOfTrigger(trigger: unknown): number | null {
  if (trigger === null || typeof trigger !== 'object') return null;
  const t = trigger as Record<string, unknown>;
  if (t.type !== 'date') return null;
  // Android read-back uses `value`; the JS input shape uses `date`; the
  // native input record uses `timestamp`. Accept all three.
  for (const key of ['value', 'timestamp', 'date']) {
    const ms = asEpochMs(t[key]);
    if (ms !== null) return ms;
  }
  return null;
}

// Trigger first (the OS's own truth), then our stamp, else unreadable.
export function fireAtMsOfRequest(req: ScheduledRequestLike): number | null {
  const fromTrigger = fireAtMsOfTrigger(req.trigger);
  if (fromTrigger !== null) return fromTrigger;
  return asEpochMs(req.content?.data?.[FIRE_AT_DATA_KEY]);
}

function asEpochMs(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v instanceof Date && Number.isFinite(v.getTime())) return v.getTime();
  return null;
}

export interface NotificationResponseLike {
  actionIdentifier?: string;
  notification?: {
    date?: number;
    request?: ScheduledRequestLike;
  } | null;
}

// The fixture a tapped notification points at: the data stamp first, the
// identifier prefix as a fallback. Null for anything that is not ours.
export function fixtureIdOfResponse(
  r: NotificationResponseLike | null | undefined,
): string | null {
  const request = r?.notification?.request;
  if (!request) return null;
  const stamped = request.content?.data?.[FIXTURE_ID_DATA_KEY];
  if (typeof stamped === 'string' && stamped.length > 0) return stamped;
  return fixtureIdOfIdentifier(request.identifier);
}

// One tap can reach JS twice — the response listener and the cold-start
// "last response" both report it. Same identifier + same delivery
// instant is the same tap.
export function responseKey(r: NotificationResponseLike): string {
  const identifier = r.notification?.request?.identifier ?? '';
  const date = r.notification?.date ?? 'undated';
  return `${identifier}@${String(date)}`;
}
