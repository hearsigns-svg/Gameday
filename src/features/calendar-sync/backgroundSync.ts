// Background propagation layers 1 and 2: silent-push wake and periodic
// background refresh. Task definitions run at module scope so headless
// launches find them — this module is imported from App.tsx.

import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { runSync, shouldAutoSync } from './syncEngine';

const REFRESH_TASK = 'gameday-refresh';
const PUSH_SYNC_TASK = 'gameday-push-sync';

TaskManager.defineTask(REFRESH_TASK, async () => {
  if (shouldAutoSync()) await runSync();
  return BackgroundTask.BackgroundTaskResult.Success;
});

TaskManager.defineTask(PUSH_SYNC_TASK, async () => {
  if (shouldAutoSync()) await runSync();
});

export async function registerBackgroundSync(): Promise<void> {
  try {
    await BackgroundTask.registerTaskAsync(REFRESH_TASK, {
      minimumInterval: 60 * 12, // minutes; OS decides actual cadence
    });
  } catch {
    // Background refresh unavailable (e.g. disabled by user) — layers 1
    // and 3 still cover propagation.
  }
  try {
    await Notifications.registerTaskAsync(PUSH_SYNC_TASK);
  } catch {
    // Push wake unavailable — layers 2 and 3 still cover propagation.
  }
}
