// Following: what you follow, and whether each is in your calendar
// (owner brief "Per-follow calendar control", 2026-09-23).
//
// Follows sit under their sport, in browse's regional sport order
// (domain/followingSections.ts). A row is the entity and its calendar
// glyph — nothing else: Following is implied by being on this page, and
// unfollowing lives on the entity's own page. A sport header's glyph
// speaks for every follow under it: ✓ only when all of them are in,
// otherwise + ; + puts them all in, ✓ takes them all out.

import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  EmptyState,
  monogramOf,
  SportCard,
  TileRow,
} from '../../../core/components';
import { TabScreenProps } from '../../../core/navigation';
// Namespace import: `t` is this component's theme binding.
import * as i18n from '../../../core/i18n';
import {
  byPriority,
  cachedPriorities,
  competitionTileFillFor,
  followMarkUrl,
  subscribePriorities,
} from '../data/browsePriority';
import { useColorSchemeMode } from '../../../core/useColorSchemeMode';
import { useReduceMotion } from '../../../core/useReduceMotion';
import { teamTheme } from '../../../core/teamTheme';
import { flagEmojiOf } from '../../../core/nationality';
import { spacing, type, useTheme } from '../../../core/tokens';
import { subscribeSync, upcomingByFollow } from '../../calendar-sync/syncEngine';
import { Followable, loadFollowables, subscribeFollows } from '../data/followStore';
import { followingSections } from '../domain/followingSections';
import { sportByKey, SPORTS } from '../domain/sportsConfig';
import { sportLabelFor } from '../domain/sportTerms';
import { olympicSportGlyph } from '../domain/olympicGlyphs';
import { tennisSexGlyph } from '../../fixtures/domain/tennisKeys';
import { activeRegion } from '../../../core/regionStore';
import { FollowCalendarControl } from '../FollowCalendarControl';

type Props = TabScreenProps<'Following'>;

// One list, two kinds of line: a sport's header and a follow's row.
type Line =
  | { kind: 'sport'; sportKey: string; title: string; keys: string[] }
  | { kind: 'follow'; follow: Followable };

// The row's second line is the follow's schedule state. The sport it
// used to lead with is now the header above it. Between seasons a
// followed team genuinely has nothing ahead — say so rather than show a
// bare row that reads as broken (DESIGN_SYSTEM Voice).
function captionFor(upcomingCount: number | undefined): string | undefined {
  if (upcomingCount === undefined) return undefined;
  if (upcomingCount === 0) return i18n.t('follows.following.noUpcoming');
  return i18n.tn('follows.following.upcoming', upcomingCount);
}

function sportTitle(sportKey: string): string {
  const cfg = sportByKey(sportKey);
  return cfg ? sportLabelFor(cfg.key, cfg.label, activeRegion()) : sportKey;
}

