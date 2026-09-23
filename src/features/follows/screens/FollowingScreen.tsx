// Following: manage what Gameday tracks. Follow/unfollow is the primary
// gesture HERE (it's the manage surface); Home stays free of it.
//
// UNFOLLOW IN PLACE (owner ruling 2026-09-23, replacing the Undo row):
// tapping Following unfollows and the row STAYS where it is, its button
// now Follow — no Undo row, no timer, nothing moves. Follow on that row
// puts back exactly what it had (the stored record and its place). The
// rows unfollowed during a visit leave when the page is next opened
// (domain/followingVisit.ts).

import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { monogramOf,
  EmptyState,
  FollowButton,
  SportCard,
  TileRow,
} from '../../../core/components';
import { TabScreenProps } from '../../../core/navigation';
// Namespace import: `t` is this component's theme binding.
import * as i18n from '../../../core/i18n';
import {
  competitionTileFillFor,
  followMarkUrl,
  subscribePriorities,
} from '../data/browsePriority';
import { useColorSchemeMode } from '../../../core/useColorSchemeMode';
import { useReduceMotion } from '../../../core/useReduceMotion';
import { messageOf } from '../../../core/result';
import { showToast } from '../../../core/toast';
import { teamTheme } from '../../../core/teamTheme';
import { flagEmojiOf } from '../../../core/nationality';
import { spacing, type, useTheme } from '../../../core/tokens';
import { subscribeSync, upcomingByFollow } from '../../calendar-sync/syncEngine';
import { refollow, unfollow } from '../followActions';
import { Followable, loadFollowables, subscribeFollows } from '../data/followStore';
import {
  advanceVisit,
  keysAfter,
  openVisit,
  VisitRow,
  visitRows,
} from '../domain/followingVisit';
import { sportByKey } from '../domain/sportsConfig';
import { sportLabelFor } from '../domain/sportTerms';
import { olympicSportGlyph } from '../domain/olympicGlyphs';
import { tennisSexGlyph } from '../../fixtures/domain/tennisKeys';
import { activeRegion } from '../../../core/regionStore';
import { FollowCalendarControl } from '../FollowCalendarControl';

type Props = TabScreenProps<'Following'>;

// Between seasons a followed team genuinely has nothing ahead — say so
// rather than showing a bare row that reads as broken.
function captionFor(item: Followable, upcomingCount: number | undefined): string {
  const cfg = sportByKey(item.sportKey);
  const sport = cfg
    ? sportLabelFor(cfg.key, cfg.label, activeRegion())
    : item.sportKey;
  if (upcomingCount === undefined) return sport;
  if (upcomingCount === 0) {
    return i18n.t('follows.following.captionNoUpcoming', { sport });
  }
  return i18n.tn('follows.following.captionUpcoming', upcomingCount, { sport });
}

