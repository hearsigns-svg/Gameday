// A notification tap opens the fixture's card. The expansion host is a
// hook-only surface, so this invisible component sits inside it and
// turns the tap into the same request a row tap makes — with no frame
// to fly from, the card simply appears at its destination.
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useCardExpansion } from '../core/cardExpansion';
import { fixtureCardRequest } from '../features/calendar-sync/openFixtureCard';
import { onNotificationOpened } from '../features/reminders/data/notificationScheduler';

export function NotificationTapBridge() {
  const expansion = useCardExpansion();
  const nullRef = useRef<View | null>(null);
  useEffect(
    () =>
      onNotificationOpened((fixtureId) => {
        void fixtureCardRequest(nullRef, fixtureId).then(expansion.open);
      }),
    // the expansion object is stable for the host's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return null;
}
