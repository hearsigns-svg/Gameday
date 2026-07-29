// Schedule: what Gameday manages — not an imitation of the user's
// calendar. Renders the sync snapshot (status-aware), grouped by day,
// with the sync story told honestly at the top.

import { useEffect, useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import {
  CalendarOffBanner,
  EmptyState,
  EventRow,
  SyncStatusChip,
} from '../../../core/components';
import { calendarChoice } from '../data/calendarChoice';
import { TabScreenProps } from '../../../core/navigation';
import { useColorSchemeMode } from '../../../core/useColorSchemeMode';
import { teamTheme } from '../../../core/teamTheme';
import { spacing, type, useTheme } from '../../../core/tokens';
import { dayHeading, dayKey, timeLabel } from '../../../core/when';
import { sportByKey } from '../../follows/domain/sportsConfig';
import { loadFollowables } from '../../follows/data/followStore';
import {
  lastSync,
  lastSyncError,
  subscribeSync,
  UpcomingFixture,
  upcomingFixtures,
} from '../syncEngine';

type Props = TabScreenProps<'Schedule'>;

interface DaySection {
  title: string;
  data: UpcomingFixture[];
}

function sectionsFrom(fixtures: UpcomingFixture[]): DaySection[] {
  const byDay = new Map<string, UpcomingFixture[]>();
  for (const f of fixtures) {
    const key = dayKey(f.startUtc);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(f);
    else byDay.set(key, [f]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, data]) => ({
      title: dayHeading(data[0].startUtc),
      data,
    }));
}

export default function ScheduleScreen({ navigation }: Props) {
  const t = useTheme();
  const mode = useColorSchemeMode();
  const [fixtures, setFixtures] = useState<UpcomingFixture[]>(upcomingFixtures);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState(lastSync);
  const [syncError, setSyncError] = useState<string | null>(lastSyncError);

  useEffect(() => {
    const unsub = subscribeSync((state) => {
      setRunning(state.running);
      setLast(state.last);
      setSyncError(state.lastError);
      setFixtures(upcomingFixtures());
    });
    const focus = navigation.addListener('focus', () =>
      setFixtures(upcomingFixtures()),
    );
    return () => {
      unsub();
      focus();
    };
  }, [navigation]);

  const sections = useMemo(() => {
    const ahead = fixtures.filter(
      (f) => new Date(f.startUtc).getTime() > Date.now() - 3_600_000,
    );
    return sectionsFrom(ahead);
  }, [fixtures]);

  const changed = last ? last.created + last.updated + last.deleted : 0;
  const calendarOff = calendarChoice() !== 'enabled';

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={styles.header}>
        <SyncStatusChip
          running={running}
          lastAt={last?.at ?? null}
          changed={changed}
          error={syncError}
          calendarOff={calendarOff}
        />
      </View>
      {calendarOff && fixtures.length > 0 ? (
        <CalendarOffBanner
          fixtureCount={fixtures.length}
          onEnable={() => navigation.navigate('CalendarPriming')}
        />
      ) : null}
      {sections.length === 0 ? (
        <EmptyState
          headline="Nothing on the schedule"
          body={
            loadFollowables().length === 0
              ? 'Follow a team or competition and its fixtures appear here — and in your calendar.'
              : 'Fixtures appear here as soon as schedules are announced.'
          }
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(f) => f.id}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text
              accessibilityRole="header"
              style={[
                type.label,
                styles.dayHeading,
                { color: t.textSecondary },
              ]}
            >
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => {
            const sport = sportByKey(item.sport);
            return (
              <EventRow
                title={item.title}
                caption={item.competition}
                timeText={timeLabel(item.startUtc, item.status)}
                tbc={item.status === 'tbd' || item.status === 'postponed'}
                glyph={sport?.glyph ?? '🏟️'}
                theme={teamTheme(sport?.accent ?? null, mode)}
              />
            );
          }}
          ListFooterComponent={
            <Text
              style={[
                type.caption,
                styles.footer,
                { color: t.textSecondary },
              ]}
            >
              {calendarOff
                ? 'These fixtures will be added to your phone calendar once you connect it.'
                : 'Everything here is in your phone calendar and updates on its own — times firm up, postponements move, cancellations disappear.'}
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.l, paddingVertical: spacing.m },
  dayHeading: {
    paddingHorizontal: spacing.l,
    paddingTop: spacing.xl,
    paddingBottom: spacing.s,
  },
  footer: {
    padding: spacing.l,
    paddingBottom: spacing.xxl,
    textAlign: 'center',
  },
});
