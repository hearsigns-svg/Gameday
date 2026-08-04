// Home asks two DIFFERENT questions, which is the whole layout rule:
//   Carousel  — when do I next care? (time)
//   Following — whose schedule can I open? (identity)
// It used to ask the first one twice: "Next up" was slice(n, n+3) of the
// same array the carousel sliced 0..n, so it was the same stream in a
// smaller font, and items 5-7 could all be the same afternoon.
// Sport cards = the way in for anything not followed yet.
//
// Home never follows anything directly — every card navigates, and
// Follow buttons are always visible where they act (owner ruling).

import { useEffect, useMemo, useState } from 'react';
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
  FollowRail,
  SectionHeader,
  SportCard,
} from '../../../core/components';
import { FixtureHero } from '../FixtureHero';
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
import { isDateOnly, whenLabel } from '../../../core/when';
import {
  Followable,
  isFollowed,
  loadFollowables,
} from '../data/followStore';
import { sportByKey, SPORTS } from '../domain/sportsConfig';
import { byPriority, cachedPriorities, refreshPriorities } from '../data/browsePriority';
import { followQueryKeys } from '../domain/followScopes';
import { sportLabelFor } from '../domain/sportTerms';
import { activeRegion } from '../../../core/regionStore';

type Props = TabScreenProps<'Home'>;

// The carousel is now the ONLY "what's next" surface on Home, so it
// carries the whole run rather than a teaser of it.
const CAROUSEL_MAX = 10;

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
    // Ordering weights are data (Prompt 11): refresh the cache in the
    // background; this render uses whatever is already cached.
    void refreshPriorities();
    return () => {
      unsub();
      focus();
    };
  }, [navigation]);

  // Sports ordered by catalogue weight — "the top sports should lead
  // the list" — falling back to config order until a cache exists.
  const orderedSports = useMemo(
    () =>
      byPriority(
        SPORTS.filter((s) => s.enabled),
        (s) => s.key,
        cachedPriorities().sportWeights,
      ),
    [follows],
  );

  const upcoming = useMemo(() => {
    // Removed (excluded) events never lead Home — they live greyed on
    // Schedule. Re-reads on every sync-triggered refresh.
    const excluded = loadExclusions();
    return fixtures.filter(
      (f) =>
        new Date(f.startUtc).getTime() > Date.now() - 3_600_000 &&
        !excluded.has(f.id),
    );
  }, [fixtures]);

  const carousel = useMemo(
    () => upcoming.slice(0, CAROUSEL_MAX),
    [upcoming],
  );

  // Everything followed, soonest first, each showing when it next plays.
  // Ordering by next fixture rather than by follow date is what makes
  // this useful at a glance instead of just a list of names.
  const railItems = useMemo(() => {
    const next = new Map<string, UpcomingFixture>();
    for (const f of upcoming) {
      // `upcoming` is already ascending, so first write wins.
      for (const key of f.followKeys) if (!next.has(key)) next.set(key, f);
    }
    // A follow's next fixture may carry only its SCOPED key (a
    // finals-slot doc mid-tournament, a final-round golf doc) — judge
    // by the same query keys the fetch used, or a live follow reads
    // "nothing scheduled" while its event sits in the carousel.
    const nextFor = (fw: Followable): UpcomingFixture | undefined => {
      for (const k of followQueryKeys(fw)) {
        const hit = next.get(k);
        if (hit) return hit;
      }
      return undefined;
    };
    return [...follows]
      .sort((a, b) => {
        const sa = nextFor(a)?.startUtc;
        const sb = nextFor(b)?.startUtc;
        if (sa && sb) return sa.localeCompare(sb);
        // Follows with nothing scheduled sink, alphabetical among
        // themselves — an off-season team is still worth opening.
        return sa ? -1 : sb ? 1 : a.label.localeCompare(b.label);
      })
      .map((item) => {
        const sport = sportByKey(item.sportKey);
        const fixture = nextFor(item);
        return {
          key: item.key,
          label: item.label,
          caption: fixture
            ? whenLabel(fixture.startUtc, isDateOnly(fixture.status, fixture.timePrecision))
            : 'Nothing scheduled',
          glyph: sport?.glyph ?? '🏟️',
          // The crest the follow already carries. Its absence here was
          // the whole of the reported bug: the rail had no field for an
          // image, so an NBA team showed a monogram on Home and its
          // crest one tap later (Prompt 16 C).
          ...(item.crestUrl ? { imageUrl: item.crestUrl } : {}),
          theme: teamTheme(item.brandColour ?? sport?.accent ?? null, mode),
        };
      });
  }, [follows, upcoming, mode]);

  // A refresh can shrink the carousel under the current page (FlatList
  // clamps the offset without a momentum event) — keep the dot honest.
  useEffect(() => {
    setPage((p) => Math.min(p, Math.max(0, carousel.length - 1)));
  }, [carousel.length]);

  const cardWidth = windowWidth - spacing.l * 2;
  const snap = cardWidth + spacing.m;

  // The poster itself now lives in follows/FixtureHero.tsx, so the
  // carousel card and the expanded card it opens are literally the same
  // component — tapping one shows more of the same thing, not a
  // different-looking surface.

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search teams, athletes, competitions and sports"
        onPress={() => navigation.navigate('Search')}
        style={({ pressed }) => [
          styles.searchBar,
          { backgroundColor: t.surface, borderColor: t.border },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text style={[type.body, { color: t.textSecondary }]} accessible={false}>
          🔍  Team, athlete, competition or sport
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
            renderItem={({ item }) => (
              <FixtureHero
                item={item}
                follows={follows}
                onPress={() =>
                  navigation.navigate('Fixture', {
                    fixtureId: item.id,
                    title: item.title,
                  })
                }
                style={{ width: cardWidth, marginHorizontal: 0 }}
              />
            )}
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

      {railItems.length > 0 ? (
        <>
          <SectionHeader title="Following" />
          <FollowRail
            items={railItems}
            onPress={(key) => {
              const item = follows.find((f) => f.key === key);
              if (!item) return;
              navigation.navigate('Team', {
                teamKey: item.key,
                name: item.label,
                sportKey: item.sportKey,
                followType: item.type,
                ...(item.pollPath ? { pollPath: item.pollPath } : {}),
                ...(item.crestUrl ? { crestUrl: item.crestUrl } : {}),
                ...(item.brandColour ? { colours: item.brandColour } : {}),
              });
            }}
          />
        </>
      ) : null}

      <SectionHeader title={followCount > 0 ? 'Add sports' : 'Choose a sport'} />
      <View style={styles.grid}>
        {orderedSports.map((s) => {
          const series = s.seriesFollowable;
          const following = series ? isFollowed(series.key) : false;
          return (
            <SportCard
              key={s.key}
              label={sportLabelFor(s.key, s.label, activeRegion())}
              glyph={s.glyph}
              theme={teamTheme(s.accent, mode)}
              caption={
                series ? (following ? 'Following' : 'One follow') : 'Browse'
              }
              captionAccent={following}
              onPress={() =>
                navigation.navigate('LeagueList', { sportKey: s.key })
              }
              accessibilityLabel={`${sportLabelFor(s.key, s.label, activeRegion())}${following ? ', following' : ''}`}
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
