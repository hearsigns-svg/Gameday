// Device registry: tells the backend what this device follows and where
// to push. One doc per anonymous uid; the Cloud Scheduler sweep unions
// pollPaths across devices and fans out silent pushes by followKeys.
//
// Every step is bounded: a hung push-token request or auth handshake
// must never leave registration silently pending forever.

import * as Notifications from 'expo-notifications';
import { doc, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import { db, ensureSignedIn } from '../../../core/firebase';
import { readJson, writeJson } from '../../../core/storage';
import { collectFollowState } from '../../follows/followActions';
import {
  registryOverflow,
  REGISTRY_KEY_LIMIT,
} from '../domain/registryLimits';

export { registryOverflow, REGISTRY_KEY_LIMIT };

const REGISTRY_ERROR_KEY = 'deviceRegistry.lastError.v1';

const STEP_TIMEOUT_MS = 15_000;

// Surfaced by Preferences so the failure is visible rather than logged
// into the void. Null when the last registration succeeded.
export function lastRegistryError(): string | null {
  return readJson<string | null>(REGISTRY_ERROR_KEY, null);
}

function setRegistryError(message: string | null): void {
  writeJson(REGISTRY_ERROR_KEY, message);
}

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), STEP_TIMEOUT_MS),
    ),
  ]);
}

export async function registerDevice(): Promise<void> {
  try {
    const uid = await withTimeout(ensureSignedIn(), 'anonymous sign-in');
    if (!uid) return;

    let token: string | null = null;
    let tokenType: string | null = null;
    try {
      const t = await withTimeout(
        Notifications.getDevicePushTokenAsync(),
        'push token',
      );
      token = t.data as string;
      // Android hands back an FCM registration token (sendable by the
      // Admin SDK); iOS hands back a raw APNs token, which it cannot
      // send to. Recorded honestly so the sweep skips rather than
      // silently failing — iOS push needs an FCM token (M6 follow-up).
      tokenType = t.type === 'ios' ? 'apns' : 'fcm';
    } catch (e) {
      // Simulators and push-less devices — register without a token so
      // the sweep still polls this device's follows.
      console.warn('[gameday] push token unavailable:', String(e));
    }

    const { followKeys, pollPaths } = collectFollowState();
    const overflow = registryOverflow(followKeys, pollPaths);
    if (overflow) {
      // Fail loudly and STOP. Attempting the write would be rejected by
      // rules anyway; the point is that the device now knows, and says so.
      const message =
        `Too many follows to keep in sync (${Math.max(overflow.followKeys, overflow.pollPaths)} of ${overflow.limit}). ` +
        'Unfollow something and this will clear.';
      console.error(`[kickoffcal] device registration blocked: ${message}`);
      setRegistryError(message);
      return;
    }
    await withTimeout(
      setDoc(doc(db, 'devices', uid), {
        token,
        tokenType,
        platform: Platform.OS,
        followKeys,
        pollPaths,
        updatedAt: new Date().toISOString(),
      }),
      'registry write',
    );
    setRegistryError(null);
    console.log(
      `[gameday] device registered: ${followKeys.length} follows, ${pollPaths.length} paths, token=${tokenType ?? 'none'}`,
    );
  } catch (e) {
    // Best-effort (the next app start retries) — but never silent: a
    // registry that stops working must be visible, not invisible.
    console.error('[kickoffcal] device registration failed:', String(e));
    setRegistryError(
      'Your follows could not be registered for background updates — we will retry.',
    );
  }
}
