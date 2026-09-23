// One place for what happens AFTER a follow/unfollow: the toast moment,
// the undo path, and the in-context calendar ask. Every follow surface
// (pills, browse rows) routes through here so the behaviour never
// drifts between screens.

import * as Haptics from 'expo-haptics';
import { t, tn } from '../../core/i18n';
import { Result } from '../../core/result';
import { showToast } from '../../core/toast';
import { calendarChoice } from '../calendar-sync/data/calendarChoice';
import { SyncOutcome, upcomingByFollow } from '../calendar-sync/syncEngine';
import { refollow, unfollow } from './followActions';
import { calendarPrefOf, Followable, loadFollowables } from './data/followStore';

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
    // Nothing was added — say WHY, never "no fixtures" over fixtures
    // that exist (found in Stage 1: a Warriors follow under an NBA
    // follow that is in read "no upcoming fixtures yet"). A follow that
    // starts OUT added nothing by choice; one that is in but covered
    // found its games already there; only a follow with nothing ahead is
    // the off-season case. There is no retired variant — a retired
    // athlete has no follow control to reach it (owner ruling
    // 2026-08-04, careerStatus.ts).
    const stored = loadFollowables().find((f) => f.key === item.key);
    const key =
      stored && calendarPrefOf(stored) === 'out'
        ? 'follows.feedback.notInCalendar'
        : (upcomingByFollow()[item.key] ?? 0) > 0
          ? 'follows.feedback.alreadyInCalendar'
          : 'follows.feedback.noUpcoming';
    showToast({ message: t(key, { name: item.label }) });
  }
}
