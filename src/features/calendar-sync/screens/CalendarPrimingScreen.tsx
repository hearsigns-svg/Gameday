// The primed explainer that ALWAYS precedes the OS calendar dialog
// (design rule: one permission prompt, primed, skippable). Reached in
// context — after the first follow, from the calendar-off banner, or
// from a toast — never as a cold gate.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
// Aliased: `t` is this screen's theme handle (useTheme), so the
// catalog functions travel as `tr`/`tn` here.
import { t as tr, tn } from '../../../core/i18n';
import { RootScreenProps } from '../../../core/navigation';
import { messageOf } from '../../../core/result';
import { spacing, type, useTheme } from '../../../core/tokens';
import { showToast } from '../../../core/toast';
import { calendarChoice, setCalendarChoice } from '../data/calendarChoice';
import { activeBackend } from '../data/calendarBackend';
import { connectGoogleCalendar } from '../data/googleCalendarAuth';
import { canPickCalendarTarget, nativeSyncRoute } from '../data/driver';
import {
  CalendarTarget,
  storedTarget,
} from '../data/calendarTargetStore';
import { choiceAfterNotNow } from '../domain/calendarConnection';
import { targetSummary } from '../domain/calendarTarget';
import { runSync, upcomingFixtures } from '../syncEngine';

type Props = RootScreenProps<'CalendarPriming'>;

// Every line has to be true in all three target modes — our own calendar
// in iCloud, the user's Google calendar, or a device-local fallback (see
// docs/CALENDAR_TARGET.md). The old first line promised "your other
// calendars are never touched", which stopped being true the moment a
// calendar of the user's own could be the target. What IS always true is
// the guarantee underneath it: we only ever touch events we added.
const EXPLAINS = [
  ['🗓️', tr('calendar.priming.explainTarget')],
  ['🔄', tr('calendar.priming.explainUpdates')],
  ['🧹', tr('calendar.priming.explainUnfollow')],
] as const;

