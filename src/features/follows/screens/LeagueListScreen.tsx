// Competition browse level: follow the whole competition, or drill into
// its teams. League is navigation, not a filter (docs/PRODUCT.md).

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
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
      {/* The coverage note: what this sport's data honestly is, said up
          front. A user should read that athlete-level athletics is
          absent, not discover it. */}
      {sport?.coverageNote ? (
        <Text
          style={[
            type.caption,
            {
              color: t.textSecondary,
              paddingHorizontal: spacing.l,
              paddingBottom: spacing.s,
            },
          ]}
        >
          {sport.coverageNote}
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
                {/* A competition with no league-level poller offers no
                    "Follow all": NHL and MLB are served team-by-team, and
                    the button used to build a route that 400s or returns
                    an empty 200. Browsing their teams still works. */}
                {item.followable !== false ? (
                  <FollowButton
                    following={isFollowed(item.key)}
                    subject={item.name}
                    busy={busyKey === item.key}
                    label="Follow all"
                    onPress={() => void toggle(item)}
                  />
                ) : null}
                {!item.followOnly ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Browse ${item.name} teams`}
                    onPress={() =>
                      navigation.navigate('TeamList', {
                        sportKey: route.params.sportKey,
                        leagueId: item.id,
                        leagueName: item.name,
                        teamPollPath: item.teamPollPath,
                      })
                    }
                    style={({ pressed }) => [
                      styles.teamsButton,
                      { borderColor: t.border },
                      pressed && { backgroundColor: t.surface },
                    ]}
                  >
                    <Text style={[type.secondary, { color: t.textPrimary, fontWeight: '600' }]}>
                      Teams ›
                    </Text>
                  </Pressable>
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
  teamsButton: {
    minHeight: 44,
    paddingHorizontal: spacing.m,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
};
