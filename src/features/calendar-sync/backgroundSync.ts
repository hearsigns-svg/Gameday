// Background propagation layers 1 and 2: silent-push wake and periodic
// background refresh. Task definitions run at module scope so headless
// launches find them — this module is imported from App.tsx.
//
// Failures here are logged, never swallowed: a propagation layer that
// quietly stops working looks identical to one that never fired.

import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { rnfbMessagingAvailable } from './rnfbPresence';
import { runSync, shouldAutoSync } from './syncEngine';

const REFRESH_TASK = 'gameday-refresh';
const PUSH_SYNC_TASK = 'gameday-push-sync';

// RNFB's background message handler, BOTH platforms — for two different
// reasons, and the Android one was found on hardware (Prompt 26 §2).
//
// ANDROID: RNFB's FirebaseMessagingService wins the merged-manifest
// intent, so a background data message is dispatched to RNFB's OWN
// headless task — never to the expo-notifications task below. With no
// handler registered, the first real silent push on a physical Pixel
// unfroze the app ("sync unfroze com.hearsigns.Gameday") and then logged
// "No task registered for key ReactNativeFirebaseMessagingHeadlessTask"
// and did nothing: delivery proven, propagation dead. The handler IS the
// Android background path, so here it does the real work.
//
// iOS: RNFB swizzles the remote-notification delegate and holds the
// system completion handler for a FULL 25 SECONDS per silent push when
// no handler is registered — pressing against iOS's ~30s budget on
// every sweep fan-out. The sync work stays with the expo-notifications
// task below (which iOS DOES route); this handler only needs to exist
// and resolve fast.
//
// Guarded lazy require, same rule as deviceRegistry: a pre-RNFB binary
// must not crash. Module scope on purpose — a HEADLESS launch (app
// killed, push arrives) loads the bundle and runs only what module
// scope registered.
if (rnfbMessagingAvailable()) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getMessaging, setBackgroundMessageHandler } =
      require('@react-native-firebase/messaging');
    setBackgroundMessageHandler(getMessaging(), async () => {
      if (Platform.OS === 'ios') {
        console.log('[gameday] fcm background message received');
        return;
      }
      console.log('[gameday] fcm background message received — syncing');
      if (shouldAutoSync()) {
        const r = await runSync();
        console.log(
          `[gameday] background push sync: ${r.ok ? JSON.stringify(r.value) : r.error.kind}`,
        );
      }
    });
  } catch (e) {
    console.warn('[gameday] fcm background handler unavailable:', String(e));
  }
}

TaskManager.defineTask(REFRESH_TASK, async () => {
  console.log('[gameday] background refresh task fired');
  if (shouldAutoSync()) await runSync();
  return BackgroundTask.BackgroundTaskResult.Success;
});

TaskManager.defineTask(PUSH_SYNC_TASK, async ({ data, error }) => {
  console.log(
    `[gameday] push task fired: ${JSON.stringify(data ?? null)} err=${String(error ?? 'none')}`,
  );
  if (shouldAutoSync()) {
    const r = await runSync();
    console.log(
      `[gameday] push sync result: ${r.ok ? JSON.stringify(r.value) : r.error.kind}`,
    );
  }
});

export async function registerBackgroundSync(): Promise<void> {
  try {
    await BackgroundTask.registerTaskAsync(REFRESH_TASK, {
      minimumInterval: 60 * 12, // minutes; OS decides actual cadence
    });
    console.log('[gameday] background refresh registered');
  } catch (e) {
    // Background refresh unavailable (e.g. disabled by user) — layers 1
    // and 3 still cover propagation.
    console.warn('[gameday] background refresh unavailable:', String(e));
  }
  try {
    await Notifications.registerTaskAsync(PUSH_SYNC_TASK);
    console.log('[gameday] push task registered');
  } catch (e) {
    // Push wake unavailable — layers 2 and 3 still cover propagation.
    console.warn('[gameday] push task unavailable:', String(e));
  }
}
