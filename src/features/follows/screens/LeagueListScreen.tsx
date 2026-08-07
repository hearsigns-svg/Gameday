// Competition browse level: follow the whole competition, or drill into
// its teams. League is navigation, not a filter (docs/PRODUCT.md).

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { FollowButton, ListRow, monogramOf , CoverageNote } from '../../../core/components';
import { BrowseRow, SLAM_KEYS, tennisBrowseRows } from '../domain/tennisBrowse';
import { RootStackParamList } from '../../../core/navigation';
import { messageOf } from '../../../core/result';
import { teamTheme } from '../../../core/teamTheme';
import { useColorSchemeMode } from '../../../core/useColorSchemeMode';
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
import { hydrateFollowArt, isFollowed } from '../data/followStore';
import { sportByKey } from '../domain/sportsConfig';

type Props = NativeStackScreenProps<RootStackParamList, 'LeagueList'>;

// What the people in this sport are CALLED. "Athletes" is right for
// athletics and wrong everywhere else — a boxing fan is looking for
// fighters, a tennis fan for players.
function athleteRowTitle(sportKey: string): string {
  switch (sportKey) {
    case 'boxing':
    case 'ufc':
      return 'Fighters';
    case 'tennis':
      return 'Players';
    case 'f1':
    case 'motorsport':
      return 'Drivers';
    default:
      return 'Athletes';
  }
}

