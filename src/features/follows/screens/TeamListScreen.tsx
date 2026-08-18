// Team browse level with search. Following a team yields ALL its
// fixtures across competitions (docs/PRODUCT.md).
//
// TWO MODES (Prompt 27 C revised). With a leagueId this is one league's
// clubs — the card's Teams segment, today's ONLY caller. Without one it
// is the sport's whole team population, every team-capable league
// sectioned under its own name with one search across all of it —
// KEPT per the 27C brief ("keep the all-leagues browse destination"),
// but currently DORMANT: the revised card design has no aggregate
// entry point, so nothing navigates here without a leagueId yet. If
// you are wiring one, also give App.tsx's TeamList title a value for
// the no-league case, and order the sections by browse priority —
// this mode predates both.

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SectionList,
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
import {
  DirectoryTeam,
  fetchLeagues,
  fetchTeams,
} from '../data/directoryRepo';
import { hydrateFollowArt, isFollowed } from '../data/followStore';
import { colourFromKitText } from '../domain/entityColour';
import { sportByKey } from '../domain/sportsConfig';

type Props = NativeStackScreenProps<RootStackParamList, 'TeamList'>;

interface TeamSection {
  title: string;
  teamPollPath?: string;
  data: DirectoryTeam[];
  // A league whose fetch failed says so IN PLACE. Dropping the section
  // would make a read failure indistinguishable from a league with no
  // teams — the standing invariant, applied to browse.
  error?: string;
}

// The sport's team-capable leagues — the same population that used to
// carry per-row Teams buttons.
async function teamLeaguesOf(
  sportKey: string,
): Promise<Array<{ id: number | string; name: string; teamPollPath?: string }>> {
  if (sportKey === 'soccer') {
    const r = await fetchLeagues();
    if (!r.ok) throw new Error(messageOf(r.error));
    return r.value
      .filter((l) => !l.followOnly)
      .map((l) => ({
        id: l.id,
        name: l.name,
        ...(l.teamPollPath ? { teamPollPath: l.teamPollPath } : {}),
      }));
  }
  const sport = sportByKey(sportKey);
  return (sport?.staticCompetitions ?? [])
    .filter((c) => !c.followOnly)
    .map((c) => ({
      id: c.id,
      name: c.name,
      ...(c.teamPollPath ? { teamPollPath: c.teamPollPath } : {}),
    }));
}

export default function TeamListScreen({ navigation, route }: Props) {
  const t = useTheme();
  const mode = useColorSchemeMode();
  const sport = sportByKey(route.params.sportKey);
  const allLeagues = route.params.leagueId === undefined;
  const [teams, setTeams] = useState<DirectoryTeam[] | null>(null);
  const [sections, setSections] = useState<TeamSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [queryText, setQueryText] = useState('');
  const [, forceRender] = useState(0);

  // Toast Undo (and any other sync) must refresh Follow buttons here too.
  useEffect(() => subscribeSync(() => forceRender((n) => n + 1)), []);

  useEffect(() => {
    if (allLeagues) return;
    void (async () => {
      const r = await fetchTeams(route.params.sportKey, route.params.leagueId!);
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
  }, [allLeagues, route.params.sportKey, route.params.leagueId]);

  useEffect(() => {
    if (!allLeagues) return;
    void (async () => {
      try {
        const leagues = await teamLeaguesOf(route.params.sportKey);
        const fetched = await Promise.all(
          leagues.map(async (l) => {
            const r = await fetchTeams(route.params.sportKey, l.id);
            return r.ok
              ? {
                  title: l.name,
                  ...(l.teamPollPath ? { teamPollPath: l.teamPollPath } : {}),
                  data: r.value,
                }
              : {
                  title: l.name,
                  ...(l.teamPollPath ? { teamPollPath: l.teamPollPath } : {}),
                  data: [],
                  error: messageOf(r.error),
                };
          }),
        );
        setSections(fetched);
        hydrateFollowArt(
          fetched.flatMap((s) =>
            s.data.map((tm) => ({
              key: tm.key,
              ...(tm.crestUrl ? { crestUrl: tm.crestUrl } : {}),
              ...(colourFromKitText(tm.colours)
                ? { brandColour: colourFromKitText(tm.colours) as string }
                : {}),
            })),
          ),
        );
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e));
      }
    })();
  }, [allLeagues, route.params.sportKey]);

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

  const visibleSections = useMemo(() => {
    if (!sections) return null;
    if (!queryText.trim()) return sections;
    return sections
      .map((s) => ({
        ...s,
        data: s.data.filter((tm) =>
          anyFoldedIncludes([tm.name, ...(tm.aliases ?? [])], queryText),
        ),
      }))
      .filter((s) => s.data.length > 0 || s.error);
  }, [sections, queryText]);

  const toggle = useCallback(
    async (team: DirectoryTeam, pollTemplate?: string) => {
      const brandColour = colourFromKitText(team.colours);
      const item = {
        key: team.key,
        label: team.name,
        sportKey: route.params.sportKey,
        type: 'team' as const,
        ...(team.crestUrl ? { crestUrl: team.crestUrl } : {}),
        ...(pollTemplate
          ? { pollPath: teamPollPathFor(pollTemplate, team.id) }
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
    },
    [navigation],
  );

  const teamRow = useCallback(
    (item: DirectoryTeam, pollTemplate?: string) => (
      <TileRow
        right={
          <FollowButton
            following={isFollowed(item.key)}
            subject={item.name}
            busy={busyKey === item.key}
            onPress={() => void toggle(item, pollTemplate)}
          />
        }
      >
        <SportCard
          fullWidth
          label={item.name}
          // NO CAPTION. The crest and the name ARE a club's identity,
          // and the league is either the screen (one-league mode) or
          // the section header above (browse mode).
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
              ...(pollTemplate
                ? { pollPath: teamPollPathFor(pollTemplate, item.id) }
                : {}),
              ...(item.crestUrl ? { crestUrl: item.crestUrl } : {}),
              ...(item.colours ? { colours: item.colours } : {}),
            })
          }
        />
      </TileRow>
    ),
    [busyKey, mode, navigation, route.params.sportKey, sport, toggle],
  );

  if (error && !teams && !sections) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <Text style={[type.body, { color: t.danger }]}>{error}</Text>
      </View>
    );
  }
  if ((allLeagues && !visibleSections) || (!allLeagues && !visible)) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={t.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <TextInput
        accessibilityLabel={
          allLeagues
            ? 'Search all teams'
            : `Search teams in ${route.params.leagueName}`
        }
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
      {allLeagues ? (
        <SectionList
          sections={visibleSections ?? []}
          keyExtractor={(tm) => tm.key}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View>
              <Text
                accessibilityRole="header"
                style={[type.label, styles.sectionHeading, { color: t.textSecondary }]}
              >
                {section.title}
              </Text>
              {(section as TeamSection).error ? (
                <Text
                  style={[type.caption, { color: t.danger, paddingHorizontal: spacing.l }]}
                >
                  {(section as TeamSection).error}
                </Text>
              ) : null}
            </View>
          )}
          renderItem={({ item, section }) =>
            teamRow(item, (section as TeamSection).teamPollPath)
          }
        />
      ) : (
        <SectionList
          sections={[{ title: '', data: visible ?? [] }]}
          keyExtractor={(tm) => tm.key}
          keyboardShouldPersistTaps="handled"
          renderSectionHeader={() => null}
          renderItem={({ item }) => teamRow(item, route.params.teamPollPath)}
        />
      )}
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
  sectionHeading: {
    paddingHorizontal: spacing.l,
    paddingTop: spacing.l,
    paddingBottom: spacing.s,
  },
});
