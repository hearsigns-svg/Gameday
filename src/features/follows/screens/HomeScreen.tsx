// Home answers one question at a glance: when do I next care?
// Hero = the soonest fixture; Next up = what follows it; sport pills =
// the way in. Managing follows lives on the Following tab.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  EmptyState,
  EventRow,
  HeroCard,
  SectionHeader,
  SportPill,
} from '../../../core/components';
import { TabScreenProps } from '../../../core/navigation';
import { useColorSchemeMode } from '../../../core/useColorSchemeMode';
import { messageOf } from '../../../core/result';
import { teamTheme } from '../../../core/teamTheme';
import { spacing, type, useTheme } from '../../../core/tokens';
import {
  subscribeSync,
  UpcomingFixture,
  upcomingFixtures,
} from '../../calendar-sync/syncEngine';
import { timeLabel, whenLabel } from '../../../core/when';
import { follow, unfollow } from '../followActions';
import { isFollowed, loadFollowables } from '../data/followStore';
import { SportConfig, sportByKey, SPORTS } from '../domain/sportsConfig';

type Props = TabScreenProps<'Home'>;

const NEXT_UP_COUNT = 5;

export default function HomeScreen({ navigation }: Props) {
  const t = useTheme();
  const mode = useColorSchemeMode();
  const [fixtures, setFixtures] = useState<UpcomingFixture[]>(upcomingFixtures);
  const [followCount, setFollowCount] = useState(() => loadFollowables().length);
  const [error, setError] = useState<string | null>(null);
  const [busySport, setBusySport] = useState<string | null>(null);
  const [, forceRender] = useState(0);

  useEffect(() => {
    const unsub = subscribeSync(() => {
      setFixtures(upcomingFixtures());
      setFollowCount(loadFollowables().length);
    });
    const focus = navigation.addListener('focus', () => {
      setFixtures(upcomingFixtures());
      setFollowCount(loadFollowables().length);
    });
    return () => {
      unsub();
      focus();
    };
  }, [navigation]);

  const [hero, nextUp] = useMemo(() => {
    const upcoming = fixtures.filter(
      (f) => new Date(f.startUtc).getTime() > Date.now() - 3_600_000,
    );
    return [upcoming[0] ?? null, upcoming.slice(1, 1 + NEXT_UP_COUNT)];
  }, [fixtures]);

  // One in-flight pill action at a time — a second tap mid-flight would
  // read the already-flipped store and silently reverse the first.
  const pillBusyRef = useRef(false);

  // Series sports follow straight from the pill; browse sports navigate.
  const onPill = useCallback(
    async (sport: SportConfig) => {
      const series = sport.seriesFollowable;
      if (!series) {
        navigation.navigate('LeagueList', { sportKey: sport.key });
        return;
      }
      if (pillBusyRef.current) return;
      pillBusyRef.current = true;
      setBusySport(sport.key);
      const item = {
        key: series.key,
        label: series.label,
        sportKey: sport.key,
        type: 'series' as const,
        ...(series.pollPath ? { pollPath: series.pollPath } : {}),
      };
      const r = isFollowed(series.key)
        ? await unfollow(item)
        : await follow(item);
      if (!r.ok && r.error.kind !== 'sync-in-progress') {
        setError(messageOf(r.error));
      } else {
        setError(null);
      }
      pillBusyRef.current = false;
      setBusySport(null);
      forceRender((n) => n + 1);
    },
    [navigation],
  );

  const heroSport = hero ? sportByKey(hero.sport) : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
      contentInsetAdjustmentBehavior="automatic"
    >
      {error ? (
        <Text style={[type.secondary, { color: t.danger, padding: spacing.l }]}>
          {error}
        </Text>
      ) : null}

      {hero ? (
        <View style={{ marginTop: spacing.l }}>
          <HeroCard
            title={hero.title}
            competition={hero.competition}
            startUtc={hero.startUtc}
            status={hero.status}
            glyph={heroSport?.glyph ?? '🏟️'}
            theme={teamTheme(heroSport?.accent ?? null, mode)}
          />
        </View>
      ) : followCount > 0 ? (
        <EmptyState
          headline="Nothing scheduled yet"
          body="Fixtures land here — and in your calendar — as soon as schedules are announced."
        />
      ) : (
        <EmptyState
          headline="Never miss a game"
          body="Follow teams, competitions and series. Their fixtures appear in your calendar and stay correct on their own."
        />
      )}

      {nextUp.length > 0 ? (
        <>
          <SectionHeader title="Next up" />
          <View>
            {nextUp.map((f) => {
              const sport = sportByKey(f.sport);
              return (
                <EventRow
                  key={f.id}
                  title={f.title}
                  caption={`${whenLabel(f.startUtc)} · ${f.competition}`}
                  timeText={timeLabel(f.startUtc, f.status)}
                  tbc={f.status === 'tbd' || f.status === 'postponed'}
                  glyph={sport?.glyph ?? '🏟️'}
                  theme={teamTheme(sport?.accent ?? null, mode)}
                />
              );
            })}
          </View>
        </>
      ) : null}

      <SectionHeader title={followCount > 0 ? 'Add sports' : 'Choose a sport'} />
      <View style={styles.pills}>
        {SPORTS.filter((s) => s.enabled).map((s) => {
          const series = s.seriesFollowable;
          const following = series ? isFollowed(series.key) : false;
          return (
            <SportPill
              key={s.key}
              label={s.label}
              glyph={s.glyph}
              theme={teamTheme(s.accent, mode)}
              following={series ? following : undefined}
              busy={busySport === s.key}
              onPress={() => void onPill(s)}
              accessibilityLabel={
                series
                  ? following
                    ? `Unfollow ${series.label}`
                    : `Follow ${series.label}`
                  : `Browse ${s.label}`
              }
            />
          );
        })}
      </View>
      {busySport ? (
        <Text
          style={[type.caption, { color: t.textSecondary, paddingHorizontal: spacing.l }]}
        >
          Updating…
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s,
    paddingHorizontal: spacing.l,
  },
});
