// Schedule: what Gameday manages — not an imitation of the user's
// calendar. Two views of the same snapshot: a day-grouped list and a
// month grid. Rows carry the per-event opt-out: removed fixtures stay
// visible, greyed, with a restore affordance.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, SectionList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCardExpansion } from '../../../core/cardExpansion';
import { fixtureCardRequest } from '../openFixtureCard';
import { monogramOf,
  CalendarOffBanner,
  EmptyState,
  EventRow,
  SyncStatusChip,
} from '../../../core/components';
import { calendarChoice } from '../data/calendarChoice';
import { loadExclusions, setExcluded } from '../data/exclusionStore';
import { TabScreenProps } from '../../../core/navigation';
import { useColorSchemeMode } from '../../../core/useColorSchemeMode';
import { teamTheme } from '../../../core/teamTheme';
import { radius, spacing, type, useTheme } from '../../../core/tokens';
import { showToast } from '../../../core/toast';
import { dayHeading, dayKey, isDateOnly, timeLabel } from '../../../core/when';
import {
  dataStaleness,
  refreshDataFreshness,
} from '../../fixtures/data/freshnessRepo';
import { sportByKey } from '../../follows/domain/sportsConfig';
import { headlineParticipant } from '../../follows/domain/participants';
import { useAthletePhoto } from '../../follows/useEntityPhoto';
import { identityFollow } from '../../follows/domain/followIdentity';
import { Followable, loadFollowables } from '../../follows/data/followStore';
import {
  lastSync,
  lastSyncError,
  runSync,
  subscribeSync,
  UpcomingFixture,
  upcomingFixtures,
} from '../syncEngine';
import { MonthGrid } from './MonthGrid';

type Props = TabScreenProps<'Schedule'>;

interface DaySection {
  title: string;
  data: UpcomingFixture[];
}

function sectionsFrom(fixtures: UpcomingFixture[]): DaySection[] {
  const byDay = new Map<string, UpcomingFixture[]>();
  for (const f of fixtures) {
    const key = dayKey(f.startUtc, isDateOnly(f.status, f.timePrecision));
    const bucket = byDay.get(key);
    if (bucket) bucket.push(f);
    else byDay.set(key, [f]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, data]) => ({
      title: dayHeading(data[0].startUtc, isDateOnly(data[0].status, data[0].timePrecision)),
      data,
    }));
}

