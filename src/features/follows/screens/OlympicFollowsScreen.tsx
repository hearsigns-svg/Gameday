// The Olympic node's page (owner reshape 2026-09-03): the followed
// Olympic sports of ONE season — Summer or Winter — as rows in the
// Following list's own language (emoji tile, "N upcoming" caption, the
// Following control), each opening that sport's fixtures. The strip's
// node wears the count of these rows; this is where the count leads.

import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  EmptyState,
  FollowButton,
  SportCard,
  TileRow,
} from '../../../core/components';
import { RootScreenProps } from '../../../core/navigation';
// Namespace import: `t` is this component's theme binding.
import * as i18n from '../../../core/i18n';
import { useColorSchemeMode } from '../../../core/useColorSchemeMode';
import { messageOf } from '../../../core/result';
import { teamTheme } from '../../../core/teamTheme';
import { spacing, type, useTheme } from '../../../core/tokens';
import { subscribeSync, upcomingByFollow } from '../../calendar-sync/syncEngine';
import { refollow, unfollow } from '../followActions';
import { Followable, loadFollowables } from '../data/followStore';
import { olympicGlyphForKeys } from '../domain/olympicGlyphs';
import { olympicSeasonOf } from '../domain/railGroups';
import { sportByKey } from '../domain/sportsConfig';
import { sportLabelFor } from '../domain/sportTerms';
import { activeRegion } from '../../../core/regionStore';

const UNDO_WINDOW_MS = 6000;

type Props = RootScreenProps<'OlympicFollows'>;

function captionFor(item: Followable, upcomingCount: number | undefined): string {
  const cfg = sportByKey(item.sportKey);
  const sport = cfg ? sportLabelFor(cfg.key, cfg.label, activeRegion()) : item.sportKey;
  if (upcomingCount === undefined) return sport;
  if (upcomingCount === 0) {
    return i18n.t('follows.following.captionNoUpcoming', { sport });
  }
  return i18n.tn('follows.following.captionUpcoming', upcomingCount, { sport });
}

export default function OlympicFollowsScreen({ navigation, route }: Props) {
  const { season } = route.params;
  const t = useTheme();
  const mode = useColorSchemeMode();
  const seasonFollows = () =>
    loadFollowables().filter((f) => olympicSeasonOf(f.key) === season);
  const [follows, setFollows] = useState<Followable[]>(seasonFollows);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [undoItem, setUndoItem] = useState<Followable | null>(null);
  const [upcoming, setUpcoming] = useState<Record<string, number>>(upcomingByFollow);
  const olympics = sportByKey('olympics');

  useEffect(() => {
    if (!undoItem) return;
    const timer = setTimeout(() => setUndoItem(null), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [undoItem]);

  useEffect(() => {
    const unsub = subscribeSync(() => {
      setFollows(seasonFollows());
      setUpcoming(upcomingByFollow());
    });
    const focus = navigation.addListener('focus', () => setFollows(seasonFollows()));
    return () => {
      unsub();
      focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, season]);

  const onUnfollow = useCallback(async (item: Followable) => {
    setBusyKey(item.key);
    setError(null);
    setUndoItem(item); // no confirmation — undo instead (friction rule)
    setFollows((prev) => prev.filter((f) => f.key !== item.key));
    const r = await unfollow(item);
    if (!r.ok && r.error.kind !== 'sync-in-progress') {
      setError(messageOf(r.error));
    }
    setFollows(seasonFollows());
    setBusyKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onUndo = useCallback(async (item: Followable) => {
    setUndoItem(null);
    setError(null);
    const r = await refollow(item);
    if (!r.ok && r.error.kind !== 'sync-in-progress') {
      setError(messageOf(r.error));
    }
    setFollows(seasonFollows());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {error ? (
        <Text style={[type.secondary, { color: t.danger, padding: spacing.l }]}>
          {error}
        </Text>
      ) : null}
      {undoItem ? (
        <View
          style={[
            styles.undoRow,
            { backgroundColor: t.surfaceRaised, borderColor: t.border },
          ]}
          accessibilityLiveRegion="polite"
        >
          <Text style={[type.secondary, { color: t.textPrimary, flex: 1 }]}>
            {i18n.t('follows.feedback.unfollowed', { name: undoItem.label })}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={i18n.t('follows.following.a11yUndo', {
              name: undoItem.label,
            })}
            onPress={() => void onUndo(undoItem)}
            hitSlop={12}
          >
            <Text style={[type.body, { color: t.primary, fontWeight: '600' }]}>
              {i18n.t('follows.undo')}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {follows.length === 0 ? (
        // Every sport unfollowed from this page: the node this page
        // hangs off is gone from the strip too, so offer the way to
        // more sports rather than an empty list.
        <EmptyState
          headline={i18n.t('follows.following.emptyHeadline')}
          body={i18n.t('follows.following.emptyBody')}
          actionLabel={i18n.t('follows.following.browseSports')}
          onAction={() =>
            navigation.navigate('LeagueList', {
              sportKey: 'olympics',
              olympics: { season, view: 'sports' },
              title: i18n.t('follows.olympics.seasonSports', {
                season: i18n.t(season === 'summer' ? 'follows.olympics.summer' : 'follows.olympics.winter'),
              }),
            })
          }
        />
      ) : (
        <FlatList
          data={follows}
          keyExtractor={(f) => f.key}
          contentContainerStyle={{ paddingTop: spacing.s }}
          renderItem={({ item }) => {
            const glyph = olympicGlyphForKeys([item.key]) ?? olympics?.glyph ?? '🏅';
            const theme = teamTheme(item.brandColour ?? olympics?.accent ?? null, mode);
            return (
              <TileRow
                right={
                  <FollowButton
                    theme={theme}
                    following
                    subject={item.label}
                    busy={busyKey === item.key}
                    onPress={() => void onUnfollow(item)}
                  />
                }
              >
                <SportCard
                  fullWidth
                  label={item.label}
                  caption={captionFor(item, upcoming[item.key])}
                  // The sport's own emoji IS the mark (Round 7 item 5).
                  glyph={glyph}
                  theme={theme}
                  accessibilityLabel={i18n.t('follows.card.a11yViewFixtures', {
                    name: item.label,
                  })}
                  onPress={() =>
                    navigation.navigate('Team', {
                      teamKey: item.key,
                      name: item.label,
                      sportKey: item.sportKey,
                      followType: item.type,
                      ...(item.pollPath ? { pollPath: item.pollPath } : {}),
                      ...(item.brandColour ? { colours: item.brandColour } : {}),
                    })
                  }
                />
              </TileRow>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  undoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    marginHorizontal: spacing.l,
    marginTop: spacing.m,
    paddingHorizontal: spacing.l,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
