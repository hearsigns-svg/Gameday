// The primed explainer that ALWAYS precedes the OS calendar dialog
// (design rule: one permission prompt, primed, skippable). Reached in
// context — after the first follow, from the calendar-off banner, or
// from a toast — never as a cold gate.

import { useEffect, useMemo, useState } from 'react';
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
import { runSync, upcomingFixtures } from '../syncEngine';

type Props = RootScreenProps<'CalendarPriming'>;

const EXPLAINS = [
  ['🗓️', 'Gameday creates its own calendar — your other calendars are never touched'],
  ['🔄', 'Events update themselves when times change or games move'],
  ['🧹', 'Unfollow and its fixtures disappear again'],
] as const;

const RETRY_MS = 750;
const MAX_RETRIES = 20; // ~15s of an in-flight sync before giving up

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function CalendarPrimingScreen({ navigation }: Props) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // A swipe-dismissed ask counts as "not now" — otherwise the
  // full-screen ask re-fires on every follow, which is nagging.
  useEffect(() => {
    return () => {
      if (calendarChoice() === 'unset') setCalendarChoice('deferred');
    };
  }, []);

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
          Calendar access is turned off for Gameday. Allow it in Settings,
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
            {busy ? 'Adding…' : 'Add to my calendar'}
          </Text>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Not now"
        onPress={() => {
          setCalendarChoice('deferred');
          navigation.goBack();
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
