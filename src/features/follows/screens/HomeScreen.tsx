// Home answers one question at a glance: when do I next care?
// Carousel = the next few fixtures, swipeable (never auto-advancing);
// Next up = the rest of the week at a glance; sport cards = the way in.
// Home never follows anything directly — every card navigates, and
// Follow buttons are always visible where they act (owner ruling).

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  CalendarOffBanner,
  CarouselDots,
  EmptyState,
  EventRow,
  HeroCard,
  SectionHeader,
  SportCard,
} from '../../../core/components';
import { calendarChoice } from '../../calendar-sync/data/calendarChoice';
import { loadExclusions } from '../../calendar-sync/data/exclusionStore';
import { TabScreenProps } from '../../../core/navigation';
import { useColorSchemeMode } from '../../../core/useColorSchemeMode';
import { teamTheme } from '../../../core/teamTheme';
import { radius, spacing, type, useTheme } from '../../../core/tokens';
import {
  subscribeSync,
  UpcomingFixture,
  upcomingFixtures,
} from '../../calendar-sync/syncEngine';
import { isDateOnly, timeLabel, whenLabel } from '../../../core/when';
import {
  Followable,
  isFollowed,
  loadFollowables,
  setVenueArt,
} from '../data/followStore';
import { resolveVenuePhoto } from '../data/venueArt';
import { identityFollow } from '../domain/followIdentity';
import { sportByKey, SPORTS } from '../domain/sportsConfig';

type Props = TabScreenProps<'Home'>;

const CAROUSEL_MAX = 4;
const NEXT_UP_COUNT = 3;

export default function HomeScreen({ navigation }: Props) {
  const t = useTheme();
  const mode = useColorSchemeMode();
  const { width: windowWidth } = useWindowDimensions();
  const [fixtures, setFixtures] = useState<UpcomingFixture[]>(upcomingFixtures);
  const [follows, setFollows] = useState<Followable[]>(loadFollowables);
  const [page, setPage] = useState(0);
  const followCount = follows.length;

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

  const [carousel, nextUp] = useMemo(() => {
    // Removed (excluded) events never lead Home — they live greyed on
    // Schedule. Re-reads on every sync-triggered refresh.
    const excluded = loadExclusions();
    const upcoming = fixtures.filter(
      (f) =>
        new Date(f.startUtc).getTime() > Date.now() - 3_600_000 &&
        !excluded.has(f.id),
    );
    const heroes = upcoming.slice(0, CAROUSEL_MAX);
    return [heroes, upcoming.slice(heroes.length, heroes.length + NEXT_UP_COUNT)];
  }, [fixtures]);

  // A refresh can shrink the carousel under the current page (FlatList
  // clamps the offset without a momentum event) — keep the dot honest.
  useEffect(() => {
    setPage((p) => Math.min(p, Math.max(0, carousel.length - 1)));
  }, [carousel.length]);

  // Lazy venue photography (docs/IMAGERY.md Tier 1): resolve once per
  // team follow the first time it fronts a hero card; null results are
  // persisted so nothing re-fetches on every render.
  const resolvingArt = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const f of carousel) {
      const owner = identityFollow(f.followKeys, follows);
      if (!owner || owner.type !== 'team') continue;
      if (owner.venueArt !== undefined) continue;
      if (resolvingArt.current.has(owner.key)) continue;
      resolvingArt.current.add(owner.key);
      void resolveVenuePhoto(owner.label).then((r) => {
        resolvingArt.current.delete(owner.key);
        if (r.status === 'failed') return; // transient — retry next time
        setVenueArt(owner.key, r.status === 'found' ? r.art : null);
        setFollows(loadFollowables());
      });
    }
  }, [carousel, follows]);

  const cardWidth = windowWidth - spacing.l * 2;
  const snap = cardWidth + spacing.m;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
      contentInsetAdjustmentBehavior="automatic"
    >
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

      {carousel.length > 0 ? (
        <View style={{ marginTop: spacing.l }}>
          <FlatList
            horizontal
            data={carousel}
            keyExtractor={(f) => f.id}
            showsHorizontalScrollIndicator={false}
            snapToInterval={snap}
            decelerationRate="fast"
            disableIntervalMomentum
            contentContainerStyle={{ paddingHorizontal: spacing.l }}
            ItemSeparatorComponent={() => <View style={{ width: spacing.m }} />}
            onMomentumScrollEnd={(e) =>
              setPage(
                Math.min(
                  carousel.length - 1,
                  Math.max(0, Math.round(e.nativeEvent.contentOffset.x / snap)),
                ),
              )
            }
            renderItem={({ item }) => {
              const sport = sportByKey(item.sport);
              const owner = identityFollow(item.followKeys, follows);
              return (
                <HeroCard
                  title={item.title}
                  competition={item.competition}
                  startUtc={item.startUtc}
                  status={item.status}
                  glyph={sport?.glyph ?? '🏟️'}
                  crestUrl={owner?.crestUrl}
                  photoUrl={owner?.venueArt?.url}
                  photoCredit={
                    owner?.venueArt
                      ? [
                          owner.venueArt.artist
                            ? `Photo: ${owner.venueArt.artist}`
                            : 'Photo: Wikimedia Commons',
                          owner.venueArt.licence,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : undefined
                  }
                  theme={teamTheme(
                    owner?.brandColour ?? sport?.accent ?? null,
                    mode,
                  )}
                  style={{ width: cardWidth, marginHorizontal: 0 }}
                />
              );
            }}
          />
          <CarouselDots
            count={carousel.length}
            active={Math.min(page, Math.max(0, carousel.length - 1))}
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
                  tbc={isDateOnly(f.status)}
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
      <View style={styles.grid}>
        {SPORTS.filter((s) => s.enabled).map((s) => {
          const series = s.seriesFollowable;
          const following = series ? isFollowed(series.key) : false;
          return (
            <SportCard
              key={s.key}
              label={s.label}
              glyph={s.glyph}
              theme={teamTheme(s.accent, mode)}
              caption={
                series ? (following ? 'Following' : 'One follow') : 'Browse'
              }
              captionAccent={following}
              onPress={() =>
                navigation.navigate('LeagueList', { sportKey: s.key })
              }
              accessibilityLabel={`${s.label}${following ? ', following' : ''}`}
            />
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: {
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
