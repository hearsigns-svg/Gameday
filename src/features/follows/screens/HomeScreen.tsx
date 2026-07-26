// Home: what you follow, live sync status, one primary action.

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  EmptyState,
  FollowButton,
  ListRow,
  StatusPill,
} from '../../../core/components';
import { RootStackParamList } from '../../../core/navigation';
import { messageOf } from '../../../core/result';
import { spacing, type, useTheme } from '../../../core/tokens';
import {
  lastSync,
  subscribeSync,
  SyncOutcome,
  upcomingByFollow,
} from '../../calendar-sync/syncEngine';
import { refollow, unfollow } from '../followActions';
import { Followable, loadFollowables } from '../data/followStore';
import { sportByKey } from '../domain/sportsConfig';

const UNDO_WINDOW_MS = 6000;

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

// Between seasons a followed team genuinely has nothing ahead — say so
// rather than showing a bare row that reads as broken.
function captionFor(item: Followable, upcomingCount: number | undefined): string {
  const sport = sportByKey(item.sportKey)?.label ?? item.sportKey;
  if (upcomingCount === undefined) return `${sport} · ${item.type}`;
  if (upcomingCount === 0) {
    return `${sport} · no upcoming fixtures yet`;
  }
  return `${sport} · ${upcomingCount} upcoming`;
}

function summarise(outcome: SyncOutcome | null): string | null {
  if (!outcome) return null;
  return `Up to date · ${outcome.created} added · ${outcome.updated} updated · ${outcome.deleted} removed`;
}

export default function HomeScreen({ navigation }: Props) {
  const t = useTheme();
  const [follows, setFollows] = useState<Followable[]>(loadFollowables);
  const [syncRunning, setSyncRunning] = useState(false);
  const [summary, setSummary] = useState<string | null>(() =>
    summarise(lastSync()),
  );
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
    const unsub = subscribeSync((state) => {
      setSyncRunning(state.running);
      setSummary(summarise(state.last));
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
      <View style={styles.header}>
        <StatusPill running={syncRunning} summary={summary} />
        {error ? (
          <Text style={[type.secondary, { color: t.danger }]}>{error}</Text>
        ) : null}
        {undoItem ? (
          <View
            style={[styles.undoRow, { backgroundColor: t.surfaceRaised, borderColor: t.border }]}
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
      </View>
      {follows.length === 0 ? (
        <EmptyState
          headline="Never miss a game"
          body="Follow teams and competitions, and their fixtures appear in your calendar — kept up to date automatically."
          actionLabel="Choose sports"
          onAction={() => navigation.navigate('SportPicker')}
        />
      ) : (
        <FlatList
          data={follows}
          keyExtractor={(f) => f.key}
          renderItem={({ item }) => (
            <ListRow
              title={item.label}
              caption={captionFor(item, upcoming[item.key])}
              glyph={sportByKey(item.sportKey)?.glyph}
              accessibilityLabel={`${item.label}, followed ${item.type}`}
              right={
                <FollowButton
                  following
                  subject={item.label}
                  busy={busyKey === item.key}
                  onPress={() => void onUnfollow(item)}
                />
              }
            />
          )}
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
  header: { padding: spacing.l, gap: spacing.s },
  undoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
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
