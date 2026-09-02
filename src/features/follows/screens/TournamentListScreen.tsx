// One tour's tournaments — the majors, or everything else.
//
// These used to be inline rows under the tour heading, which put 95 of
// them between the top of tennis browse and anything below. They live
// behind their own entry now, so the browse screen stays two short
// sections and the list is a list.
//
// EVERY TOURNAMENT IS ONE CARD (Stage 6), the same original-language
// card the Competitions screen renders: tile plus Follow. A tournament
// has no sub-levels, so tapping it opens its matches directly.

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { monogramOf } from '../../../core/components';
import { RootStackParamList } from '../../../core/navigation';
import { messageOf } from '../../../core/result';
import { teamTheme } from '../../../core/teamTheme';
import { useColorSchemeMode } from '../../../core/useColorSchemeMode';
import { spacing, type, useTheme } from '../../../core/tokens';
import { subscribeSync } from '../../calendar-sync/syncEngine';
import { CompetitionCard } from '../CompetitionCard';
import { follow, unfollow } from '../followActions';
import { followFeedback } from '../followFeedback';
import { cachedTournaments, fetchTournaments, TournamentRow } from '../data/directoryRepo';
import { cachedPriorities, subscribePriorities } from '../data/browsePriority';
import { isFollowed } from '../data/followStore';
import { tournamentDateRange, tournamentsFor } from '../domain/tennisBrowse';
import { sportByKey } from '../domain/sportsConfig';

type Props = NativeStackScreenProps<RootStackParamList, 'TournamentList'>;

export default function TournamentListScreen({ navigation, route }: Props) {
  const t = useTheme();
  const mode = useColorSchemeMode();
  // This screen is reached only from the tennis browse sections, so the
  // sport is fixed — but it comes from config rather than a literal, so
  // a change to tennis's mark or accent reaches here too.
  const tennis = sportByKey('tennis');
  const { tour, kind } = route.params;
  const [rows, setRows] = useState<TournamentRow[] | null>(null);
  // One open card per list (Round 6 item 3).
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [, forceRender] = useState(0);

  useEffect(() => subscribeSync(() => forceRender((n) => n + 1)), []);
  // Marks/fills paint from the priorities cache at render — repaint
  // when a fetch lands (Round 6 follow-up).
  useEffect(() => subscribePriorities(() => forceRender((n) => n + 1)), []);

  useEffect(() => {
    // Cached-first (Round 2 perf ruling): the last served list paints
    // immediately; the fetch refreshes it behind. A refresh failure
    // over a painted cache stays quiet — an empty list and a failed
    // read are still different things when there is nothing cached.
    const cached = cachedTournaments();
    if (cached) setRows(tournamentsFor(cached, tour, kind) as TournamentRow[]);
    void (async () => {
      const r = await fetchTournaments();
      if (r.ok) setRows(tournamentsFor(r.value, tour, kind) as TournamentRow[]);
      else if (!cached) setError(messageOf(r.error));
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
        contentContainerStyle={{ paddingTop: spacing.l }}
        renderItem={({ item }) => (
          // The tournament's own initials as the generated monogram
          // where we hold no artwork (22b) — but a mark the art
          // pipeline DOES hold (the aliased cups — Round 3 mark audit
          // v2) renders; the majors have no provider mark and keep the
          // monogram honestly.
          <CompetitionCard
            name={item.name}
            expanded={openKey === item.key}
            onExpandedChange={(v) => setOpenKey(v ? item.key : null)}
            caption={tournamentDateRange(item.startUtc, item.endUtc)}
            theme={teamTheme(tennis?.accent ?? null, mode)}
            monogram={monogramOf(item.name)}
            {...(cachedPriorities().competitionArt[item.key]
              ? { crestUrl: cachedPriorities().competitionArt[item.key] }
              : {})}
            {...(cachedPriorities().competitionArtTileFills[item.key]
              ? { tileFill: cachedPriorities().competitionArtTileFills[item.key] }
              : {})}
            {...(cachedPriorities().competitionArtColours[item.key]
              ? { burstColours: cachedPriorities().competitionArtColours[item.key] }
              : {})}
            glyph={tennis?.glyph ?? '\u{1F3BE}'}
            onOpen={() =>
              navigation.navigate('Team', {
                teamKey: item.key,
                name: item.name,
                sportKey: 'tennis',
                followType: 'competition',
              })
            }
            following={isFollowed(item.key)}
            onFollow={() => void toggle(item)}
            busy={busyKey === item.key}
          />
        )}
      />
    </View>
  );
}
