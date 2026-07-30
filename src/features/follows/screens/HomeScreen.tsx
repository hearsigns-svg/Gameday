// Home answers one question at a glance: when do I next care?
// Hero = the soonest fixture; Next up = what follows it; sport pills =
// the way in. Managing follows lives on the Following tab.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  CalendarOffBanner,
  EmptyState,
  EventRow,
  HeroCard,
  SectionHeader,
  SportPill,
} from '../../../core/components';
import { calendarChoice } from '../../calendar-sync/data/calendarChoice';
import { followFeedback } from '../followFeedback';
import { TabScreenProps } from '../../../core/navigation';
import { useColorSchemeMode } from '../../../core/useColorSchemeMode';
import { messageOf } from '../../../core/result';
import { teamTheme } from '../../../core/teamTheme';
import { radius, spacing, type, useTheme } from '../../../core/tokens';
import {
  subscribeSync,
  UpcomingFixture,
  upcomingFixtures,
} from '../../calendar-sync/syncEngine';
import { isDateOnly, timeLabel, whenLabel } from '../../../core/when';
import { follow, unfollow } from '../followActions';
import { Followable, isFollowed, loadFollowables } from '../data/followStore';
import { identityFollow } from '../domain/followIdentity';
import { SportConfig, sportByKey, SPORTS } from '../domain/sportsConfig';

type Props = TabScreenProps<'Home'>;

const NEXT_UP_COUNT = 5;

export default function HomeScreen({ navigation }: Props) {
  const t = useTheme();
  const mode = useColorSchemeMode();
  const [fixtures, setFixtures] = useState<UpcomingFixture[]>(upcomingFixtures);
  const [follows, setFollows] = useState<Followable[]>(loadFollowables);
  const followCount = follows.length;
  const [error, setError] = useState<string | null>(null);
  const [busySport, setBusySport] = useState<string | null>(null);
  const [, forceRender] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setFixtures(upcomingFixtures());
      setFollows(loadFollowables());
    };
    const unsub = subscribeSync(refresh);
    const focus = navigation.addListener('focus', refresh);
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
      const wasFollow = !isFollowed(series.key);
      const r = wasFollow ? await follow(item) : await unfollow(item);
      if (!r.ok && r.error.kind !== 'sync-in-progress') {
        setError(messageOf(r.error));
      } else {
        setError(null);
        followFeedback(r, item, wasFollow, () =>
          navigation.navigate('CalendarPriming'),
        );
      }
      pillBusyRef.current = false;
      setBusySport(null);
      forceRender((n) => n + 1);
    },
    [navigation],
  );

  const heroSport = hero ? sportByKey(hero.sport) : null;
  // The hero wears the followed entity's identity when we have it —
  // brand colour and crest captured at follow time; sport hue otherwise.
  const heroFollow: Followable | undefined = hero
    ? identityFollow(hero.followKeys, follows)
    : undefined;

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

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search teams, competitions and sports"
        onPress={() => navigation.navigate('Search')}
        style={({ pressed }) => [
          styles.searchBar,
          { backgroundColor: t.surface, borderColor: t.border },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text style={[type.body, { color: t.textSecondary }]} accessible={false}>
          🔍  Team, competition or sport
        </Text>
      </Pressable>

      {followCount > 0 && calendarChoice() !== 'enabled' ? (
        <CalendarOffBanner
          fixtureCount={fixtures.length}
          onEnable={() => navigation.navigate('CalendarPriming')}
        />
      ) : null}

      {hero ? (
        <View style={{ marginTop: spacing.l }}>
          <HeroCard
            title={hero.title}
            competition={hero.competition}
            startUtc={hero.startUtc}
            status={hero.status}
            glyph={heroSport?.glyph ?? '🏟️'}
            crestUrl={heroFollow?.crestUrl}
            theme={teamTheme(
              heroFollow?.brandColour ?? heroSport?.accent ?? null,
              mode,
            )}
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
              const owner = identityFollow(f.followKeys, follows);
              return (
                <EventRow
                  key={f.id}
                  title={f.title}
                  caption={`${whenLabel(f.startUtc, isDateOnly(f.status))} · ${f.competition}`}
                  timeText={timeLabel(f.startUtc, f.status)}
                  tbc={f.status === 'tbd' || f.status === 'postponed'}
                  glyph={sport?.glyph ?? '🏟️'}
                  crestUrl={owner?.crestUrl}
                  theme={teamTheme(
                    owner?.brandColour ?? sport?.accent ?? null,
                    mode,
                  )}
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
  searchBar: {
    marginHorizontal: spacing.l,
    marginTop: spacing.m,
    paddingHorizontal: spacing.l,
    minHeight: 44,
    borderRadius: radius.button,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
});
