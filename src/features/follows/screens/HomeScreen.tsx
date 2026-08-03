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
import { monogramOf,
  CalendarOffBanner,
  CarouselDots,
  EmptyState,
  FollowRail,
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
import { isDateOnly, whenLabel } from '../../../core/when';
import {
  Followable,
  isFollowed,
  loadFollowables,
} from '../data/followStore';
import { useVenuePhoto, useVenuePlacePhoto } from '../useEntityPhoto';
import { identityFollow } from '../domain/followIdentity';
import { sportByKey, SPORTS } from '../domain/sportsConfig';

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
    return () => {
      unsub();
      focus();
    };
  }, [navigation]);

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
    return [...follows]
      .sort((a, b) => {
        const sa = next.get(a.key)?.startUtc;
        const sb = next.get(b.key)?.startUtc;
        if (sa && sb) return sa.localeCompare(sb);
        // Follows with nothing scheduled sink, alphabetical among
        // themselves — an off-season team is still worth opening.
        return sa ? -1 : sb ? 1 : a.label.localeCompare(b.label);
      })
      .map((item) => {
        const sport = sportByKey(item.sportKey);
        const fixture = next.get(item.key);
        return {
          key: item.key,
          label: item.label,
          caption: fixture
            ? whenLabel(fixture.startUtc, isDateOnly(fixture.status))
            : 'Nothing scheduled',
          glyph: sport?.glyph ?? '🏟️',
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

  // A component so the venue-photo hook is legal inside renderItem.
  // Identity comes from the FIXTURE first (who is playing, where) and
  // only then from whichever follow pulled it in — a competition follow
  // knows the league and nothing about the two clubs, which is why those
  // cards fell all the way through to the sport emoji.
  function Hero({ item, width }: { item: UpcomingFixture; width: number }) {
    const sport = sportByKey(item.sport);
    const owner = identityFollow(item.followKeys, follows);
    // The photograph is of the ground the match is PLAYED at, so it
    // follows the home team — not the team you happen to follow.
    // Non-team sports have no home side; fall back to the followed team
    // where there is one, and to the gradient floor otherwise.
    const homeTeam =
      item.homeTeam ?? (owner?.type === 'team' ? owner.label : null);
    // Venue NAME beats home-team lookup where a provider publishes one
    // (TSDB strVenue — golf courses, stadiums): the photo is of the
    // place, and the place resolves DIRECTLY (entity → P18) — the
    // team resolver's P115 hop can never satisfy a venue name (review
    // round). Hooks run unconditionally; the venue result wins.
    const placeArt = useVenuePlacePhoto(item.venue);
    const teamArt = useVenuePhoto(item.venue ? null : homeTeam);
    const art = placeArt ?? teamArt;
    return (
      <HeroCard
        title={item.title}
        competition={item.competition}
        startUtc={item.startUtc}
        status={item.status}
        sportKey={item.sport}
        monogram={monogramOf(
          owner?.label ?? item.homeTeam ?? item.competition,
        )}
        photoUrl={art?.url}
        photoCredit={
          art
            ? [
                art.artist ? `Photo: ${art.artist}` : 'Photo: Wikimedia Commons',
                art.licence,
              ]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
        theme={teamTheme(owner?.brandColour ?? sport?.accent ?? null, mode)}
        style={{ width, marginHorizontal: 0 }}
      />
    );
  }

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
              <Hero item={item} width={cardWidth} />
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
                      ...(item.brandColour ? { colours: item.brandColour } : {}),
              });
            }}
          />
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
