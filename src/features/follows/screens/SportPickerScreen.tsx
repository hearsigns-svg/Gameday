// Sport picker: the 11 launch sports; disabled ones say why. Series
// sports (F1) are followed directly from their row — no drill-down.

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { FollowButton, ListRow } from '../../../core/components';
import { RootStackParamList } from '../../../core/navigation';
import { messageOf } from '../../../core/result';
import { spacing, type, useTheme } from '../../../core/tokens';
import { follow, unfollow } from '../followActions';
import { isFollowed } from '../data/followStore';
import { SportConfig, SPORTS } from '../domain/sportsConfig';

type Props = NativeStackScreenProps<RootStackParamList, 'SportPicker'>;

export default function SportPickerScreen({ navigation }: Props) {
  const t = useTheme();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, forceRender] = useState(0);

  const toggleSeries = useCallback(async (sport: SportConfig) => {
    const series = sport.seriesFollowable;
    if (!series) return;
    const item = {
      key: series.key,
      label: series.label,
      sportKey: sport.key,
      type: 'series' as const,
      ...(series.pollPath ? { pollPath: series.pollPath } : {}),
    };
    setBusyKey(series.key);
    const r = isFollowed(series.key) ? await unfollow(item) : await follow(item);
    if (!r.ok && r.error.kind !== 'sync-in-progress') {
      setError(messageOf(r.error));
    } else {
      setError(null);
    }
    setBusyKey(null);
    forceRender((n) => n + 1);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {error ? (
        <Text style={[type.secondary, { color: t.danger, padding: spacing.l }]}>
          {error}
        </Text>
      ) : null}
      <FlatList
        data={SPORTS}
        keyExtractor={(s) => s.key}
        renderItem={({ item }) => {
          const series = item.enabled ? item.seriesFollowable : undefined;
          return (
            <ListRow
              title={item.label}
              caption={item.enabled ? undefined : 'Coming soon'}
              glyph={item.glyph}
              disabled={!item.enabled}
              accessibilityLabel={
                item.enabled ? item.label : `${item.label}, coming soon`
              }
              onPress={
                item.enabled && !series
                  ? () =>
                      navigation.navigate('LeagueList', { sportKey: item.key })
                  : undefined
              }
              right={
                series ? (
                  <FollowButton
                    following={isFollowed(series.key)}
                    subject={series.label}
                    busy={busyKey === series.key}
                    onPress={() => void toggleSeries(item)}
                  />
                ) : item.enabled ? (
                  <Text style={[type.body, { color: t.textSecondary }]}>›</Text>
                ) : undefined
              }
            />
          );
        }}
      />
    </View>
  );
}
