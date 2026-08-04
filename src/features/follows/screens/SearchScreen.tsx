// Global search: type "liverpool" and get everything followable with
// that name — no sport pre-selection (owner ruling: scoping first is
// needless friction). Sports and competitions match instantly from
// config + the cached soccer directory; teams stream in from the
// federated server search. GROUPING is the disambiguation.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { monogramOf,
  FollowButton,
  ListRow,
  SectionHeader,
} from '../../../core/components';
import { RootScreenProps } from '../../../core/navigation';
import { useColorSchemeMode } from '../../../core/useColorSchemeMode';
import { messageOf } from '../../../core/result';
import { hueToHex, teamTheme } from '../../../core/teamTheme';
import { radius, spacing, type, useTheme } from '../../../core/tokens';
import { subscribeSync } from '../../calendar-sync/syncEngine';
import { follow, unfollow } from '../followActions';
import { followFeedback } from '../followFeedback';
import {
  DirectoryLeague,
  fetchLeagues,
  searchEntities,
  SearchAthleteHit,
  SearchTeamHit,
} from '../data/directoryRepo';
import { byPriority, byPriorityLive, cachedPriorities, refreshPriorities } from '../data/browsePriority';
import { isFollowed, Followable } from '../data/followStore';
import { isRetired, retiredCaption } from '../domain/careerStatus';
import { colourFromKitText } from '../domain/entityColour';
import { SportConfig, sportByKey, SPORTS } from '../domain/sportsConfig';

type Props = RootScreenProps<'Search'>;

const DEBOUNCE_MS = 350;

interface Row {
  kind: 'sport' | 'competition' | 'team' | 'athlete';
  key: string;
  title: string;
  caption: string;
  sportKey: string;
  // Crest / competition logo where the provider has one (Prompt 13).
  imageUrl?: string;
  followable?: Followable; // absent → row navigates instead
}

function localMatches(q: string): { sports: Row[]; comps: Row[] } {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return { sports: [], comps: [] };
  const sports: Row[] = SPORTS.filter(
    (s) => s.enabled && s.label.toLowerCase().includes(needle),
  ).map((s) => ({
    kind: 'sport',
    key: `sport-${s.key}`,
    title: s.label,
    caption: 'Sport',
    sportKey: s.key,
    ...(s.seriesFollowable
      ? {
          followable: {
            key: s.seriesFollowable.key,
            label: s.seriesFollowable.label,
            sportKey: s.key,
            type: 'series' as const,
            ...(s.seriesFollowable.pollPath
              ? { pollPath: s.seriesFollowable.pollPath }
              : {}),
          },
        }
      : {}),
  }));
  const comps: Row[] = SPORTS.flatMap((s: SportConfig) =>
    (s.staticCompetitions ?? [])
      .filter((c) => s.enabled && c.name.toLowerCase().includes(needle))
      .map((c) => ({
        kind: 'competition' as const,
        key: c.key,
        title: c.name,
        caption: `${c.country} · ${s.label}`,
        sportKey: s.key,
        ...(cachedPriorities().competitionArt[String(c.id)]
          ? { imageUrl: cachedPriorities().competitionArt[String(c.id)] }
          : {}),
        followable: {
          key: c.key,
          label: c.name,
          sportKey: s.key,
          type: 'competition' as const,
          ...(c.pollPath ? { pollPath: c.pollPath } : {}),
        },
      })),
  );
  return { sports, comps };
}

