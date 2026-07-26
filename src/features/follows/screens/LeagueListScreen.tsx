// Competition browse level: follow the whole competition, or drill into
// its teams. League is navigation, not a filter (docs/PRODUCT.md).

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { FollowButton, ListRow } from '../../../core/components';
import { RootStackParamList } from '../../../core/navigation';
import { messageOf } from '../../../core/result';
import { spacing, type, useTheme } from '../../../core/tokens';
import { follow, unfollow } from '../followActions';
import {
  DirectoryLeague,
  fetchLeagues,
} from '../data/directoryRepo';
import { isFollowed } from '../data/followStore';

type Props = NativeStackScreenProps<RootStackParamList, 'LeagueList'>;

export default function LeagueListScreen({ navigation, route }: Props) {
  const t = useTheme();
  const [leagues, setLeagues] = useState<DirectoryLeague[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [, forceRender] = useState(0);

  useEffect(() => {
    void (async () => {
      const r = await fetchLeagues();
      if (r.ok) setLeagues(r.value);
      else setError(messageOf(r.error));
    })();
  }, []);

  const toggle = useCallback(async (league: DirectoryLeague) => {
    const item = {
      key: league.key,
      label: league.name,
      sportKey: route.params.sportKey,
      type: 'competition' as const,
    };
    setBusyKey(league.key);
    const r = isFollowed(league.key)
      ? await unfollow(item)
      : await follow(item);
    if (!r.ok && r.error.kind !== 'sync-in-progress') {
      setError(messageOf(r.error));
    } else {
      setError(null);
    }
    setBusyKey(null);
    forceRender((n) => n + 1);
  }, [route.params.sportKey]);

  if (error && !leagues) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <Text style={[type.body, { color: t.danger }]}>{error}</Text>
      </View>
    );
  }
  if (!leagues) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={t.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {error ? (
        <Text style={[type.secondary, { color: t.danger, padding: spacing.l }]}>
          {error}
        </Text>
      ) : null}
      <FlatList
        data={leagues}
        keyExtractor={(l) => l.key}
        renderItem={({ item }) => (
          <ListRow
            title={item.name}
            caption={item.country}
            accessibilityLabel={`${item.name}, browse teams`}
            onPress={() =>
              navigation.navigate('TeamList', {
                leagueId: item.id,
                leagueName: item.name,
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

const styles = {
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
};
