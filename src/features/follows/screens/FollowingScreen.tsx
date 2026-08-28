// Following: manage what Gameday tracks. Follow/unfollow is the primary
// gesture HERE (it's the manage surface); Home stays free of it.

import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { monogramOf,
  EmptyState,
  FollowButton,
  SportCard,
  TileRow,
} from '../../../core/components';
import { TabScreenProps } from '../../../core/navigation';
import { competitionMarkFor } from '../data/browsePriority';
import { useColorSchemeMode } from '../../../core/useColorSchemeMode';
import { messageOf } from '../../../core/result';
import { teamTheme } from '../../../core/teamTheme';
import { flagEmojiOf } from '../../../core/nationality';
import { spacing, type, useTheme } from '../../../core/tokens';
import { subscribeSync, upcomingByFollow } from '../../calendar-sync/syncEngine';
import { refollow, unfollow } from '../followActions';
import { Followable, loadFollowables } from '../data/followStore';
import { sportByKey } from '../domain/sportsConfig';
import { sportLabelFor } from '../domain/sportTerms';
import { activeRegion } from '../../../core/regionStore';

const UNDO_WINDOW_MS = 6000;

type Props = TabScreenProps<'Following'>;

// Between seasons a followed team genuinely has nothing ahead — say so
// rather than showing a bare row that reads as broken.
function captionFor(item: Followable, upcomingCount: number | undefined): string {
  const cfg = sportByKey(item.sportKey);
  const sport = cfg
    ? sportLabelFor(cfg.key, cfg.label, activeRegion())
    : item.sportKey;
  if (upcomingCount === undefined) return sport;
  if (upcomingCount === 0) return `${sport} · no upcoming fixtures yet`;
  return `${sport} · ${upcomingCount} upcoming`;
}

export default function FollowingScreen({ navigation }: Props) {
  const t = useTheme();
  const mode = useColorSchemeMode();
  const [follows, setFollows] = useState<Followable[]>(loadFollowables);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [undoItem, setUndoItem] = useState<Followable | null>(null);
  const [upcoming, setUpcoming] = useState<Record<string, number>>(
    upcomingByFollow,
  );

  useEffect(() => {
    if (!undoItem) return;
    const timer = setTimeout(() => setUndoItem(null), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [undoItem]);

  useEffect(() => {
    const unsub = subscribeSync(() => {
      setFollows(loadFollowables());
      setUpcoming(upcomingByFollow());
    });
    const focus = navigation.addListener('focus', () =>
      setFollows(loadFollowables()),
    );
    return () => {
      unsub();
      focus();
    };
  }, [navigation]);

  const onUnfollow = useCallback(async (item: Followable) => {
    setBusyKey(item.key);
    setError(null);
    setUndoItem(item); // no confirmation — undo instead (friction rule)
    setFollows(loadFollowables().filter((f) => f.key !== item.key));
    const r = await unfollow(item);
    if (!r.ok && r.error.kind !== 'sync-in-progress') {
      setError(messageOf(r.error));
    }
    setFollows(loadFollowables());
    setBusyKey(null);
  }, []);

  const onUndo = useCallback(async (item: Followable) => {
    setUndoItem(null);
    setError(null);
    const r = await refollow(item);
    if (!r.ok && r.error.kind !== 'sync-in-progress') {
      setError(messageOf(r.error));
    }
    setFollows(loadFollowables());
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
            Unfollowed {undoItem.label}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Undo unfollowing ${undoItem.label}`}
            onPress={() => void onUndo(undoItem)}
            hitSlop={12}
          >
            <Text style={[type.body, { color: t.primary, fontWeight: '600' }]}>
              Undo
            </Text>
          </Pressable>
        </View>
      ) : null}
      {follows.length === 0 ? (
        <EmptyState
          headline="Not following anything yet"
          body="Pick a sport on Home, or browse everything here."
          actionLabel="Browse sports"
          onAction={() => navigation.navigate('SportPicker')}
        />
      ) : (
        <FlatList
          data={follows}
          keyExtractor={(f) => f.key}
          renderItem={({ item }) => {
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
                  glyph={sport?.glyph ?? '·'}
                  theme={teamTheme(
                    item.brandColour ?? sport?.accent ?? null,
                    mode,
                  )}
                  monogram={monogramOf(item.label)}
                  {...((item.crestUrl ?? competitionMarkFor(item.key))
                    ? { imageUrl: (item.crestUrl ?? competitionMarkFor(item.key)) as string }
                    : {})}
                  {...(flagEmojiOf(item.countryCode)
                    ? { tileBadge: flagEmojiOf(item.countryCode) as string }
                    : {})}
                  accessibilityLabel={`${item.label}, followed ${item.type}. See their fixtures`}
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
              accessibilityLabel="Add more sports"
              onPress={() => navigation.navigate('SportPicker')}
              style={[styles.addMore, { borderColor: t.border }]}
            >
              <Text style={[type.body, { color: t.primary, fontWeight: '600' }]}>
                + Add more
              </Text>
            </Pressable>
          }
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
  addMore: {
    margin: spacing.l,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