const RETRY_MS = 750;
const MAX_RETRIES = 20; // ~15s of an in-flight sync before giving up

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function CalendarPrimingScreen({ navigation, route }: Props) {
  const t = useTheme();
  const onboarding = route.params?.onboarding === true;
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Set once connected during onboarding: which calendar we landed on.
  // Confirming it IS the "choose your calendar" step — the automatic
  // target is right for almost everybody, so the choice is presented as
  // something to change rather than something to make.
  const [target, setTarget] = useState<CalendarTarget | null>(null);

  const onwards = () => navigation.replace('Tabs', { screen: 'Home' });

  // A swipe-dismissed ask counts as "not now" — otherwise the
  // full-screen ask re-fires on every follow, which is nagging.
  useEffect(() => {
    return () => {
      if (calendarChoice() === 'unset') setCalendarChoice('deferred');
    };
  }, []);

  // Returning from the picker: show what they actually chose.
  useFocusEffect(
    useCallback(() => {
      setTarget((prev) => (prev ? storedTarget() : prev));
    }, []),
  );

  // Counts come from the snapshot — the same desiredEventFor-filtered
  // set the calendar would actually receive (race-only excluded etc.),
  // never the raw fixture total. The snapshot is capped, so display
  // saturates honestly at "60+".
  const [total, capped, nextMonth] = useMemo(() => {
    const snap = upcomingFixtures();
    const monthAhead = Date.now() + 30 * 86_400_000;
    return [
      snap.length,
      snap.length >= 60,
      snap.filter((f) => new Date(f.startUtc).getTime() <= monthAhead).length,
    ];
  }, []);

  // The OS dialog must only ever appear while THIS screen is up, and
  // 'enabled' must only stick after a run that actually succeeded.
  // In-flight syncs are waited out (runSync coalesces); any failure
  // reverts the choice and keeps the user here, in context.
  const enable = async () => {
    setBusy(true);
    setFailure(null);
    const prior = calendarChoice();
    // The Google route signs in FIRST: account picker, then the consent
    // screen naming exactly one permission (app-created calendars only).
    // A closed picker is an answer, not an error — quiet revert, stay.
    if (nativeSyncRoute() === 'google-connect' && activeBackend() !== 'rest') {
      const connected = await connectGoogleCalendar();
      if (!connected.ok) {
        setBusy(false);
        if (
          connected.error.kind === 'unknown' &&
          !connected.error.message.includes('cancelled')
        ) {
          setFailure(
            tr('calendar.priming.tryAgain', {
              message: messageOf(connected.error),
            }),
          );
        }
        return;
      }
    }
    setCalendarChoice('enabled');
    let r = await runSync();
    for (
      let i = 0;
      !r.ok && r.error.kind === 'sync-in-progress' && i < MAX_RETRIES;
      i++
    ) {
      await sleep(RETRY_MS);
      r = await runSync();
    }
    setBusy(false);
    if (r.ok) {
      if (onboarding) {
        // Stay put and show where fixtures will go. At this point they
        // have followed nothing, so a toast about "0 fixtures added"
        // would be noise — the useful information is the calendar.
        setTarget(storedTarget());
        return;
      }
      navigation.goBack();
      showToast({
        message:
          r.value.created > 0
            ? tn('calendar.priming.addedFixtures', r.value.created)
            : tr('calendar.priming.connected'),
      });
      return;
    }
    // Deferred, not enabled: the user answered the ask; only a
    // successful connected run may latch 'enabled'.
    setCalendarChoice(prior === 'unset' ? 'deferred' : prior);
    if (r.error.kind === 'permission-denied') {
      setDenied(true);
    } else {
      setFailure(
        tr('calendar.priming.tryAgain', { message: messageOf(r.error) }),
      );
    }
  };

  // Connected, mid-onboarding: confirm the calendar, then go and follow
  // things. From here on the app asks nothing — sync runs in the
  // background.
  if (onboarding && target) {
    return (
      <View style={[styles.screen, { backgroundColor: t.bg }]}>
        <Text style={[type.title, { color: t.textPrimary }]}>
          {tr('calendar.priming.connectedTitle')}
        </Text>
        <Text
          style={[type.body, { color: t.textPrimary, marginTop: spacing.xl }]}
        >
          {targetSummary({
            label: target.label,
            accountLabel: target.accountLabel,
            sourceKind: target.sourceKind,
            ours: target.kind === 'ours',
          })}
        </Text>
        <Text
          style={[type.secondary, { color: t.textSecondary, marginTop: spacing.l }]}
        >
          {tr('calendar.priming.connectedBody')}
        </Text>
        <View style={{ flex: 1 }} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('calendar.priming.chooseSports')}
          onPress={onwards}
          style={[styles.cta, { backgroundColor: t.primary }]}
        >
          <Text style={[type.body, { color: t.onPrimary, fontWeight: '600' }]}>
            {tr('calendar.priming.chooseSports')}
          </Text>
        </Pressable>
        {/* The provider picker exists only where there is a choice to
            make; under REST the one calendar is ours by construction,
            so the route in is simply absent (B4 item 6). */}
        {canPickCalendarTarget() ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('calendar.priming.differentCalendar')}
            onPress={() => navigation.navigate('CalendarTarget')}
            style={styles.skip}
          >
            <Text style={[type.body, { color: t.textSecondary }]}>
              {tr('calendar.priming.differentCalendar')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: t.bg }]}>
      <Text style={[type.title, { color: t.textPrimary }]}>
        {tr('calendar.priming.title')}
      </Text>
      {total > 0 ? (
        <Text
          style={[type.body, { color: t.textSecondary, marginTop: spacing.s }]}
        >
          {nextMonth > 0
            ? tn('calendar.priming.readyMonth', total, {
                count: capped ? '60+' : total,
                month: nextMonth,
              })
            : tn('calendar.priming.ready', total, {
                count: capped ? '60+' : total,
              })}
        </Text>
      ) : null}
      <View style={{ marginTop: spacing.xl, gap: spacing.l }}>
        {EXPLAINS.map(([glyph, line]) => (
          <View key={line} style={styles.row}>
            <Text style={{ fontSize: 20 }} accessible={false}>
              {glyph}
            </Text>
            <Text style={[type.body, { color: t.textPrimary, flex: 1 }]}>
              {line}
            </Text>
          </View>
        ))}
      </View>
      {denied ? (
        <Text style={[type.secondary, { color: t.danger, marginTop: spacing.xl }]}>
          {tr('calendar.priming.denied')}
        </Text>
      ) : failure ? (
        <Text style={[type.secondary, { color: t.danger, marginTop: spacing.xl }]}>
          {failure}
        </Text>
      ) : null}
      <View style={{ flex: 1 }} />
      {nativeSyncRoute() === 'google-connect' && activeBackend() !== 'rest' ? (
        // A fact, stated once, no apology (owner §2 copy ruling).
        <Text
          style={[type.caption, { color: t.textSecondary, marginBottom: spacing.m }]}
        >
          {tr('calendar.priming.googleNote')}
        </Text>
      ) : null}
      {denied ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('calendar.priming.openSettings')}
          onPress={() => void Linking.openSettings()}
          style={[styles.cta, { backgroundColor: t.primary }]}
        >
          <Text style={[type.body, { color: t.onPrimary, fontWeight: '600' }]}>
            {tr('calendar.priming.openSettings')}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('calendar.priming.addToMyCalendar')}
          disabled={busy}
          onPress={() => void enable()}
          style={[
            styles.cta,
            { backgroundColor: t.primary, opacity: busy ? 0.6 : 1 },
          ]}
        >
          <Text style={[type.body, { color: t.onPrimary, fontWeight: '600' }]}>
            {busy
              ? tr('calendar.priming.connecting')
              : nativeSyncRoute() === 'google-connect' && activeBackend() !== 'rest'
                ? tr('calendar.priming.connectGoogle')
                : total > 0
                  ? tr('calendar.priming.addToMyCalendar')
                  : tr('calendar.priming.connectMyCalendar')}
          </Text>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('calendar.priming.notNow')}
        onPress={() => {
          // A deferral — never a downgrade of a choice already latched
          // 'enabled' (B4 item 4). The REST path used to leave this ask
          // on screen after a successful connect (no target record, so
          // no confirmation), and this tap switched the calendar back
          // off.
          setCalendarChoice(choiceAfterNotNow(calendarChoice()));
          // Skipping is allowed to cost nothing: onboarding continues to
          // the sports picker, and the app works without a calendar.
          if (onboarding) onwards();
          else navigation.goBack();
        }}
        style={styles.skip}
      >
        <Text style={[type.body, { color: t.textSecondary }]}>
          {tr('calendar.priming.notNow')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.l },
  cta: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skip: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.s,
    marginBottom: spacing.s,
  },
});
