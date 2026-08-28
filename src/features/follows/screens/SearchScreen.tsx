// Global search: type "liverpool" and get everything followable with
// that name — no sport pre-selection (owner ruling: scoping first is
// needless friction). Sports and competitions match instantly from
// config + the cached soccer directory; teams stream in from the
// federated server search. GROUPING is the disambiguation.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  InteractionManager,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { monogramOf,
  FollowButton,
  SectionHeader,
  SportCard,
  TileRow,
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
  cachedLeagues,
  cachedTournaments,
  fetchLeagues,
  fetchTournaments,
  searchEntities,
  SearchAthleteHit,
  SearchTeamHit,
  TournamentRow,
} from '../data/directoryRepo';
import { byPriority, byPriorityLive, cachedPriorities, refreshPriorities } from '../data/browsePriority';
import { hydrateFollowArt, isFollowed, Followable } from '../data/followStore';
import { isRetired, retiredCaption } from '../domain/careerStatus';
import { colourFromKitText } from '../domain/entityColour';
import { nationCaption } from '../domain/athleteIdentity';
import { flagEmojiOf } from '../../../core/nationality';
import { SportConfig, sportByKey, SPORTS } from '../domain/sportsConfig';
import { sportLabelFor, sportMatches } from '../domain/sportTerms';
import { activeRegion } from '../../../core/regionStore';
import { foldedIncludes } from '../../../core/nameFold';
import { expandQuery } from '../domain/searchAliases';

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
  // Athlete nationality (Prompt 16 B), carried to the athlete page.
  countryCode?: string;
  tileBadge?: string; // the flag, on the tile
  followable?: Followable; // absent → row navigates instead
}

// The sport's name AS THIS USER SEES IT EVERYWHERE ELSE, for the two
// sites that hold only a sport KEY. (The two inside `localMatches` hold
// the config object already and call `sportLabelFor` directly.) All four
// used to name the sport with its bundled label rather than the word on
// screen, so a search result read "Arsenal · Premier League · Soccer" to
// someone the rest of the app had spent all day calling it Football to.
function sportNameOf(sportKey: string): string {
  const cfg = sportByKey(sportKey);
  return cfg ? sportLabelFor(cfg.key, cfg.label, activeRegion()) : sportKey;
}

