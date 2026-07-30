// Competition browse level: follow the whole competition, or drill into
// its teams. League is navigation, not a filter (docs/PRODUCT.md).

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
import {
  DirectoryLeague,
  fetchLeagues,
} from '../data/directoryRepo';
import { isFollowed } from '../data/followStore';
import { sportByKey } from '../domain/sportsConfig';

type Props = NativeStackScreenProps<RootStackParamList, 'LeagueList'>;

export default function LeagueListScreen({ navigation, route }: Props) {
  const t = useTheme();
  const sport = sportByKey(route.params.sportKey);
  const [leagues, setLeagues] = useState<DirectoryLeague[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [, forceRender] = useState(0);

  // Toast Undo (and any other sync) must refresh Follow buttons here too.
  useEffect(() => subscribeSync(() => forceRender((n) => n + 1)), []);

  useEffect(() => {
    // Series sports (F1, boxing) render their one followable as a normal
    // competition row — following is ALWAYS a visible button on a row,
    // never a hidden tap side-effect on the sport itself.
    if (sport?.seriesFollowable && !sport.staticCompetitions) {
      const series = sport.seriesFollowable;
      setLeagues([
        {
          id: sport.key,
          name: series.label,
          country: 'All events',
          key: series.key,
          followOnly: true,
          ...(series.pollPath ? { pollPath: series.pollPath } : {}),
        },
      ]);
      return;
    }
    if (sport?.staticCompetitions) {
      // Single-league sports: the competition level is config, not data.
      setLeagues(sport.staticCompetitions);
      return;
    }
    void (async () => {
      const r = await fetchLeagues();
      if (r.ok) setLeagues(r.value);
      else setError(messageOf(r.error));
    })();
  }, [sport]);

  const toggle = useCallback(async (league: DirectoryLeague) => {
    const isSeries = league.key === sport?.seriesFollowable?.key;
    const item = {
      key: league.key,
      label: league.name,
      sportKey: route.params.sportKey,
      type: isSeries ? ('series' as const) : ('competition' as const),
      ...(league.pollPath ? { pollPath: league.pollPath } : {}),
    };
    setBusyKey(league.key);
    const wasFollow = !isFollowed(league.key);
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
  }, [route.params.sportKey, navigation, sport]);

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
            accessibilityLabel={
              item.followOnly ? item.name : `${item.name}, browse teams`
            }
            onPress={
              item.followOnly
                ? undefined
                : () =>
                    navigation.navigate('TeamList', {
                      sportKey: route.params.sportKey,
                      leagueId: item.id,
                      leagueName: item.name,
                      teamPollPath: item.teamPollPath,
                    })
            }
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.s }}>
                <FollowButton
                  following={isFollowed(item.key)}
                  subject={item.name}
                  busy={busyKey === item.key}
                  onPress={() => void toggle(item)}
                />
                {!item.followOnly ? (
                  <Text style={[type.body, { color: t.textSecondary }]} accessible={false}>
                    ›
                  </Text>
                ) : null}
              </View>
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
