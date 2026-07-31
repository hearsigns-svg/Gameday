// Where fixtures are written. This screen exists for people with a real
// choice to make — two accounts, work vs personal, or a target we could
// not serve automatically. It is NOT the way the feature is meant to be
// used: the default target is resolved on the first sync and is correct
// for almost everybody without them ever coming here.
//
// Every row states its consequence, because the consequences differ in
// kind: a device-local calendar genuinely does not leave the phone, and
// a calendar of the user's own genuinely does mix our fixtures in with
// their events.

import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ListRow, SectionHeader } from '../../core/components';
import { RootScreenProps } from '../../core/navigation';
import { messageOf } from '../../core/result';
import { radius, spacing, type, useTheme } from '../../core/tokens';
import { showToast } from '../../core/toast';
import {
  ANDROID_LOCAL_HINT,
  CalendarLike,
  consequenceOf,
  groupForPicker,
  targetSummary,
} from '../calendar-sync/domain/calendarTarget';
import { planTargetMigration } from '../calendar-sync/domain/calendarMigration';
import {
  listTargetOptions,
  TargetOptions,
  TargetRequest,
} from '../calendar-sync/data/calendarDriver';
import {
  CalendarTarget,
  storedTarget,
} from '../calendar-sync/data/calendarTargetStore';
import { calendarChoice } from '../calendar-sync/data/calendarChoice';
import { loadLedger } from '../calendar-sync/data/ledger';
import { MoveProgress, switchCalendarTarget } from '../calendar-sync/syncEngine';

type Props = RootScreenProps<'CalendarTarget'>;

export default function CalendarTargetScreen({ navigation }: Props) {
  const t = useTheme();
  const [options, setOptions] = useState<TargetOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<CalendarTarget | null>(storedTarget);
  const [progress, setProgress] = useState<MoveProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const connected = calendarChoice() === 'enabled';

  const load = useCallback(() => {
    if (!connected) return;
    void listTargetOptions().then((r) => {
      if (r.ok) setOptions(r.value);
      else setError(messageOf(r.error));
    });
  }, [connected]);

  useEffect(load, [load]);
  // The target can change under this screen: any sync resolves it, and
  // the user may have added an account in the OS settings meanwhile.
  useFocusEffect(
    useCallback(() => {
      setTarget(storedTarget());
    }, []),
  );

  const choose = async (request: TargetRequest, label: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const pending = planTargetMigration(
      loadLedger(),
      request.kind === 'existing' ? request.calendarId : '',
    ).length;
    setProgress(pending > 0 ? { moved: 0, total: pending } : null);
    const r = await switchCalendarTarget(request, setProgress);
    setBusy(false);
    setProgress(null);
    setTarget(storedTarget());
    load();
    if (!r.ok) {
      setError(`${messageOf(r.error)}`);
      return;
    }
    showToast({
      message:
        r.value.moved > 0
          ? `Moved ${r.value.moved} fixture${r.value.moved === 1 ? '' : 's'} to ${label}`
          : `Fixtures now go to ${label}`,
    });
  };

  if (!connected) {
    return (
      <View style={[styles.screen, { backgroundColor: t.bg }]}>
        <Text style={[type.body, { color: t.textPrimary }]}>
          Connect your calendar first and KickOffCal will pick the best place
          for your fixtures automatically. You can change it here afterwards.
        </Text>
        <ListRow
          title="Put your games in your calendar"
          accessibilityLabel="Connect your calendar"
          onPress={() => navigation.navigate('CalendarPriming')}
          right={<Text style={[type.body, { color: t.textSecondary }]}>›</Text>}
        />
      </View>
    );
  }

  const currentId = target?.calendarId ?? null;
  const groups = options ? groupForPicker(options.calendars) : [];
  // iOS can create a dedicated calendar inside any writable source;
  // Android cannot create inside a Google account at all, so its only
  // create option is the device-local fallback.
  const createRows: Array<{ key: string; title: string; req: TargetRequest }> =
    Platform.OS === 'ios'
      ? (options?.sources ?? [])
          .filter((s) => s.sourceId !== options?.ourSourceId)
          .map((s) => ({
            key: s.sourceId,
            title: `New KickOffCal calendar in ${s.name}`,
            req: { kind: 'create', sourceId: s.sourceId },
          }))
      : options && options.ourCalendarId === null
        ? [
            {
              key: 'local',
              title: 'New KickOffCal calendar on this device',
              req: { kind: 'create' },
            },
          ]
        : [];

  const rowFor = (c: CalendarLike) => {
    const ours = c.id === options?.ourCalendarId;
    return (
      <ListRow
        key={c.id}
        title={c.title}
        caption={consequenceOf(c, ours)}
        accessibilityLabel={`Write fixtures to ${c.title}`}
        disabled={busy}
        onPress={() => void choose({ kind: 'existing', calendarId: c.id }, c.title)}
        right={
          c.id === currentId ? (
            <Text style={[type.body, { color: t.primary, fontWeight: '700' }]}>
              ✓
            </Text>
          ) : undefined
        }
      />
    );
  };

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
    >
      {target ? (
        <View style={[styles.current, { backgroundColor: t.surface }]}>
          <Text style={[type.label, { color: t.textSecondary }]}>
            Fixtures go to
          </Text>
          <Text style={[type.body, { color: t.textPrimary, marginTop: 2 }]}>
            {targetSummary({
              label: target.label,
              accountLabel: target.accountLabel,
              sourceKind: target.sourceKind,
              ours: target.kind === 'ours',
            })}
          </Text>
          {Platform.OS === 'android' && target.sourceKind === 'device' ? (
            <Text
              style={[
                type.caption,
                { color: t.textSecondary, marginTop: spacing.s },
              ]}
            >
              {ANDROID_LOCAL_HINT}
            </Text>
          ) : null}
        </View>
      ) : null}

      {progress ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[type.body, { color: t.textPrimary, padding: spacing.l }]}
        >
          Moving {progress.total} fixture{progress.total === 1 ? '' : 's'}…{' '}
          {progress.moved}/{progress.total}
        </Text>
      ) : null}

      {error ? (
        <Text style={[type.secondary, { color: t.danger, padding: spacing.l }]}>
          {error}
        </Text>
      ) : null}

      {options === null && error === null ? (
        <Text
          style={[type.secondary, { color: t.textSecondary, padding: spacing.l }]}
        >
          Reading your calendars…
        </Text>
      ) : null}

      {groups.map((g) => (
        <View key={g.account}>
          <SectionHeader title={g.account} />
          {g.calendars.map(rowFor)}
        </View>
      ))}

      {createRows.length > 0 ? (
        <View>
          <SectionHeader title="Its own calendar" />
          {createRows.map((r) => (
            <ListRow
              key={r.key}
              title={r.title}
              caption="Keeps fixtures separate from your own events"
              accessibilityLabel={r.title}
              disabled={busy}
              onPress={() => void choose(r.req, 'KickOffCal')}
            />
          ))}
        </View>
      ) : null}

      {options !== null ? (
        <Text
          style={[
            type.caption,
            { color: t.textSecondary, padding: spacing.l },
          ]}
        >
          Whichever you pick, KickOffCal only ever adds, changes or removes the
          fixtures it put there. Switching moves everything across — nothing is
          left behind.
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: spacing.l, gap: spacing.l },
  current: {
    margin: spacing.l,
    padding: spacing.l,
    borderRadius: radius.card,
  },
});
