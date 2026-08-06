// One tour's tournaments — the majors, or everything else.
//
// These used to be inline rows under the tour heading, which put 95 of
// them between the top of tennis browse and anything below. They live
// behind their own entry now, so the browse screen stays two short
// sections and the list is a list.
//
// EVERY ROW OPENS ITS COMPETITION (Prompt 19 Part B). A tournament is a
// followable thing with fixtures of its own, and the detail screen needs
// no follow record to render them — it queries by key.

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { FollowButton, ListRow } from '../../../core/components';
import { RootStackParamList } from '../../../core/navigation';
import { messageOf } from '../../../core/result';
import { spacing, type, useTheme } from '../../../core/tokens';
import { subscribeSync } from '../../calendar-sync/syncEngine';
import { follow, unfollow } from '../followActions';
import { followFeedback } from '../followFeedback';
import { fetchTournaments, TournamentRow } from '../data/directoryRepo';
import { isFollowed } from '../data/followStore';
import { tournamentsFor } from '../domain/tennisBrowse';

type Props = NativeStackScreenProps<RootStackParamList, 'TournamentList'>;

export default function TournamentListScreen({ navigation, route }: Props) {
  const t = useTheme();
  const { tour, kind } = route.params;
  const [rows, setRows] = useState<TournamentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [, forceRender] = useState(0);

  useEffect(() => subscribeSync(() => forceRender((n) => n + 1)), []);

  useEffect(() => {
    void (async () => {
      const r = await fetchTournaments();
      if (r.ok) setRows(tournamentsFor(r.value, tour, kind) as TournamentRow[]);
      // An empty list and a failed read are different things, and the
      // difference has to reach the screen.
      else setError(messageOf(r.error));
    })();
  }, [tour, kind]);

  const toggle = useCallback(
    async (row: TournamentRow) => {
      setBusyKey(row.key);
      const item = {
        key: row.key,
        label: row.name,
        sportKey: 'tennis',
        type: 'competition' as const,
      };
      const wasFollow = !isFollowed(row.key);
      const r = wasFollow ? await follow(item) : await unfollow(item);
      setBusyKey(null);
      if (!r.ok) setError(messageOf(r.error));
      else {
        setError(null);
        followFeedback(r, item, wasFollow, () =>
          navigation.navigate('CalendarPriming'),
        );
      }
      forceRender((n) => n + 1);
    },
    [navigation],
  );

  const caption = (row: TournamentRow): string => {
    const fmt = (ms: number) =>
      new Date(ms).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      });
    return `${fmt(Date.parse(row.startUtc))} – ${fmt(Date.parse(row.endUtc) - 86_400_000)}`;
  };

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Text style={[type.secondary, { color: t.danger, padding: spacing.l }]}>
          {error}
        </Text>
      </View>
    );
  }
  if (!rows) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={t.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={({ item }) => (
          <ListRow
            title={item.name}
            caption={caption(item)}
            accessibilityLabel={`${item.name}, see upcoming`}
            onPress={() =>
              navigation.navigate('Team', {
                teamKey: item.key,
                name: item.name,
                sportKey: 'tennis',
                followType: 'competition',
              })
            }
            right={
              <FollowButton
                following={isFollowed(item.key)}
                subject={item.name}
                busy={busyKey === item.key}
                onPress={() => void toggle(item)}
              />
            }
          />
        )}
      />
    </View>
  );
}