export default function FollowingScreen({ navigation }: Props) {
  const t = useTheme();
  const mode = useColorSchemeMode();
  const [follows, setFollows] = useState<Followable[]>(loadFollowables);
  // The rows this visit shows, each in its place for the whole visit.
  const [visit, setVisit] = useState(() =>
    openVisit(loadFollowables(), upcomingByFollow()),
  );
  const reduceMotion = useReduceMotion();
  // A TAB PRESS LANDS AT THE ENTRY STATE (Round 4 B3): the top, whether
  // this tab is already frontmost or being switched back to — and it is
  // the page being OPENED, so it starts a new visit: rows unfollowed on
  // the last one leave now. Coming back from a page pushed on top (an
  // entity's own page) is not an opening; those rows stay.
  const listRef = useRef<FlatList<VisitRow<Followable>>>(null);
  useEffect(
    () =>
      navigation.addListener('tabPress', () => {
        const stored = loadFollowables();
        setFollows(stored);
        setVisit(openVisit(stored, upcomingByFollow()));
        listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion });
      }),
    [navigation, reduceMotion],
  );

  useEffect(() => {
    // Fold the store into the visit — records refresh, new follows join
    // at the end, nothing leaves or moves.
    const refresh = () => {
      const stored = loadFollowables();
      setFollows(stored);
      setVisit((v) => advanceVisit(v, stored, upcomingByFollow()));
    };
    const unsub = subscribeSync(refresh);
    // A tap here (or on a hero card) changes the store at once: the
    // button and the glyph answer before any sync runs.
    const unsubFollows = subscribeFollows(refresh);
    // Marks and tile fills paint from the priorities cache at render —
    // repaint when a fetch lands (Round 6 follow-up).
    const unsubArt = subscribePriorities(refresh);
    const focus = navigation.addListener('focus', refresh);
    return () => {
      unsub();
      unsubFollows();
      unsubArt();
      focus();
    };
  }, [navigation]);

  // No confirmation and no busy state: the button flips at once and stays
  // live, so a quick second tap on the same spot re-follows. A failure is
  // a toast — a line above the list would push every row down.
  const onUnfollow = useCallback(async (item: Followable) => {
    const r = await unfollow(item);
    if (!r.ok && r.error.kind !== 'sync-in-progress') {
      showToast({ message: messageOf(r.error) });
    }
  }, []);

  const onRefollow = useCallback(async (item: Followable, before: string[]) => {
    const r = await refollow(item, before);
    if (!r.ok && r.error.kind !== 'sync-in-progress') {
      showToast({ message: messageOf(r.error) });
    }
  }, []);

  const rows = visitRows(visit, follows);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {rows.length === 0 ? (
        <EmptyState
          headline={i18n.t('follows.following.emptyHeadline')}
          body={i18n.t('follows.following.emptyBody')}
          actionLabel={i18n.t('follows.following.browseSports')}
          onAction={() => navigation.navigate('SportPicker')}
        />
      ) : (
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(row) => row.follow.key}
          renderItem={({ item: row }) => {
            const item = row.follow;
            const sport = sportByKey(item.sportKey);
            return (
              // THE RAIL STAYS ROUND, THE LIST GOES SQUARE (owner
              // ruling, 22b). Round reads as people and teams; square
              // reads as things you open. The rail above and these rows
              // are not the same object at two sizes — the rail is a
              // shortcut strip, the list is the manage surface — so
              // they are allowed to look different a few points apart.
              <TileRow
                right={
                  <FollowButton
                    theme={teamTheme(
                      item.brandColour ?? sport?.accent ?? null,
                      mode,
                    )}
                    following={row.followed}
                    subject={item.label}
                    onPress={() =>
                      void (row.followed
                        ? onUnfollow(item)
                        : onRefollow(item, keysAfter(visit, item.key)))
                    }
                  />
                }
              >
                <SportCard
                  fullWidth
                  // The calendar glyph (owner ruling 2026-09-23): inside the
                  // tile at its right-hand end, before the Following
                  // button — the hero card's placement — and never the
                  // tile's own tap (SportCard lays it beside the press
                  // target at the platform's minimum touch size). An
                  // unfollowed row shows none, as a hero card of an entity
                  // you don't follow shows none; its lane stays reserved,
                  // so the tile never reflows.
                  trailing={
                    <FollowCalendarControl
                      keys={[item.key]}
                      name={item.label}
                      variant="row"
                    />
                  }
                  label={item.label}
                  // The count this visit last saw: an unfollowed row keeps
                  // its caption, so its height never changes under it.
                  caption={captionFor(item, visit.counts[item.key])}
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
                  accessibilityLabel={
                    row.followed
                      ? i18n.t('follows.following.a11yRow', {
                          name: item.label,
                          // The display word, never the raw enum — the enum
                          // is English whatever language the sentence is in
                          // (caught by the de translation pass).
                          type: i18n.t(
                            `core.followType.${item.type}` as i18n.CatalogKey,
                          ),
                        })
                      : i18n.t('follows.card.a11yViewFixtures', { name: item.label })
                  }
                  // A followed thing's own schedule was previously
                  // reachable only from browse or search — you could not
                  // open the page for something you already follow.
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
  addMore: {
    margin: spacing.l,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
