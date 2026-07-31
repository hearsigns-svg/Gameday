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
import { RootScreenProps } from '../../../core/navigation';
import { messageOf } from '../../../core/result';
import { spacing, type, useTheme } from '../../../core/tokens';
import { showToast } from '../../../core/toast';
import { calendarChoice, setCalendarChoice } from '../data/calendarChoice';
import {
  CalendarTarget,
  storedTarget,
} from '../data/calendarTargetStore';
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
  ['🗓️', 'Fixtures go into a calendar you choose — we only ever touch events we added'],
  ['🔄', 'Events update themselves when times change or games move'],
  ['🧹', 'Unfollow and its fixtures disappear again'],
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
            ? `Added ${r.value.created} fixture${r.value.created === 1 ? '' : 's'} to your calendar`
            : 'Calendar connected',
      });
      return;
    }
    // Deferred, not enabled: the user answered the ask; only a
    // successful connected run may latch 'enabled'.
    setCalendarChoice(prior === 'unset' ? 'deferred' : prior);
    if (r.error.kind === 'permission-denied') {
      setDenied(true);
    } else {
      setFailure(`${messageOf(r.error)} Try again in a moment.`);
    }
  };

  // Connected, mid-onboarding: confirm the calendar, then go and follow
  // things. From here on the app asks nothing — sync runs in the
  // background.
  if (onboarding && target) {
    return (
      <View style={[styles.screen, { backgroundColor: t.bg }]}>
        <Text style={[type.title, { color: t.textPrimary }]}>
          Your calendar is connected
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
          Follow a team and its fixtures appear there on their own — times
          firm up, postponements move, cancellations disappear. Nothing else
          to set up.
        </Text>
        <View style={{ flex: 1 }} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose your sports"
          onPress={onwards}
          style={[styles.cta, { backgroundColor: t.primary }]}
        >
          <Text style={[type.body, { color: t.onPrimary, fontWeight: '600' }]}>
            Choose your sports
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Use a different calendar"
          onPress={() => navigation.navigate('CalendarTarget')}
          style={styles.skip}
        >
          <Text style={[type.body, { color: t.textSecondary }]}>
            Use a different calendar
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: t.bg }]}>
      <Text style={[type.title, { color: t.textPrimary }]}>
        Put your games in your calendar
      </Text>
      {total > 0 ? (
        <Text
          style={[type.body, { color: t.textSecondary, marginTop: spacing.s }]}
        >
          {capped ? '60+' : total} fixture{total === 1 ? '' : 's'} ready to add
          {nextMonth > 0 ? ` — about ${nextMonth} in the next month` : ''}.
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
          Calendar access is turned off for KickOffCal. Allow it in Settings,
          then come back — your fixtures are waiting.
        </Text>
      ) : failure ? (
        <Text style={[type.secondary, { color: t.danger, marginTop: spacing.xl }]}>
          {failure}
        </Text>
      ) : null}
      <View style={{ flex: 1 }} />
      {denied ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Settings"
          onPress={() => void Linking.openSettings()}
          style={[styles.cta, { backgroundColor: t.primary }]}
        >
          <Text style={[type.body, { color: t.onPrimary, fontWeight: '600' }]}>
            Open Settings
          </Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add to my calendar"
          disabled={busy}
          onPress={() => void enable()}
          style={[
            styles.cta,
            { backgroundColor: t.primary, opacity: busy ? 0.6 : 1 },
          ]}
        >
          <Text style={[type.body, { color: t.onPrimary, fontWeight: '600' }]}>
            {busy
              ? 'Connecting…'
              : total > 0
                ? 'Add to my calendar'
                : 'Connect my calendar'}
          </Text>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Not now"
        onPress={() => {
          setCalendarChoice('deferred');
          // Skipping is allowed to cost nothing: onboarding continues to
          // the sports picker, and the app works without a calendar.
          if (onboarding) onwards();
          else navigation.goBack();
        }}
        style={styles.skip}
      >
        <Text style={[type.body, { color: t.textSecondary }]}>Not now</Text>
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
