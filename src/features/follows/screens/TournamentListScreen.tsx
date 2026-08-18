// One tour's tournaments — the majors, or everything else.
//
// These used to be inline rows under the tour heading, which put 95 of
// them between the top of tennis browse and anything below. They live
// behind their own entry now, so the browse screen stays two short
// sections and the list is a list.
//
// EVERY TOURNAMENT IS ONE CARD (27C), the same card the Competitions
// screen renders: title area is information, actions live in the
// labelled footer. A tournament's contents are MATCHES — the tour's
// are tournaments — and it has no teams, so that segment greys.

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
import { fetchTournaments, TournamentRow } from '../data/directoryRepo';
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
          // The tournament's own initials as the generated monogram, so
          // Wimbledon and the Western & Southern Open are distinguishable
          // at a glance without inventing per-tournament artwork we do
          // not hold (22b, owner ruling).
          <CompetitionCard
            name={item.name}
            subtitle={tournamentDateRange(item.startUtc, item.endUtc)}
            theme={teamTheme(tennis?.accent ?? null, mode)}
            monogram={monogramOf(item.name)}
            glyph={tennis?.glyph ?? '\u{1F3BE}'}
            fixturesWord="Matches"
            onFixtures={() =>
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
