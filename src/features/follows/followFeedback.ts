// One place for what happens AFTER a follow/unfollow: the toast moment,
// the undo path, and the in-context calendar ask. Every follow surface
// (pills, browse rows) routes through here so the behaviour never
// drifts between screens.

import * as Haptics from 'expo-haptics';
import { t, tn } from '../../core/i18n';
import { Result } from '../../core/result';
import { showToast } from '../../core/toast';
import { calendarChoice } from '../calendar-sync/data/calendarChoice';
import { SyncOutcome } from '../calendar-sync/syncEngine';
import { refollow, unfollow } from './followActions';
import { Followable } from './data/followStore';

export function followFeedback(
  r: Result<SyncOutcome>,
  item: Followable,
  wasFollow: boolean,
  openCalendarPriming: () => void,
): void {
  if (!r.ok) {
    // Coalesced into an in-flight sync: the change is saved and a
    // queued re-run applies it. The first-ever follow still deserves
    // the calendar ask — the ask is about the choice, not the run.
    if (r.error.kind === 'sync-in-progress') {
      if (wasFollow && calendarChoice() === 'unset') {
        openCalendarPriming();
      } else {
        showToast({
          message: wasFollow
            ? t('follows.feedback.followingUpdating', { name: item.label })
            : t('follows.feedback.unfollowedUpdating', { name: item.label }),
        });
      }
    }
    return; // other errors: callers surface them
  }

  if (!wasFollow) {
    showToast({
      message: t('follows.feedback.unfollowed', { name: item.label }),
      action: { label: t('follows.undo'), onPress: () => void refollow(item) },
    });
    return;
  }

  if (r.value.calendarSkipped) {
    if (calendarChoice() === 'unset') {
      // First follow ever: this IS the moment the calendar question
      // makes sense — ask once, primed, skippable.
      openCalendarPriming();
    } else {
      showToast({
        message: t('follows.feedback.calendarOff', { name: item.label }),
        action: { label: t('follows.feedback.enable'), onPress: openCalendarPriming },
      });
    }
    return;
  }

  if (r.value.created > 0) {
    // The one moment worth a haptic: games just landed in the calendar.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => undefined,
    );
    showToast({
      message: tn('follows.feedback.added', r.value.created),
      action: { label: t('follows.undo'), onPress: () => void unfollow(item) },
    });
  } else {
    // Off-season honesty: followed, nothing to add yet. There is no
    // retired variant of this — a retired athlete has no follow control
    // to reach it (owner ruling 2026-08-04, careerStatus.ts).
    showToast({
      message: t('follows.feedback.noUpcoming', { name: item.label }),
    });
  }
}
