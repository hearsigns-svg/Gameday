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
import { useCardExpansion } from '../../../core/cardExpansion';
import { useReduceMotion } from '../../../core/useReduceMotion';
import {
  CalendarOffBanner,
  CarouselDots,
  EmptyState,
  FollowRail,
  SectionHeader,
  SportCard,
} from '../../../core/components';
import { ExpandingHero } from '../ExpandingHero';
// Namespace import: `t` is this component's theme binding, so the
// catalog rides `i18n.t` here (and in every screen with a theme).
import * as i18n from '../../../core/i18n';
import { calendarChoice } from '../../calendar-sync/data/calendarChoice';
import { isExcluded, loadExclusions } from '../../calendar-sync/data/exclusionStore';
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
import { Followable, loadFollowables } from '../data/followStore';
import { sportByKey, SPORTS } from '../domain/sportsConfig';
import {
  byPriority,
  cachedPriorities,
  competitionTileFillFor,
  followMarkUrl,
  refreshPriorities,
} from '../data/browsePriority';
import { followQueryKeys } from '../domain/followScopes';
import { sportLabelFor } from '../domain/sportTerms';
import { activeRegion } from '../../../core/regionStore';
import { flagEmojiOf } from '../../../core/nationality';

type Props = TabScreenProps<'Home'>;

// The carousel is now the ONLY "what's next" surface on Home, so it
// carries the whole run rather than a teaser of it.
const CAROUSEL_MAX = 10;