export default function LeagueListScreen({ navigation, route }: Props) {
  const t = useTheme();
  const mode = useColorSchemeMode();
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
      const rows = byPriorityLive(
        sport.staticCompetitions,
        (c) => c.key,
        pr.priorities,
        new Set(pr.dormant),
      ).map((c) => {
          // Competition logo by TSDB league id (Prompt 13 follow-up).
          // These rows are CONFIG, never served by listLeagues, which
          // is why they alone still rendered a monogram while their
          // soccer neighbours had logos. The id IS the TSDB id, so the
          // join needs no name matching.
        const art = pr.competitionArt[String(c.id)];
        return art ? { ...c, crestUrl: art } : c;
      });
      setLeagues(rows);
      // These rows are CONFIG rather than a served list, so they were
      // the one browse surface hydration never reached — which meant an
      // imagery takedown could not reach a stored boxing/NBA/NFL
      // competition follow at all.
      hydrateFollowArt(rows);
      return;
    }
    void (async () => {
      const r = await fetchLeagues();
      if (r.ok) {
        setLeagues(r.value);
        // Fresh directory rows are also the only chance to repair a
        // stored follow's artwork: the follow store captures a crest
        // once and never revisits it (domain/followArt.ts).
        hydrateFollowArt(r.value);
      } else setError(messageOf(r.error));
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
    const dates = `${fmt(Date.parse(row.startUtc))} – ${fmt(Date.parse(row.endUtc) - 86_400_000)}`;
    // No tour claim when the server made none: the dates alone are the
    // honest caption, and an omitted fact reads as nothing at all.
    if (!row.tours || row.tours.length === 0) return dates;
    return `${dates} · ${row.tours.map((t) => t.toUpperCase()).join(' · ')}`;
  };

  // EVERY HOOK IN THIS COMPONENT LIVES ABOVE THE LOADING EARLY-RETURN.
  // `if (!leagues) return <spinner/>` sits between here and the render
  // body, so a hook declared after it runs on the SECOND render and not
  // the first — "Rendered more hooks than during the previous render",
  // which crashes the screen outright in Release.
  const followAll = useCallback(
    async (keys: string[], title: string) => {
      setBusyKey(title);
      for (const key of keys) {
        const row = tournaments.find((x) => x.key === key);
        if (!row || isFollowed(key)) continue;
        await follow({
          key,
          label: row.name,
          sportKey: route.params.sportKey,
          type: 'competition',
        });
      }
      setBusyKey(null);
      forceRender((n) => n + 1);
    },
    [tournaments, route.params.sportKey],
  );

  // EVERY ENTITY IN BROWSE OPENS ITS OWN PAGE (Prompt 19). It used to
  // be that the only way to see a competition's fixtures was to follow
  // it and find it in Following — commit, then look. The detail screen
  // never needed the follow: it queries by KEY and falls back to the
  // bare key when no follow record exists (TeamScreen::loadFixtures),
  // which is why an athlete page already worked unfollowed.
  const openEntity = useCallback(
    (key: string, name: string, crestUrl?: string, pollPath?: string) =>
      navigation.navigate('Team', {
        teamKey: key,
        name,
        sportKey: route.params.sportKey,
        followType: 'competition' as const,
        ...(pollPath ? { pollPath } : {}),
        ...(crestUrl ? { crestUrl } : {}),
        ...(sport?.accent ? { colours: sport.accent } : {}),
      }),
    [navigation, route.params.sportKey, sport?.accent],
  );

  const toggle = useCallback(async (league: DirectoryLeague) => {
    const isSeries = league.key === sport?.seriesFollowable?.key;
    const item = {
      key: league.key,
      label: league.name,
      sportKey: route.params.sportKey,
      type: isSeries ? ('series' as const) : ('competition' as const),
      ...(league.pollPath ? { pollPath: league.pollPath } : {}),
      // The row one line below already renders this logo; not putting it
      // on the follow is why a followed competition lost it everywhere
      // else (Prompt 16 C).
      ...(league.crestUrl ? { crestUrl: league.crestUrl } : {}),
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

  // TENNIS IS THREE THINGS (Prompt 19): ATP, WTA, and the majors, which
  // belong to neither tour. It used to be one Players row and one
  // undifferentiated block of every tournament, with a single coverage
  // note trying to describe two tours that no longer match.
  // The four majors' keys, for the row-level Follow all. Derived from the
  // served tournaments so a slam we do not hold is never claimed.
  const slamKeys = tournaments
    .filter((x) => SLAM_KEYS.includes(x.key))
    .map((x) => x.key);

  const tennisRows: BrowseRow[] | null =
    route.params.sportKey === 'tennis' && leagues
      ? tennisBrowseRows(leagues, tournaments)
      : null;

  const renderBrowseRow = (r: BrowseRow) => {
    switch (r.kind) {
      case 'header':
        return (
          <View style={{ paddingTop: spacing.l }}>
            <Text
              style={[
                type.caption,
                {
                  color: t.textSecondary,
                  paddingHorizontal: spacing.l,
                  paddingBottom: spacing.s,
                  fontWeight: '600',
                },
              ]}
            >
              {r.title.toUpperCase()}
            </Text>
            <CoverageNote note={r.note} />
          </View>
        );
      case 'players':
        return (
          <ListRow
            title={r.title}
            caption="Rankings, champions, who's competing"
            glyph={sport?.glyph ?? '🎾'}
            tileTheme={teamTheme(sport?.accent ?? null, mode)}
            accessibilityLabel={`Browse ${r.tour.toUpperCase()} players`}
            onPress={() =>
              navigation.navigate('AthleteList', {
                sportKey: route.params.sportKey,
                tour: r.tour,
              })
            }

          />
        );
      case 'competition':
        return (
          <ListRow
            title={r.name}
            caption="Every event on the tour"
            glyph="📅"
            tileTheme={teamTheme(sport?.accent ?? null, mode)}
            monogram={monogramOf(r.name)}
            accessibilityLabel={`${r.name}, see upcoming`}
            onPress={() => openEntity(r.key, r.name)}
            right={
              <FollowButton
                following={isFollowed(r.key)}
                subject={r.name}
                busy={busyKey === r.key}
                label="Follow all"
                onPress={() =>
                  void toggle({ id: r.key, name: r.name, country: '', key: r.key, followOnly: true })
                }
              />
            }
          />
        );
      case 'slams':
      case 'others': {
        const isSlams = r.kind === 'slams';
        const title = isSlams ? 'All four majors' : 'Other tournaments';
        // ICON SWEEP (Prompt 20): inside a tennis section, Players, the
        // tour row and Other tournaments ALL fell back to the sport
        // glyph, so three different things carried one tennis ball and
        // the tile stopped distinguishing anything. A trophy for the
        // majors, a medal for the rest, the ball reserved for Players —
        // whose row is about people, which is the one thing the sport's
        // own mark reads as here.
        return (
          <ListRow
            title={title}
            caption={`${r.count} ${r.count === 1 ? 'tournament' : 'tournaments'}`}
            glyph={isSlams ? '🏆' : '🏅'}
            tileTheme={teamTheme(sport?.accent ?? null, mode)}
            accessibilityLabel={`${title}, ${r.tour.toUpperCase()}`}
            onPress={() =>
              navigation.navigate('TournamentList', {
                tour: r.tour,
                kind: isSlams ? 'slams' : 'others',
                title,
              })
            }
            right={
              isSlams ? (
                <FollowButton
                  following={slamKeys.every((k) => isFollowed(k))}
                  subject="all four majors"
                  busy={busyKey === 'slams'}
                  label="Follow all"
                  onPress={() => void followAll(slamKeys, 'slams')}
                />
              ) : undefined
            }
          />
        );
      }
    }
  };

  if (tennisRows) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {error ? (
          <Text style={[type.secondary, { color: t.danger, padding: spacing.l }]}>
            {error}
          </Text>
        ) : null}
        <FlatList
          data={tennisRows}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => renderBrowseRow(item)}
        />
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
      {/* What this sport's data honestly is — one line, opened on
          demand. It used to be nine lines of prose above the rows. */}
      {sport?.coverageNote ? <CoverageNote note={sport.coverageNote} /> : null}
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
              title={athleteRowTitle(route.params.sportKey)}
              caption="Rankings, champions, who's competing"
              // A TILE, and no chevron (Prompt 21). The chevron was
              // added here because a bare row beside a filled Follow
              // button looked unimportant — but it appeared on some
              // rows and not others while EVERY row opens, so it said
              // nothing and misled where it was absent. The row's own
              // press state carries the affordance now.
              glyph={sport?.glyph ?? '🏟️'}
              tileTheme={teamTheme(sport?.accent ?? null, mode)}
              accessibilityLabel={`Browse ${athleteRowTitle(route.params.sportKey).toLowerCase()}`}
              onPress={() =>
                navigation.navigate('AthleteList', {
                  sportKey: route.params.sportKey,
                })
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
                  accessibilityLabel={`${row.name}, see upcoming`}
                  onPress={() => openEntity(row.key, row.name)}
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
            // Competition rows carried NO tile before Prompt 13 — with
            // no crest to show there was nothing to put in one. Now
            // there is, so the row gets the same tile every other
            // entity row has: logo where the provider has one, the
            // generated monogram treatment where it does not.
            glyph={sport?.glyph ?? '🏟️'}
            tileTheme={teamTheme(sport?.accent ?? null, mode)}
            monogram={monogramOf(item.name)}
            {...(item.crestUrl ? { imageUrl: item.crestUrl } : {})}
            accessibilityLabel={`${item.name}, see upcoming`}
            // The row is the COMPETITION now, not a shortcut to its
            // teams — "Premier League" should show Premier League
            // fixtures, and its Teams button (right) still browses the
            // clubs. A followOnly row (ATP Tour, a series) was a dead
            // end before this.
            onPress={() => openEntity(item.key, item.name, item.crestUrl, item.pollPath)}
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
                      Teams
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