export default function ScheduleScreen({ navigation }: Props) {
  const t = useTheme();
  const mode = useColorSchemeMode();
  const [fixtures, setFixtures] = useState<UpcomingFixture[]>(upcomingFixtures);
  const [follows, setFollows] = useState<Followable[]>(loadFollowables);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(loadExclusions);
  const [view, setView] = useState<'list' | 'month'>('list');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState(lastSync);
  const [syncError, setSyncError] = useState<string | null>(lastSyncError);
  const [dataStaleHours, setDataStaleHours] = useState<number | null>(null);

  // Data age is the SOURCE's, not the device's: refresh the freshness
  // summary the sweep maintains, then judge the followed sources by it.
  // Failure leaves it null — unknown renders as nothing claimed, never
  // as green.
  useEffect(() => {
    void (async () => {
      await refreshDataFreshness();
      const s = dataStaleness(loadFollowables());
      setDataStaleHours(s?.worstHours ?? null);
    })();
  }, [fixtures]);

  useEffect(() => {
    const refresh = () => {
      setFixtures(upcomingFixtures());
      setFollows(loadFollowables());
      setExcludedIds(loadExclusions());
    };
    const unsub = subscribeSync((state) => {
      setRunning(state.running);
      setLast(state.last);
      setSyncError(state.lastError);
      refresh();
    });
    const focus = navigation.addListener('focus', refresh);
    return () => {
      unsub();
      focus();
    };
  }, [navigation]);

  const ahead = useMemo(
    () =>
      fixtures.filter(
        (f) => new Date(f.startUtc).getTime() > Date.now() - 3_600_000,
      ),
    [fixtures],
  );
  const sections = useMemo(() => sectionsFrom(ahead), [ahead]);

  const countsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of ahead) {
      if (excludedIds.has(f.id)) continue;
      const key = dayKey(f.startUtc, isDateOnly(f.status, f.timePrecision));
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [ahead, excludedIds]);

  const dayFixtures = useMemo(
    () =>
      selectedDay
        ? ahead.filter(
            (f) =>
              dayKey(f.startUtc, isDateOnly(f.status, f.timePrecision)) ===
              selectedDay,
          )
        : [],
    [ahead, selectedDay],
  );

  const toggleExclude = (f: UpcomingFixture) => {
    const was = excludedIds.has(f.id);
    setExcluded(f.id, !was);
    setExcludedIds(loadExclusions());
    showToast(
      was
        ? { message: `Restored to your calendar` }
        : {
            message: `Removed from your calendar`,
            action: {
              label: 'Undo',
              onPress: () => {
                setExcluded(f.id, false);
                setExcludedIds(loadExclusions());
                void runSync();
              },
            },
          },
    );
    void runSync();
  };

  // Rows are a component so the participant-photo hook is legal — and it
  // is defined at MODULE level (below), not here: a component created
  // inside the render is a new type on every sync tick, so every row
  // unmounted and remounted and its resolved photo was thrown away.
  const Row = ({ item }: { item: UpcomingFixture }) => (
    <ScheduleRow
      item={item}
      follows={follows}
      mode={mode}
      excluded={excludedIds.has(item.id)}
      onToggleExcluded={() => toggleExclude(item)}
    />
  );

  const changed = last ? last.created + last.updated + last.deleted : 0;
  const calendarOff = calendarChoice() !== 'enabled';

  const segment = (label: string, value: 'list' | 'month') => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: view === value }}
      accessibilityLabel={`${label} view`}
      onPress={() => setView(value)}
      style={[
        styles.segment,
        view === value && { backgroundColor: t.surfaceRaised },
      ]}
    >
      <Text
        style={[
          type.secondary,
          {
            color: view === value ? t.textPrimary : t.textSecondary,
            fontWeight: view === value ? '600' : '400',
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <SyncStatusChip
            running={running}
            lastAt={last?.at ?? null}
            changed={changed}
            error={syncError}
            calendarOff={calendarOff}
            dataStaleHours={dataStaleHours}
          />
        </View>
        <View style={[styles.segments, { backgroundColor: t.surface }]}>
          {segment('List', 'list')}
          {segment('Month', 'month')}
        </View>
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
            follows.length === 0
              ? 'Follow a team or competition and its fixtures appear here — and in your calendar.'
              : 'Fixtures appear here as soon as schedules are announced.'
          }
        />
      ) : view === 'month' ? (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
          <MonthGrid
            countsByDay={countsByDay}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
          {selectedDay ? (
            dayFixtures.length > 0 ? (
              dayFixtures.map((f) => <Row key={f.id} item={f} />)
            ) : (
              <Text
                style={[
                  type.secondary,
                  { color: t.textSecondary, padding: spacing.l, textAlign: 'center' },
                ]}
              >
                Nothing on this day.
              </Text>
            )
          ) : (
            <Text
              style={[
                type.caption,
                { color: t.textSecondary, padding: spacing.l, textAlign: 'center' },
              ]}
            >
              Tap a day to see its fixtures.
            </Text>
          )}
        </ScrollView>
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
          renderItem={({ item }) => <Row item={item} />}
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

// One fixture row. Module level so its identity is stable across
// renders (see the note at the call site).
function ScheduleRow(props: {
  item: UpcomingFixture;
  follows: Followable[];
  mode: 'light' | 'dark';
  excluded: boolean;
  onToggleExcluded: () => void;
}) {
  const { item } = props;
  const sport = sportByKey(item.sport);
  const owner = identityFollow(item.followKeys, props.follows);
  const photo = useAthletePhoto(
    headlineParticipant(item.title, item.sport),
    item.sport,
  );
  const ref = useRef<View | null>(null);
  const expansion = useCardExpansion();
  return (
    <EventRow
      innerRef={ref}
      hidden={expansion.liftedKey === item.id}
      // A licensed portrait where the fixture names a person, the owning
      // follow's crest otherwise — the row had the crest in hand and
      // rendered a monogram anyway (Prompt 16 C sweep).
      imageUrl={photo?.url ?? owner?.crestUrl}
      onPress={() => {
        void fixtureCardRequest(ref, item.id).then(expansion.open);
      }}
      title={item.title}
      caption={item.competition}
      timeText={timeLabel(item.startUtc, item.status, item.timePrecision)}
      tbc={isDateOnly(item.status, item.timePrecision)}
      glyph={sport?.glyph ?? '🏟️'}
      monogram={monogramOf(owner?.label ?? item.homeTeam ?? item.competition)}
      theme={teamTheme(owner?.brandColour ?? sport?.accent ?? null, props.mode)}
      excluded={props.excluded}
      onToggleExcluded={props.onToggleExcluded}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s,
  },
  segments: {
    flexDirection: 'row',
    borderRadius: radius.button,
    padding: 2,
  },
  segment: {
    paddingHorizontal: spacing.m,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: radius.button - 2,
  },
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