export default function SearchScreen({ navigation }: Props) {
  const t = useTheme();
  const mode = useColorSchemeMode();
  const [query, setQuery] = useState('');
  const [soccerLeagues, setSoccerLeagues] = useState<DirectoryLeague[]>([]);
  const [teams, setTeams] = useState<SearchTeamHit[]>([]);
  const [athletes, setAthletes] = useState<SearchAthleteHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [, forceRender] = useState(0);
  const requestSeq = useRef(0);

  useEffect(() => subscribeSync(() => forceRender((n) => n + 1)), []);
  useEffect(() => void refreshPriorities(), []);

  // Soccer competitions live in the directory, not config — one cached
  // fetch makes them searchable alongside everything else.
  useEffect(() => {
    void (async () => {
      const r = await fetchLeagues();
      if (r.ok) setSoccerLeagues(r.value);
    })();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      requestSeq.current++; // invalidate any in-flight search
      setTeams([]);
      setAthletes([]);
      setSearching(false);
      setError(null);
      return;
    }
    setSearching(true);
    const seq = ++requestSeq.current;
    const timer = setTimeout(() => {
      void (async () => {
        const r = await searchEntities(q);
        if (seq !== requestSeq.current) return; // stale response
        setSearching(false);
        if (r.ok) {
          setTeams(r.value.teams);
          setAthletes(r.value.athletes);
          setError(null);
        } else {
          setTeams([]);
          setAthletes([]);
          setError(messageOf(r.error));
        }
      })();
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const sections = useMemo(() => {
    const { sports, comps } = localMatches(query);
    const needle = query.trim().toLowerCase();
    const soccerRows: Row[] =
      needle.length >= 2
        ? soccerLeagues
            .filter((l) => l.name.toLowerCase().includes(needle))
            .map((l) => ({
              kind: 'competition' as const,
              key: l.key,
              title: l.name,
              caption: `${l.country} · Soccer`,
              sportKey: 'soccer',
              followable: {
                key: l.key,
                label: l.name,
                sportKey: 'soccer',
                type: 'competition' as const,
                ...(l.crestUrl ? { crestUrl: l.crestUrl } : {}),
                ...(l.pollPath ? { pollPath: l.pollPath } : {}),
              },
            }))
        : [];
    const teamRows: Row[] = teams.map((hit) => ({
      kind: 'team',
      key: hit.key,
      title: hit.name,
      caption: `${hit.league} · ${sportByKey(hit.sportKey)?.label ?? hit.sportKey}`,
      sportKey: hit.sportKey,
      ...(hit.crestUrl ? { imageUrl: hit.crestUrl } : {}),
      followable: {
        key: hit.key,
        label: hit.name,
        sportKey: hit.sportKey,
        type: 'team' as const,
        ...(hit.crestUrl ? { crestUrl: hit.crestUrl } : {}),
        ...(hit.pollPath ? { pollPath: hit.pollPath } : {}),
          ...(colourFromKitText(hit.colours)
          ? { brandColour: colourFromKitText(hit.colours) as string }
          : {}),
      },
    }));
    const athleteRows: Row[] = athletes.map((hit) => ({
      kind: 'athlete',
      key: hit.key,
      title: hit.name,
      // "Heavyweight · Boxing" beats "Athlete · Boxing" when the
      // directory knows the grouping — and "Retired 2022 · Tennis"
      // beats both, because search is the ONLY route to the 1,484 ATP
      // men who carry no browse group at all (Prompt 12).
      caption: `${retiredCaption(hit) ?? hit.grouping ?? 'Athlete'} · ${sportByKey(hit.sportKey)?.label ?? hit.sportKey}`,
      sportKey: hit.sportKey,
      followable: {
        key: hit.key,
        label: hit.name,
        sportKey: hit.sportKey,
        type: 'athlete' as const,
        ...(hit.pollPath ? { pollPath: hit.pollPath } : {}),
        // The generated colour identity persists onto the follow, so
        // the rail, Home and the athlete page inherit it (Prompt 9b).
        ...(hit.accentHue !== undefined
          ? { brandColour: hueToHex(hit.accentHue) }
          : {}),
        ...(hit.careerStatus ? { careerStatus: hit.careerStatus } : {}),
        ...(hit.careerEndYear !== undefined
          ? { careerEndYear: hit.careerEndYear }
          : {}),
      },
    }));
    // Competition dedupe: config cups also appear in the soccer
    // directory under the same key. MATCHING is untouched by ordering
    // (Prompt 11): priority reorders the merged rows, nothing more —
    // so "Champions League" outranks "Championship" for "champion"
    // whichever source each came from.
    const seen = new Set<string>();
    const pr = cachedPriorities();
    const compRows = byPriorityLive(
      [...comps, ...soccerRows].filter((r) =>
        seen.has(r.key) ? false : (seen.add(r.key), true),
      ),
      (r) => r.key,
      pr.priorities,
      new Set(pr.dormant),
    );
    return [
      { title: 'Teams', data: teamRows },
      { title: 'Athletes', data: athleteRows },
      { title: 'Competitions', data: compRows },
      {
        title: 'Sports',
        data: byPriority(sports, (r) => r.sportKey ?? r.key, pr.sportWeights),
      },
    ].filter((s) => s.data.length > 0);
  }, [query, teams, athletes, soccerLeagues]);

  const toggle = useCallback(
    async (row: Row) => {
      const item = row.followable;
      if (!item) return;
      setBusyKey(row.key);
      const wasFollow = !isFollowed(item.key);
      const r = wasFollow ? await follow(item) : await unfollow(item);
      if (!r.ok && r.error.kind !== 'sync-in-progress') {
        setError(messageOf(r.error));
      } else {
        setError(null);
        followFeedback(r, item, wasFollow, () =>
          navigation.navigate('CalendarPriming'),
        );
      }
      // Only clear our own row's busy state — another row's toggle may
      // have started while this one was in flight.
      setBusyKey((k) => (k === row.key ? null : k));
      forceRender((n) => n + 1);
    },
    [navigation],
  );

  const q = query.trim();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <TextInput
        accessibilityLabel="Search teams, athletes, competitions and sports"
        placeholder="Team, athlete, competition or sport"
        placeholderTextColor={t.textSecondary}
        value={query}
        onChangeText={setQuery}
        autoFocus
        autoCorrect={false}
        style={[
          styles.input,
          {
            backgroundColor: t.surface,
            color: t.textPrimary,
            borderColor: t.border,
          },
        ]}
      />
      {error ? (
        <Text style={[type.secondary, { color: t.danger, paddingHorizontal: spacing.l }]}>
          {error}
        </Text>
      ) : null}
      {q.length >= 2 && sections.length === 0 && !searching && !error ? (
        <View style={styles.empty}>
          <Text style={[type.body, { color: t.textSecondary, textAlign: 'center' }]}>
            Nothing followable matches “{q}” — search covers the sports
            and leagues KickOffCal serves today.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(r) => r.key}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <SectionHeader
              title={section.title}
              right={
                section.title === 'Teams' && searching ? (
                  <ActivityIndicator size="small" color={t.primary} />
                ) : undefined
              }
            />
          )}
          renderItem={({ item }) => {
            const sport = sportByKey(item.sportKey);
            return (
              <ListRow
                title={item.title}
                caption={item.caption}
                glyph={sport?.glyph ?? '🏟️'}
                tileTheme={teamTheme(
                  item.followable?.brandColour ?? sport?.accent ?? null,
                  mode,
                )}
                monogram={
                  item.kind === 'sport' ? undefined : monogramOf(item.title)
                }
                {...(item.imageUrl ? { imageUrl: item.imageUrl } : {})}
                accessibilityLabel={`${item.title}, ${item.caption}`}
                onPress={
                  (item.kind === 'team' || item.kind === 'athlete') &&
                  item.followable
                    ? () =>
                        navigation.navigate('Team', {
                          teamKey: item.followable!.key,
                          name: item.title,
                          sportKey: item.sportKey,
                          // An athlete opened from search must stay an
                          // athlete through re-follow — TeamScreen
                          // defaults the type to 'team' otherwise.
                          ...(item.kind === 'athlete'
                            ? { followType: 'athlete' as const }
                            : {}),
                          ...(item.followable!.pollPath
                            ? { pollPath: item.followable!.pollPath }
                            : {}),
                          ...(item.followable!.careerStatus
                            ? { careerStatus: item.followable!.careerStatus }
                            : {}),
                          ...(item.followable!.careerEndYear !== undefined
                            ? {
                                careerEndYear:
                                  item.followable!.careerEndYear,
                              }
                            : {}),
                        })
                    : item.followable
                      ? undefined
                      : () =>
                          navigation.navigate('LeagueList', {
                            sportKey: item.sportKey,
                          })
                }
                // A retired athlete is findable but not followable
                // (owner ruling 2026-08-04) — the caption already says
                // "Retired 2022", and that IS the row's answer. An
                // existing follow keeps its control so it can be undone.
                right={
                  item.followable &&
                  (!isRetired(item.followable) ||
                    isFollowed(item.followable.key)) ? (
                    <FollowButton
                      following={isFollowed(item.followable.key)}
                      subject={item.title}
                      busy={busyKey === item.key}
                      onPress={() => void toggle(item)}
                    />
                  ) : (
                    <Text style={[type.body, { color: t.textSecondary }]}>›</Text>
                  )
                }
              />
            );
          }}
          ListFooterComponent={
            searching && teams.length === 0 && q.length >= 2 ? (
              <View style={styles.empty}>
                <ActivityIndicator color={t.primary} />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    margin: spacing.l,
    paddingHorizontal: spacing.l,
    minHeight: 44,
    borderRadius: radius.button,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
  },
  empty: { padding: spacing.xl, alignItems: 'center' },
});
