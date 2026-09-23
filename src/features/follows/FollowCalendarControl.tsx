// The calendar glyph wired to the follow store (owner brief "Per-follow
// calendar control", 2026-09-23). One vocabulary, two places: a hero
// card and a Following row, each acting on that one follow (a joint
// tennis card on both of its followed draws). The sport-header control
// was dropped by the owner the same day.
//
// The glyph flips the moment it is tapped — the store changes before the
// sync that writes the calendar starts — and a toast confirms when the
// sync lands. If the calendar write fails, the preference and the glyph
// revert and the toast says so. Free state: + opens the Premium offer
// (the single gate, never in the same session as a decline) and changes
// nothing; taking things OUT is never gated.

import { useEffect, useRef, useState } from 'react';
import { CalendarGlyph } from '../../core/calendarGlyph';
import { premiumLocked } from '../../core/entitlementStore';
import { t } from '../../core/i18n';
import { requestPaywall } from '../../core/paywall';
import { TeamTheme } from '../../core/teamTheme';
import { showToast } from '../../core/toast';
import { subscribeSync } from '../calendar-sync/syncEngine';
import { loadFollowables, subscribeFollows } from './data/followStore';
import { targetsCalendarState } from './domain/calendarTargets';
import { setCalendar } from './followActions';

export function FollowCalendarControl(props: {
  // The follows this glyph acts on — one for a card or a Following row,
  // both followed draws of a joint tennis card.
  keys: readonly string[];
  // What the labels and toasts call it: the follow's name.
  name: string;
  variant: 'poster' | 'row';
  theme?: TeamTheme;
}) {
  const [, repaint] = useState(0);
  // Taps are never blocked while a write is in flight — the glyph always
  // answers. Only the LATEST tap speaks: an earlier tap's toast or
  // failure would describe a state the user has already tapped past
  // (setCalendar's own generation guard keeps its revert off newer taps).
  const tapSeq = useRef(0);
  useEffect(() => subscribeSync(() => repaint((n) => n + 1)), []);
  // Every glyph on screen agrees the moment any of them is tapped — the
  // hero card's and the Following row's.
  useEffect(() => subscribeFollows(() => repaint((n) => n + 1)), []);
  const wanted = new Set(props.keys);
  const follows = loadFollowables().filter((f) => wanted.has(f.key));
  // Shown only while the entity is followed.
  if (follows.length === 0) return null;
  // ✓ only when every target is in (a joint card's two draws); a tap on
  // a mixed set puts all of them in.
  const state = targetsCalendarState(follows);

  const onPress = async () => {
    const next = state === 'in' ? 'out' : 'in';
    if (next === 'in' && premiumLocked()) {
      // The single gate. Suppressed after a decline this session — then
      // the offer's own line says what + would need, and nothing changes.
      if (!requestPaywall('on_demand')) showToast({ message: t('premium.syncRow') });
      return;
    }
    const mine = ++tapSeq.current;
    const outcome = setCalendar(follows.map((f) => f.key), next);
    repaint((n) => n + 1); // the store already holds the new state
    const result = await outcome;
    repaint((n) => n + 1);
    if (mine !== tapSeq.current) return; // a newer tap owns the message
    if (result === 'failed') {
      showToast({ message: t('calendar.control.failed') });
      return;
    }
    showToast({
      message: t(next === 'in' ? 'calendar.control.added' : 'calendar.control.removed', {
        name: props.name,
      }),
    });
  };

  return (
    <CalendarGlyph
      state={state}
      variant={props.variant}
      {...(props.theme ? { theme: props.theme } : {})}
      accessibilityLabel={t(
        state === 'in' ? 'calendar.control.inA11y' : 'calendar.control.addA11y',
        { name: props.name },
      )}
      onPress={() => void onPress()}
    />
  );
}
