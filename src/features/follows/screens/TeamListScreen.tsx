// Team browse level with search. Following a team yields ALL its
// fixtures across competitions (docs/PRODUCT.md).
//
// One league per visit, reached from the competition's own "Browse
// teams" row (Prompt 27 C, owner mockup 2026-08-17). The screen-level
// all-leagues mode that briefly lived here was deleted with the design
// that needed it — dead machinery gets resurrected by future sessions
// that don't know why it exists.

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
import { monogramOf, FollowButton, SportCard, TileRow } from '../../../core/components';
import { anyFoldedIncludes } from '../../../core/nameFold';
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
import { hydrateFollowArt, isFollowed } from '../data/followStore';
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
      if (r.ok) {
        setTeams(r.value);
        // Repair stored follows' crests from the fresh rows.
        hydrateFollowArt(
          r.value.map((tm) => ({
            key: tm.key,
            ...(tm.crestUrl ? { crestUrl: tm.crestUrl } : {}),
            ...(colourFromKitText(tm.colours)
              ? { brandColour: colourFromKitText(tm.colours) as string }
              : {}),
          })),
        );
      } else setError(messageOf(r.error));
    })();
  }, [route.params.sportKey, route.params.leagueId]);

  const visible = useMemo(() => {
    if (!teams) return null;
    // FOLD BOTH SIDES, AND SEARCH THE ALIASES (22c). This compared raw
    // lower-cased names, so "Monchengladbach" did not find
    // "Mönchengladbach" — the row was on screen, the user typed what
    // they saw, and the list went empty. The provider's own aliases go
    // in too, now that the client type stops discarding them.
    return queryText.trim()
      ? teams.filter((tm) =>
          anyFoldedIncludes([tm.name, ...(tm.aliases ?? [])], queryText),
        )
      : teams;
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
          <TileRow
            right={
              <FollowButton
                following={isFollowed(item.key)}
                subject={item.name}
                busy={busyKey === item.key}
                onPress={() => void toggle(item)}
              />
            }
          >
            <SportCard
              fullWidth
              label={item.name}
              // NO CAPTION. The crest and the name ARE a club's
              // identity, and every team on this screen is in the
              // league you just opened — "Premier League" under each of
              // twenty rows says nothing and costs a line on all of
              // them.
              glyph={sport?.glyph ?? '🏟️'}
              theme={teamTheme(
                colourFromKitText(item.colours) ?? sport?.accent ?? null,
                mode,
              )}
              monogram={monogramOf(item.name)}
              {...(item.crestUrl ? { imageUrl: item.crestUrl } : {})}
              accessibilityLabel={`${item.name}, view fixtures`}
              onPress={() =>
                navigation.navigate('Team', {
                  teamKey: item.key,
                  name: item.name,
                  sportKey: route.params.sportKey,
                  ...(route.params.teamPollPath
                    ? { pollPath: teamPollPathFor(route.params.teamPollPath, item.id) }
                    : {}),
                  ...(item.crestUrl ? { crestUrl: item.crestUrl } : {}),
                  ...(item.colours ? { colours: item.colours } : {}),
                })
              }
            />
          </TileRow>
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