export default function FollowingScreen({ navigation }: Props) {
  const t = useTheme();
  const mode = useColorSchemeMode();
  const [follows, setFollows] = useState<Followable[]>(loadFollowables);
  const [upcoming, setUpcoming] = useState<Record<string, number>>(
    upcomingByFollow,
  );
  const [weights, setWeights] = useState(() => cachedPriorities().sportWeights);
  const reduceMotion = useReduceMotion();
  // A TAB PRESS LANDS AT THE ENTRY STATE (Round 4 B3): the top, whether
  // this tab is already frontmost or being switched back to.
  const listRef = useRef<FlatList<Line>>(null);
  useEffect(
    () =>
      navigation.addListener('tabPress', () => {
        listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion });
      }),
    [navigation, reduceMotion],
  );

  useEffect(() => {
    const unsub = subscribeSync(() => {
      setFollows(loadFollowables());
      setUpcoming(upcomingByFollow());
    });
    // Marks, tile fills and the sport order paint from the priorities
    // cache at render — repaint when a fetch lands (Round 6 follow-up).
    const unsubArt = subscribePriorities(() => {
      setFollows(loadFollowables());
      setWeights(cachedPriorities().sportWeights);
    });
    // A calendar glyph tapped anywhere (a hero card, this page) changes
    // the store at once; every glyph here repaints from it.
    const unsubFollows = subscribeFollows(() => setFollows(loadFollowables()));
    const focus = navigation.addListener('focus', () =>
      setFollows(loadFollowables()),
    );
    return () => {
      unsub();
      unsubArt();
      unsubFollows();
      focus();
    };
  }, [navigation]);

  // Browse's order: the same tiles, the same regional weights.
  const lines = useMemo<Line[]>(() => {
    const tileOrder = byPriority(
      SPORTS.filter((s) => !s.hiddenTile),
      (s) => s.key,
      weights,
    ).map((s) => s.key);
    return followingSections(follows, SPORTS, tileOrder).flatMap(
      (section): Line[] => [
        {
          kind: 'sport',
          sportKey: section.sportKey,
          title: sportTitle(section.sportKey),
          keys: section.follows.map((f) => f.key),
        },
        ...section.follows.map((follow): Line => ({ kind: 'follow', follow })),
      ],
    );
  }, [follows, weights]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {follows.length === 0 ? (
        <EmptyState
          headline={i18n.t('follows.following.emptyHeadline')}
          body={i18n.t('follows.following.emptyBody')}
          actionLabel={i18n.t('follows.following.browseSports')}
          onAction={() => navigation.navigate('SportPicker')}
        />
      ) : (
        <FlatList
          ref={listRef}
          data={lines}
          keyExtractor={(line) =>
            line.kind === 'sport' ? `sport:${line.sportKey}` : line.follow.key
          }
          renderItem={({ item: line, index }) => {
            if (line.kind === 'sport') {
              return (
                <View
                  style={[
                    styles.sportHeader,
                    index === 0 ? styles.sportHeaderFirst : null,
                  ]}
                >
                  <Text
                    accessibilityRole="header"
                    style={[type.heading, { color: t.textPrimary, flex: 1 }]}
                    numberOfLines={1}
                  >
                    {line.title}
                  </Text>
                  <FollowCalendarControl
                    keys={line.keys}
                    name={line.title}
                    variant="row"
                    scope="sport"
                  />
                </View>
              );
            }
            const item = line.follow;
            const sport = sportByKey(item.sportKey);
            const caption = captionFor(upcoming[item.key]);
            return (
              // THE RAIL STAYS ROUND, THE LIST GOES SQUARE (owner
              // ruling, 22b). Round reads as people and teams; square
              // reads as things you open.
              <TileRow
                right={
                  <FollowCalendarControl
                    keys={[item.key]}
                    name={item.label}
                    variant="row"
                  />
                }
              >
                <SportCard
                  fullWidth
                  label={item.label}
                  {...(caption ? { caption } : {})}
                  // An Olympic sport wears its own emoji (Round 7 item 5).
                  glyph={olympicSportGlyph(item.key) ?? sport?.glyph ?? '·'}
                  theme={teamTheme(
                    item.brandColour ?? sport?.accent ?? null,
                    mode,
                  )}
                  {...(olympicSportGlyph(item.key) ? {} : { monogram: monogramOf(item.label) })}
                  {...(followMarkUrl(item)
                    ? { imageUrl: followMarkUrl(item) as string }
                    : {})}
                  {...(competitionTileFillFor(item.key)
                    ? { tileFill: competitionTileFillFor(item.key) as string }
                    : {})}
                  // The flag for an athlete; Mars/Venus for a sexed
                  // tennis follow (Round 7 item 8).
                  {...(flagEmojiOf(item.countryCode)
                    ? { tileBadge: flagEmojiOf(item.countryCode) as string }
                    : tennisSexGlyph(item.key)
                      ? { tileBadge: tennisSexGlyph(item.key) as string }
                      : {})}
                  accessibilityLabel={i18n.t('follows.following.a11yRow', {
                    name: item.label,
                    // The display word, never the raw enum — the enum
                    // is English whatever language the sentence is in
                    // (caught by the de translation pass).
                    type: i18n.t(
                      `core.followType.${item.type}` as i18n.CatalogKey,
                    ),
                  })}
                  // The entity's own page: its schedule, and the one
                  // place to unfollow it.
                  onPress={() =>
                    navigation.navigate('Team', {
                      teamKey: item.key,
                      name: item.label,
                      sportKey: item.sportKey,
                      followType: item.type,
                      ...(item.pollPath ? { pollPath: item.pollPath } : {}),
                      ...(item.crestUrl ? { crestUrl: item.crestUrl } : {}),
                      ...(item.brandColour ? { colours: item.brandColour } : {}),
                    })
                  }
                />
              </TileRow>
            );
          }}
          ListFooterComponent={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={i18n.t('follows.following.a11yAddMore')}
              onPress={() => navigation.navigate('SportPicker')}
              style={[styles.addMore, { borderColor: t.border }]}
            >
              <Text style={[type.body, { color: t.primary, fontWeight: '600' }]}>
                {i18n.t('follows.following.addMore')}
              </Text>
            </Pressable>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // A sport's header: weight and space carry the grouping (AGENTS rule
  // 12 — no caps section labels). Its glyph shares the rows' right edge:
  // the same gutter, the same touch target.
  sportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.l,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xs,
  },
  sportHeaderFirst: { paddingTop: spacing.m },
  addMore: {
    margin: spacing.l,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
