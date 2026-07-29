// Sport picker: the 11 launch sports; disabled ones say why. Series
// sports (F1) are followed directly from their row — no drill-down.

import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { FollowButton, ListRow } from '../../../core/components';
import { RootStackParamList } from '../../../core/navigation';
import { useColorSchemeMode } from '../../../core/useColorSchemeMode';
import { messageOf } from '../../../core/result';
import { teamTheme } from '../../../core/teamTheme';
import { spacing, type, useTheme } from '../../../core/tokens';
import { subscribeSync } from '../../calendar-sync/syncEngine';
import { follow, unfollow } from '../followActions';
import { followFeedback } from '../followFeedback';
import { isFollowed } from '../data/followStore';
import { SportConfig, SPORTS } from '../domain/sportsConfig';

type Props = NativeStackScreenProps<RootStackParamList, 'SportPicker'>;

export default function SportPickerScreen({ navigation }: Props) {
  const t = useTheme();
  const mode = useColorSchemeMode();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, forceRender] = useState(0);

  // Toast Undo (and any other sync) must refresh Follow buttons here too.
  useEffect(() => subscribeSync(() => forceRender((n) => n + 1)), []);

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
    const wasFollow = !isFollowed(series.key);
    const r = wasFollow ? await follow(item) : await unfollow(item);
    if (!r.ok && r.error.kind !== 'sync-in-progress') {
      setError(messageOf(r.error));
    } else {
      setError(null);
      followFeedback(r, item, wasFollow, () =>
        navigation.navigate('CalendarPriming'),
      );
    }
    setBusyKey(null);
    forceRender((n) => n + 1);
  }, [navigation]);

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
              tileTheme={teamTheme(item.accent, mode)}
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
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={t.textSecondary}
                  />
                ) : undefined
              }
            />
          );
        }}
      />
    </View>
  );
}