function localMatches(q: string): { sports: Row[]; comps: Row[] } {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return { sports: [], comps: [] };
  // The query plus its aliases — "Super Bowl" must find the NFL row,
  // and every channel matches the same expanded set (Part A).
  const needles = expandQuery(q.trim()).map((n) => n.toLowerCase());
  // MATCH EVERY NAME, DISPLAY THE LOCAL ONE (22c). This filtered on the
  // bundled config label while Home, Following, the team page and the
  // sport picker all showed the REGIONAL word — so in the UK the app
  // said "Football", and then found nothing when you typed it back.
  const sports: Row[] = SPORTS.filter(
    (s) => s.enabled && needles.some((n) => sportMatches(s.key, s.label, n)),
  ).map((s) => ({
    kind: 'sport',
    key: `sport-${s.key}`,
    title: sportLabelFor(s.key, s.label, activeRegion()),
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
      // Folded, like the server's athlete and team search in the same
      // result list — an unfolded competition filter meant one screen
      // answered to "Brasileirao" for a player and not for the league.
      .filter((c) => s.enabled && needles.some((n) => foldedIncludes(c.name, n)))
      .map((c) => ({
        kind: 'competition' as const,
        key: c.key,
        title: c.name,
        caption: `${c.country} · ${sportLabelFor(s.key, s.label, activeRegion())}`,
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
          // The row above shows this logo; the follow kept none of it
          // until Prompt 16, so following from search lost it.
          ...(cachedPriorities().competitionArt[String(c.id)]
            ? { crestUrl: cachedPriorities().competitionArt[String(c.id)] }
            : {}),
        },
      })),
  );
  return { sports, comps };
}

export default function SearchScreen({ navigation }: Props) {
  const t = useTheme();
  const mode = useColorSchemeMode();
  const [query, setQuery] = useState('');
  // Cached-first (Round 2 perf ruling): the last served answer paints
  // immediately; the fetch below refreshes it behind.
  const [soccerLeagues, setSoccerLeagues] = useState<DirectoryLeague[]>(
    () => cachedLeagues() ?? [],
  );
  const [tournaments, setTournaments] = useState<TournamentRow[]>(
    () => cachedTournaments() ?? [],
  );
  const [teams, setTeams] = useState<SearchTeamHit[]>([]);
  const [athletes, setAthletes] = useState<SearchAthleteHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [, forceRender] = useState(0);
  const requestSeq = useRef(0);

  useEffect(() => subscribeSync(() => forceRender((n) => n + 1)), []);
  useEffect(() => void refreshPriorities(), []);
  // The keyboard rises AFTER the push transition settles (Round 2 perf
  // ruling): autoFocus raised it mid-animation, and the two competing
  // was most of the entry "clunk".
  const inputRef = useRef<TextInput>(null);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      inputRef.current?.focus();
    });
    return () => task.cancel();
  }, []);

  // Soccer competitions live in the directory, not config — one cached
  // fetch makes them searchable alongside everything else. Tournaments
  // the same (Part A, 2026-08-14): the tennis majors lived ONLY behind
  // browse's section entry rows, so "Wimbledon" found a football club
  // and not the tournament. Anything followable must be findable by
  // typing its name — so every followable population search reads.
  useEffect(() => {
    void (async () => {
      // In PARALLEL (Round 2 perf audit: these ran serially, and on a
      // cold backend the second waited out the first's whole start-up).
      const [r, t] = await Promise.all([fetchLeagues(), fetchTournaments()]);
      if (r.ok) setSoccerLeagues(r.value);
      if (t.ok) setTournaments(t.value);
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
          hydrateFollowArt([
            ...r.value.teams,
            ...r.value.athletes
              .filter((a) => a.countryCode)
              .map((a) => ({ key: a.key, countryCode: a.countryCode as string })),
          ]);
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
            .filter((l) => foldedIncludes(l.name, needle))
            .map((l) => ({
              kind: 'competition' as const,
              key: l.key,
              title: l.name,
              // The LAST hardcoded sport name on this screen. Every other
              // caption here now says what the user's region calls it;
              // this literal would have gone on saying "Soccer" under a
              // row on a screen that says Football everywhere else.
              caption: `${l.country} · ${sportNameOf('soccer')}`,
              sportKey: 'soccer',
              // The mirror image of the static rows: this one had the
              // logo on the FOLLOW and nothing on the row.
              ...(l.crestUrl ? { imageUrl: l.crestUrl } : {}),
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
      caption: `${hit.league} · ${sportNameOf(hit.sportKey)}`,
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
      caption: [
        retiredCaption(hit) ?? hit.grouping ?? 'Athlete',
        sportNameOf(hit.sportKey),
        // Nationality (Prompt 16 B): the athlete's identity mark.
        nationCaption(hit.countryCode),
      ]
        .filter(Boolean)
        .join(' · '),
      sportKey: hit.sportKey,
      ...(hit.countryCode ? { countryCode: hit.countryCode } : {}),
      ...(flagEmojiOf(hit.countryCode)
        ? { tileBadge: flagEmojiOf(hit.countryCode) as string }
        : {}),
      followable: {
        key: hit.key,
        label: hit.name,
        sportKey: hit.sportKey,
        type: 'athlete' as const,
        ...(hit.countryCode ? { countryCode: hit.countryCode } : {}),
        ...(hit.grouping ? { grouping: hit.grouping } : {}),
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
    // Tournaments (Part A): tennis majors and the rest of the tour
    // calendar, searchable under every name the query expands to and
    // followable with exactly the shape the browse rows use.
    const needles =
      needle.length >= 2
        ? expandQuery(query.trim()).map((n) => n.toLowerCase())
        : [];
    const tournamentRows: Row[] = needles.length
      ? tournaments
          .filter((tr) => needles.some((n) => foldedIncludes(tr.name, n)))
          .map((tr) => ({
            kind: 'competition' as const,
            key: tr.key,
            title: tr.name,
            caption: `Tournament · ${sportNameOf('tennis')}`,
            sportKey: 'tennis',
            followable: {
              key: tr.key,
              label: tr.name,
              sportKey: 'tennis',
              type: 'competition' as const,
            },
          }))
      : [];
    const seen = new Set<string>();
    const pr = cachedPriorities();
    const compRows = byPriorityLive(
      [...comps, ...soccerRows, ...tournamentRows].filter((r) =>
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
  }, [query, teams, athletes, soccerLeagues, tournaments]);

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
        ref={inputRef}
        accessibilityLabel="Search teams, athletes, competitions and sports"
        placeholder="Team, athlete, competition or sport"
        placeholderTextColor={t.textSecondary}
        value={query}
        onChangeText={setQuery}
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
            // EVERY KIND OF ROW OPENS SOMETHING (22b). The old branch
            // keyed off `followable` rather than `kind`, and its middle
            // arm returned `undefined` — so a COMPETITION hit, and an
            // F1-style sport hit that carries a series follow, were the
            // only rows in the app that did nothing when pressed. The
            // same competition opened fine from browse.
            //
            // That was survivable on a row. It is not survivable on a
            // tile: the tile IS the affordance, and one that opens
            // nothing is a lie the press state tells on every tap. So
            // the branch is by `kind`, which is total.
            const open = () => {
              if (item.kind === 'sport') {
                navigation.navigate('LeagueList', { sportKey: item.sportKey });
                return;
              }
              const f = item.followable;
              navigation.navigate('Team', {
                teamKey: f?.key ?? item.key,
                name: item.title,
                sportKey: item.sportKey,
                // The type has to survive the trip: TeamScreen defaults
                // to 'team', so an athlete re-followed from their own
                // page would come back a team, and a competition a club.
                ...(item.kind === 'athlete'
                  ? { followType: 'athlete' as const }
                  : {}),
                ...(item.kind === 'competition'
                  ? { followType: 'competition' as const }
                  : {}),
                ...(f?.pollPath ? { pollPath: f.pollPath } : {}),
                ...(f?.crestUrl
                  ? { crestUrl: f.crestUrl }
                  : item.imageUrl
                    ? { crestUrl: item.imageUrl }
                    : {}),
                ...(item.countryCode ? { countryCode: item.countryCode } : {}),
                ...(f?.grouping ? { grouping: f.grouping } : {}),
                ...(f?.careerStatus ? { careerStatus: f.careerStatus } : {}),
                ...(f?.careerEndYear !== undefined
                  ? { careerEndYear: f.careerEndYear }
                  : {}),
              });
            };
            return (
              <TileRow
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
                  ) : undefined
                }
              >
                <SportCard
                  // NOT COMPACT. The compact geometry exists for the
                  // athlete directory's 500 names and caps the label at
                  // one line; search results are a handful of mixed
                  // entities, and the rows these replaced wrapped
                  // freely, so taking that geometry here would truncate
                  // long club names that used to read in full.
                  fullWidth
                  label={item.title}
                  caption={item.caption}
                  glyph={sport?.glyph ?? '🏟️'}
                  theme={teamTheme(
                    item.followable?.brandColour ?? sport?.accent ?? null,
                    mode,
                  )}
                  // A SPORT keeps its own mark. Stamping "SO" over the
                  // soccer ball would replace the one thing on the row
                  // that already identifies it.
                  {...(item.kind === 'sport'
                    ? {}
                    : { monogram: monogramOf(item.title) })}
                  {...(item.imageUrl ? { imageUrl: item.imageUrl } : {})}
                  {...(item.tileBadge ? { tileBadge: item.tileBadge } : {})}
                  accessibilityLabel={`${item.title}, ${item.caption}`}
                  onPress={open}
                />
              </TileRow>
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
