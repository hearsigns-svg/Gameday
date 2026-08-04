// Team browse level with search. Following a team yields ALL its
// fixtures across competitions (docs/PRODUCT.md).

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { monogramOf, FollowButton, ListRow } from '../../../core/components';
import { RootStackParamList } from '../../../core/navigation';
import { messageOf } from '../../../core/result';
import { radius, spacing, type, useTheme } from '../../../core/tokens';
import { useColorSchemeMode } from '../../../core/useColorSchemeMode';
import { teamTheme } from '../../../core/teamTheme';
import { subscribeSync } from '../../calendar-sync/syncEngine';

// A competition's team-poll route may be per-team (football-data supplies
// `pollFdTeam?teamId={teamId}&season=…`) or league-wide (TheSportsDB polls
// the whole league whichever team you followed). Substitute when asked,
// pass through when not.
function teamPollPathFor(template: string, teamId: number | string): string {
  return template.replace('{teamId}', String(teamId));
}
import { follow, unfollow } from '../followActions';
import { followFeedback } from '../followFeedback';
import { DirectoryTeam, fetchTeams } from '../data/directoryRepo';
import { isFollowed } from '../data/followStore';
import { colourFromKitText } from '../domain/entityColour';
import { sportByKey } from '../domain/sportsConfig';

type Props = NativeStackScreenProps<RootStackParamList, 'TeamList'>;

export default function TeamListScreen({ navigation, route }: Props) {
  const t = useTheme();
  const mode = useColorSchemeMode();
  const sport = sportByKey(route.params.sportKey);
  const [teams, setTeams] = useState<DirectoryTeam[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [queryText, setQueryText] = useState('');
  const [, forceRender] = useState(0);

  // Toast Undo (and any other sync) must refresh Follow buttons here too.
  useEffect(() => subscribeSync(() => forceRender((n) => n + 1)), []);

  useEffect(() => {
    void (async () => {
      const r = await fetchTeams(route.params.sportKey, route.params.leagueId);
      if (r.ok) setTeams(r.value);
      else setError(messageOf(r.error));
    })();
  }, [route.params.sportKey, route.params.leagueId]);

  const visible = useMemo(() => {
    if (!teams) return null;
    const q = queryText.trim().toLowerCase();
    return q ? teams.filter((tm) => tm.name.toLowerCase().includes(q)) : teams;
  }, [teams, queryText]);

  const toggle = useCallback(async (team: DirectoryTeam) => {
    const brandColour = colourFromKitText(team.colours);
    const item = {
      key: team.key,
      label: team.name,
      sportKey: route.params.sportKey,
      type: 'team' as const,
      ...(team.crestUrl ? { crestUrl: team.crestUrl } : {}),
      ...(route.params.teamPollPath
        ? { pollPath: teamPollPathFor(route.params.teamPollPath, team.id) }
        : {}),
      ...(brandColour ? { brandColour } : {}),
    };
    setBusyKey(team.key);
    const wasFollow = !isFollowed(team.key);
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

  if (error && !teams) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <Text style={[type.body, { color: t.danger }]}>{error}</Text>
      </View>
    );
  }
  if (!visible) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={t.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <TextInput
        accessibilityLabel={`Search teams in ${route.params.leagueName}`}
        placeholder="Search teams"
        placeholderTextColor={t.textSecondary}
        value={queryText}
        onChangeText={setQueryText}
        autoCorrect={false}
        style={[
          styles.search,
          {
            backgroundColor: t.surface,
            color: t.textPrimary,
            borderColor: t.border,
          },
        ]}
      />
      {error ? (
        <Text style={[type.secondary, { color: t.danger, padding: spacing.l }]}>
          {error}
        </Text>
      ) : null}
      <FlatList
        data={visible}
        keyExtractor={(tm) => tm.key}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <ListRow
            title={item.name}
            {...(item.crestUrl ? { imageUrl: item.crestUrl } : {})}
            glyph={sport?.glyph ?? '🏟️'}
            tileTheme={teamTheme(
              colourFromKitText(item.colours) ?? sport?.accent ?? null,
              mode,
            )}
            monogram={monogramOf(item.name)}
            accessibilityLabel={`${item.name}, view fixtures`}
            onPress={() =>
              navigation.navigate('Team', {
                teamKey: item.key,
                name: item.name,
                sportKey: route.params.sportKey,
                ...(route.params.teamPollPath
                  ? { pollPath: teamPollPathFor(route.params.teamPollPath, item.id) }
                  : {}),
                ...(item.colours ? { colours: item.colours } : {}),
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
                <Text
                  style={[type.body, { color: t.textSecondary }]}
                  accessible={false}
                >
                  ›
                </Text>
              </View>
            }
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  search: {
    margin: spacing.l,
    paddingHorizontal: spacing.l,
    minHeight: 44,
    borderRadius: radius.button,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
  },
});