// Auto-advance (Round 2 item 5): one tunable interval. The carousel
// snaps to the next card on this cadence — pausing under a finger and
// while any card is expanded, resetting after a manual swipe, and off
// entirely under reduced motion or with a single card.
const HERO_ADVANCE_MS = 8_000;

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
      // A removal made while this screen is open repaints the card as
      // removed; it only LEAVES on the next entry.
      forceRepaint((n) => n + 1);
    };
    const unsub = subscribeSync(refresh);
    const focus = navigation.addListener('focus', () => {
      setExcludedAtEntry(loadExclusions());
      refresh();
    });
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

  // REMOVED EVENTS DO NOT VANISH UNDER YOUR FINGER. The exclusion set is
  // sampled when the screen is entered, not read live: removing an event
  // from its own card used to delete the card you were looking at, which
  // reads as the app losing your place — and leaves nothing to undo
  // against. It goes on the next visit, greyed until then.
  const [excludedAtEntry, setExcludedAtEntry] = useState<Set<string>>(
    loadExclusions,
  );
  const [, forceRepaint] = useState(0);

  const upcoming = useMemo(
    () =>
      fixtures.filter(
        (f) => new Date(f.startUtc).getTime() > Date.now() - 3_600_000,
      ),
    [fixtures],
  );

  const carousel = useMemo(
    () => upcoming.filter((f) => !excludedAtEntry.has(f.id)).slice(0, CAROUSEL_MAX),
    [upcoming, excludedAtEntry],
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
            : i18n.t('follows.home.nothingScheduled'),
          glyph: sport?.glyph ?? '🏟️',
          // The served competition mark first, then the stored crest
          // (followMarkUrl, Round 6 order) — prepared marks live in
          // the map and must beat a crest captured at follow time.
          ...(followMarkUrl(item)
            ? { imageUrl: followMarkUrl(item) as string }
            : {}),
          ...(competitionTileFillFor(item.key)
            ? { tileFill: competitionTileFillFor(item.key) as string }
            : {}),
          // An athlete's flag, where the follow captured one.
          ...(flagEmojiOf(item.countryCode)
            ? { badge: flagEmojiOf(item.countryCode) as string }
            : {}),
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

  // ── Looping + auto-advance (Round 2 items 5/6) ──────────────────────
  //
  // LOOP: with looping on, the data renders three times and the list
  // starts in the middle copy; whenever a settle lands outside it, the
  // offset is silently re-centred by one copy's width — so a swipe past
  // either end simply continues, and there is no dead end to hit. Dots
  // and the expanded card's pager keep using the REAL index (idx % n).
  // Both behaviours stand down with a single card and under reduced
  // motion.
  const reduceMotion = useReduceMotion();
  const expansion = useCardExpansion();
  const n = carousel.length;
  const looping = n >= 2 && !reduceMotion;
  const heroRef = useRef<FlatList<UpcomingFixture>>(null);
  const loopIndexRef = useRef(looping ? n : 0);
  const touchingRef = useRef(false);
  const autoAdvancingRef = useRef(false);
  const lastUserSwipeAt = useRef(0);
  const heroData = useMemo(
    () => (looping ? [...carousel, ...carousel, ...carousel] : carousel),
    [carousel, looping],
  );
  const recentre = (idx: number): number => {
    if (!looping) return idx;
    if (idx >= n && idx < 2 * n) return idx;
    const centred = n + ((idx % n) + n) % n;
    heroRef.current?.scrollToOffset({ offset: centred * snap, animated: false });
    return centred;
  };
  const onHeroSettle = (offsetX: number) => {
    const idx = Math.max(0, Math.round(offsetX / snap));
    loopIndexRef.current = recentre(idx);
    if (!autoAdvancingRef.current) lastUserSwipeAt.current = Date.now();
    autoAdvancingRef.current = false;
    setPage(Math.min(n - 1, Math.max(0, loopIndexRef.current % n)));
  };
  // The 25s cadence: one interval, condition-checked per tick so a
  // pause never needs teardown. A manual swipe "resets the timer" by
  // stamping lastUserSwipeAt — ticks inside the window are skipped.
  useEffect(() => {
    // Start (and restart on a size change) at the middle copy.
    if (!looping) return;
    loopIndexRef.current = n;
  }, [looping, n]);
  useEffect(() => {
    if (!looping) return;
    const id = setInterval(() => {
      if (touchingRef.current) return;
      if (expansion.liftedKey !== null) return; // never under an expanded card
      if (Date.now() - lastUserSwipeAt.current < HERO_ADVANCE_MS) return;
      autoAdvancingRef.current = true;
      heroRef.current?.scrollToOffset({
        offset: (loopIndexRef.current + 1) * snap,
        animated: true,
      });
    }, HERO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [looping, n, snap, expansion.liftedKey === null]);

  // The poster itself lives in follows/FixtureHero.tsx, and tapping it
  // does not navigate anywhere: the card measures where it is and grows
  // into the expanded state from exactly there (core/cardExpansion).

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={i18n.t('follows.search.a11y')}
        onPress={() => navigation.navigate('Search')}
        style={({ pressed }) => [
          styles.searchBar,
          { backgroundColor: t.surface, borderColor: t.border },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text style={[type.body, { color: t.textSecondary }]} accessible={false}>
          {`🔍  ${i18n.t('follows.search.placeholder')}`}
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
            ref={heroRef}
            horizontal
            data={heroData}
            keyExtractor={(f, i) =>
              looping ? `${f.id}-${Math.floor(i / Math.max(n, 1))}` : f.id
            }
            // Near-viewport cards only at first paint (Stage 4B): the
            // default of ten mounted every hero at once and their photo
            // lookups fired together — the burst that rate-limited the
            // whole batch. Three keeps the visible card and its
            // neighbours instant; the rest mount as you swipe.
            initialNumToRender={3}
            // Fixed geometry, declared: what lets the loop start in the
            // MIDDLE copy without a visible post-mount jump.
            getItemLayout={(_d, i) => ({ length: snap, offset: i * snap, index: i })}
            initialScrollIndex={looping ? n : 0}
            showsHorizontalScrollIndicator={false}
            snapToInterval={snap}
            decelerationRate="fast"
            disableIntervalMomentum
            contentContainerStyle={{ paddingHorizontal: spacing.l }}
            ItemSeparatorComponent={() => <View style={{ width: spacing.m }} />}
            onTouchStart={() => {
              touchingRef.current = true;
            }}
            onTouchEnd={() => {
              touchingRef.current = false;
            }}
            onMomentumScrollEnd={(e) => onHeroSettle(e.nativeEvent.contentOffset.x)}
            renderItem={({ item }) => (
              <ExpandingHero
                item={item}
                follows={follows}
                width={cardWidth}
                pagerIds={carousel.map((f) => f.id)}
                removed={isExcluded(item.id)}
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
          headline={i18n.t('follows.home.emptyHeadline')}
          body={i18n.t('follows.home.emptyBody')}
        />
      ) : (
        <EmptyState
          headline={i18n.t('follows.home.welcomeHeadline')}
          body={i18n.t('follows.home.welcomeBody')}
        />
      )}

      {railItems.length > 0 ? (
        <>
          <SectionHeader title={i18n.t('follows.following')} />
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

      <SectionHeader
        title={
          followCount > 0
            ? i18n.t('follows.home.addSports')
            : i18n.t('follows.home.chooseSport')
        }
      />
      <View style={styles.grid}>
        {orderedSports.map((s) => {
          const label = sportLabelFor(s.key, s.label, activeRegion());
          return (
            <SportCard
              key={s.key}
              label={label}
              glyph={s.glyph}
              theme={teamTheme(s.accent, mode)}
              // What the tile IS, never the user's state: only F1 has a
              // series follow, so a "Following" caption could only ever
              // appear on that one tile — one card announcing state in a
              // grid of eleven that cannot (Round 4 ruling; verified:
              // seriesFollowable exists on exactly one sport).
              caption={
                s.seriesFollowable
                  ? i18n.t('follows.home.oneFollow')
                  : i18n.t('follows.home.browse')
              }
              onPress={() =>
                navigation.navigate('LeagueList', { sportKey: s.key })
              }
              accessibilityLabel={label}
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
