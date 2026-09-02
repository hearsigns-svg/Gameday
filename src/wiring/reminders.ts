// Composition layer (not a feature — like App.tsx it may reach across
// features): wires the reminders channel to the sync engine.
//
// Called once at app start: the foreground presentation handler, the
// Android channel, and the subscription that reconciles notifications
// after EVERY sync path. The reconcile never prompts — it runs only when
// the user has turned reminders on (reminderChoice 'enabled') and the OS
// grant holds. ONE slot: Free = the fixed default; Premium = the user's
// first slot (Round 5 model).
import { DEFAULT_PREFS, offsetLabel } from '../features/calendar-sync/domain/prefs';
import { onFixturesRefreshed } from '../features/calendar-sync/syncEngine';
import { timePrecisionOf } from '../features/fixtures/domain/horizon';
import { premiumLocked } from '../core/entitlementStore';
import { t } from '../core/i18n';
import {
  ensureFixturesChannel,
  installForegroundHandler,
} from '../features/reminders/data/notificationScheduler';
import { reconcileFixtureReminders } from '../features/reminders/reconcile';

// The Free channel's fixed default; DEFAULT_PREFS types the slot as
// nullable (a Premium user may switch slot one off), so pin it here.
const FREE_SLOT_MINUTES = DEFAULT_PREFS.reminderMinutes ?? 60;

let installed = false;

export function installFixtureReminders(): void {
  if (installed) return;
  installed = true;
  installForegroundHandler();
  void ensureFixturesChannel(t('settings.reminders.title'));
  onFixturesRefreshed(async ({ fixtures, prefs, excluded }) => {
    const minutesBefore = premiumLocked()
      ? FREE_SLOT_MINUTES
      : (prefs.reminderMinutes ?? FREE_SLOT_MINUTES);
    await reconcileFixtureReminders(
      fixtures.map((f) => ({
        id: f.id,
        title: f.title,
        startUtc: f.startUtc,
        status: f.status,
        // The ONE definition of date-only (horizon.ts): a legacy doc with
        // no precision but a TBD status is date-only too.
        timePrecision: timePrecisionOf(f),
      })),
      {
        nowMs: Date.now(),
        minutesBefore,
        excluded,
        body: (_f, m) => t('reminders.notification.body', { when: offsetLabel(m) }),
      },
    );
  });
}
