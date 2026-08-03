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
  fetchTournaments,
  TournamentRow,
} from '../data/directoryRepo';
import { byPriorityLive, cachedPriorities, refreshPriorities } from '../data/browsePriority';
import { isFollowed } from '../data/followStore';
import { sportByKey } from '../domain/sportsConfig';

type Props = NativeStackScreenProps<RootStackParamList, 'LeagueList'>;

export default function LeagueListScreen({ navigation, route }: Props) {
  const t = useTheme();
  const sport = sportByKey(route.params.sportKey);
  const [leagues, setLeagues] = useState<DirectoryLeague[] | null>(null);
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
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
      // Single-league sports: the rows are config; their ORDER is
      // catalogue-weight data (Prompt 11), live rows before dormant
      // ones (11b), config order as the offline fallback.
      void refreshPriorities();
      const pr = cachedPriorities();
      setLeagues(
        byPriorityLive(
          sport.staticCompetitions,
          (c) => c.key,
          pr.priorities,
          new Set(pr.dormant),
        ),
      );
      return;
    }
    void (async () => {
      const r = await fetchLeagues();
      if (r.ok) setLeagues(r.value);
      else setError(messageOf(r.error));
    })();
  }, [sport]);

  // Tournament rows (Prompt 9): the competitions people actually want —
  // Wimbledon, not "ATP Tour". Joint ATP+WTA events arrive merged under
  // one key; a fetch failure keeps the tour rows working and says so.
  useEffect(() => {
    if (!sport?.tournamentBrowse) return;
    void (async () => {
      const r = await fetchTournaments();
      if (r.ok) setTournaments(r.value);
      else setError(messageOf(r.error));
    })();
  }, [sport]);

  const tournamentCaption = (row: TournamentRow): string => {
    // UTC, like every all-day surface (the day sentinels are UTC
    // midnights — device-zone formatting shifted an endpoint a day in
    // every zone), and the EXCLUSIVE end renders as its INCLUSIVE
    // final day (review round).
    const fmt = (ms: number) =>
      new Date(ms).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      });
    const tours =
      row.tours === 'joint' ? 'ATP · WTA' : row.tours.toUpperCase();
    return `${fmt(Date.parse(row.startUtc))} – ${fmt(Date.parse(row.endUtc) - 86_400_000)} · ${tours}`;
  };

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
        // Athlete browse rides ABOVE the competition rows for sports
        // that have a directory (Prompt 8): people are what a fan of an
        // individual sport arrives looking for, and the entry point must
        // not hide behind global search.
        ListHeaderComponent={
          sport?.browse.includes('athlete') ? (
            <ListRow
              title="Athletes"
              caption="Champions, rankings and who's competing soon"
              accessibilityLabel="Browse athletes"
              onPress={() =>
                navigation.navigate('AthleteList', {
                  sportKey: route.params.sportKey,
                })
              }
              right={
                <Text style={[type.body, { color: t.textSecondary }]} accessible={false}>
                  ›
                </Text>
              }
            />
          ) : null
        }
        // Tournaments below the tour rows: one row per canonical
        // tournament — priority first (the server ranks slams above
        // 250s from catalogue data), soonest-start within a weight —
        // followed by KEY: a joint event is one row, and following it
        // needs no pollPath (both tour slices stay catalogue-warm).
        ListFooterComponent={
          tournaments.length > 0 ? (
            <View>
              <Text
                style={[
                  type.caption,
                  {
                    color: t.textSecondary,
                    paddingHorizontal: spacing.l,
                    paddingTop: spacing.l,
                    paddingBottom: spacing.s,
                    fontWeight: '600',
                  },
                ]}
              >
                TOURNAMENTS
              </Text>
              {tournaments.map((row) => (
                <ListRow
                  key={row.key}
                  title={row.name}
                  caption={tournamentCaption(row)}
                  accessibilityLabel={row.name}
                  right={
                    <FollowButton
                      following={isFollowed(row.key)}
                      subject={row.name}
                      busy={busyKey === row.key}
                      onPress={() =>
                        void toggle({
                          id: row.key,
                          name: row.name,
                          country: '',
                          key: row.key,
                          followOnly: true,
                        })
                      }
                    />
                  }
                />
              ))}
            </View>
          ) : null
        }
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
