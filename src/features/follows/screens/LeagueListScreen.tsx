// Competition browse level (Stage 6 + the owner's Fixtures ruling):
// every competition is ONE CARD in the ORIGINAL card language — the
// same tile-plus-Follow row a player or team gets, indistinguishable
// at rest. TEAMS decide the tap: a team league expands in place to
// [Fixtures-word | Teams]; a competition without teams opens its
// content directly (a tennis tour its tournament list, everything else
// its fixtures page). One search field at the top covers this sport's
// competitions and teams.

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  CoverageNote,
  FollowButton,
  monogramOf,
  SportCard,
  TileRow, COMPETITION_ROW_HEIGHT } from '../../../core/components';
import {
  BrowseRow,
  SLAM_KEYS,
  tennisBrowseRows,
  tournamentDateRange,
  tournamentsFor,
} from '../domain/tennisBrowse';
import { anyFoldedIncludes } from '../../../core/nameFold';
// Namespace import: `t` is this component's theme binding.
import * as i18n from '../../../core/i18n';
import { competitionDisplayName } from '../../../core/i18n/exonyms';
import { RootStackParamList } from '../../../core/navigation';
import { messageOf } from '../../../core/result';
import { activeRegion } from '../../../core/regionStore';
import { teamTheme } from '../../../core/teamTheme';
import { useColorSchemeMode } from '../../../core/useColorSchemeMode';
import { radius, spacing, type, useTheme } from '../../../core/tokens';
import { subscribeSync } from '../../calendar-sync/syncEngine';
import { CompetitionCard } from '../CompetitionCard';
import { follow, unfollow } from '../followActions';
import { followFeedback } from '../followFeedback';
import {
  cachedLeagues,
  cachedTournaments,
  DirectoryLeague,
  fetchLeagues,
  fetchTournaments,
  searchEntities,
  SearchTeamHit,
  TournamentRow, cachedAthleteCount, refreshAthleteCount } from '../data/directoryRepo';
import { byPriorityLive, cachedPriorities, refreshPriorities, subscribePriorities } from '../data/browsePriority';
import { hydrateFollowArt, isFollowed } from '../data/followStore';
import { colourFromKitText } from '../domain/entityColour';
import {
  OLYMPIC_EDITION_KEY,
  olympicSeasonOf,
  olympicsSubset,
} from '../domain/olympicsBrowse';
import { coverageNoteFor } from '../domain/coverageNotes';
import { expandQuery } from '../domain/searchAliases';
import { sportByKey, staticFollowAsFor } from '../domain/sportsConfig';
import { fixturesWordFor, sportLabelFor } from '../domain/sportTerms';
import { boxingGroupSex } from '../domain/boxingBrowse';

type Props = NativeStackScreenProps<RootStackParamList, 'LeagueList'>;

const DEBOUNCE_MS = 350;

// What the people in this sport are CALLED. "Athletes" is right for
// athletics and wrong everywhere else — a boxing fan is looking for
// fighters, a tennis fan for players.
// Round 6 item 2: the standing tap-advertising caption, with the count
// when the directory has been seen ("Tap to follow players (412)").
function peopleCaption(peopleWord: string, count: number | null): string {
  return count === null
    ? i18n.t('follows.athletes.tapToFollowNoCount', { people: peopleWord })
    : i18n.t('follows.athletes.tapToFollow', { people: peopleWord, n: String(count) });
}

function athleteRowTitle(sportKey: string): string {
  switch (sportKey) {
    case 'boxing':
    case 'ufc':
      return i18n.t('follows.athletes.fighters');
    case 'tennis':
      return i18n.t('follows.athletes.players');
    case 'f1':
    case 'motorsport':
      return i18n.t('follows.athletes.drivers');
    default:
      return i18n.t('follows.athletes.athletes');
  }
}

// "England · 20 teams" — the subtitle says what's behind Teams before
// it's tapped. No count known → the country stands alone (rule 10:
// omit, never explain).
function subtitleOf(item: DirectoryLeague): string {
  return item.teamCount !== undefined
    ? i18n.tn('follows.league.teamCount', item.teamCount, {
        country: item.country,
      })
    : item.country;
}


export default function LeagueListScreen({ navigation, route }: Props) {
  const t = useTheme();
  const mode = useColorSchemeMode();
  // One open card per list (Round 6 item 3): expanding one collapses
  // any other — an instant switch, never two open at once.
  const [openKey, setOpenKey] = useState<string | null>(null);
  // The people rows' count (Round 6 item 2): remembered from the last
  // directory fetch, refreshed in the background at most daily.
  const [, bumpCounts] = useState(0);
  useEffect(() => {
    if (sport?.browse.includes('athlete')) {
      refreshAthleteCount(route.params.sportKey);
      const id = setTimeout(() => bumpCounts((n) => n + 1), 2500);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [route.params.sportKey]);
  const sport = sportByKey(route.params.sportKey);
  const [leagues, setLeagues] = useState<DirectoryLeague[] | null>(null);
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [queryText, setQueryText] = useState('');
  const [teamHits, setTeamHits] = useState<SearchTeamHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [, forceRender] = useState(0);
  const requestSeq = useRef(0);
  const hasTeamSearch = sport?.browse.includes('team') === true;

  // Toast Undo (and any other sync) must refresh Follow segments here too.
  useEffect(() => subscribeSync(() => forceRender((n) => n + 1)), []);
  // Rows are DERIVED STATE with art stamped at build time — re-derive
  // when the priorities payload lands (Round 6 follow-up), or a screen
  // opened before the fetch keeps monograms until re-entered.
  const [artVersion, setArtVersion] = useState(0);
  useEffect(() => subscribePriorities(() => setArtVersion((n) => n + 1)), []);

  useEffect(() => {
    // Series sports (F1) render their one followable as a normal
    // competition card — following is ALWAYS a visible control on a row,
    // never a hidden tap side-effect on the sport itself.
    if (sport?.seriesFollowable && !sport.staticCompetitions) {
      const series = sport.seriesFollowable;
      // The series mark rides the same served art map the static rows
      // use, keyed by the FOLLOW key (Round 2 item 4 — F1 was the
      // known Following-strip monogram).
      void refreshPriorities();
      const art = cachedPriorities().competitionArt[series.key];
      const row: DirectoryLeague = {
        id: sport.key,
        name: series.label,
        country: i18n.t('follows.league.allEvents'),
        key: series.key,
        followOnly: true,
        ...(series.pollPath ? { pollPath: series.pollPath } : {}),
        ...(art ? { crestUrl: art } : {}),
      };
      setLeagues([row]);
      // A stored series follow captured before the mark existed heals
      // here, the same way static-row follows already do.
      hydrateFollowArt([row]);
      return;
    }
    if (sport?.staticCompetitions && route.params.sportKey !== 'soccer') {
      // Single-league sports: the rows are config; their ORDER is
      // catalogue-weight data (Prompt 11), live rows before dormant
      // ones (11b), config order as the offline fallback.
      void refreshPriorities();
      const pr = cachedPriorities();
      const rows = byPriorityLive(
        route.params.sportKey === 'olympics'
          ? olympicsSubset(sport.staticCompetitions, route.params.olympics)
          : sport.staticCompetitions,
        (c) => c.key,
        pr.priorities,
        new Set(pr.dormant),
      ).map((c) => {
        // Competition logo by TSDB league id (Prompt 13 follow-up);
        // squad size by row KEY (27C) — both server maps riding
        // listPriorities, joined onto CONFIG rows that no directory
        // route ever serves.
        // By TSDB id where the row IS a TSDB league; by FOLLOW KEY for
        // the aliased marks (NHL/MLB/the tennis tours — Round 2 item 4).
        const art = pr.competitionArt[String(c.id)] ?? pr.competitionArt[c.key];
        const count = pr.teamCounts[c.key];
        return {
          ...c,
          ...(art ? { crestUrl: art } : {}),
          ...(count !== undefined ? { teamCount: count } : {}),
        };
      });
      setLeagues(rows);
      // These rows are CONFIG rather than a served list, so they were
      // the one browse surface hydration never reached — which meant an
      // imagery takedown could not reach a stored boxing/NBA/NFL
      // competition follow at all.
      hydrateFollowArt(rows);
      return;
    }
    // Soccer is the one directory-served sport, and its statics
    // (Copa Libertadores) are competitions the directory does not
    // carry — MERGED as ordinary rows, never a replacement. The
    // statics-only early return above swallowing the directory is
    // exactly how 19 leagues once vanished behind one row
    // (2026-08-17, owner-caught).
    const withStatics = (rows: DirectoryLeague[]): DirectoryLeague[] => {
      const statics = (sport?.staticCompetitions ?? []).filter(
        (c) => !rows.some((l) => l.key === c.key),
      );
      return [...rows, ...statics];
    };
    // Cached-first (Round 2 perf ruling): the last served directory
    // paints immediately; the fetch refreshes it behind. A refresh
    // failure over a painted cache stays quiet — the rows on screen
    // are real; the error surfaces only when there is nothing to show.
    const cached = cachedLeagues();
    if (cached) setLeagues(withStatics(cached));
    void (async () => {
      const r = await fetchLeagues();
      if (r.ok) {
        const merged = withStatics(r.value);
        setLeagues(merged);
        // Fresh directory rows are also the only chance to repair a
        // stored follow's artwork: the follow store captures a crest
        // once and never revisits it (domain/followArt.ts).
        hydrateFollowArt(merged);
      } else if (!cached) setError(messageOf(r.error));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport, artVersion]);

  // Tournament rows (Prompt 9): the competitions people actually want —
  // Wimbledon, not "ATP Tour". Joint ATP+WTA events arrive merged under
  // one key; a fetch failure keeps the tour rows working and says so.
  useEffect(() => {
    if (!sport?.tournamentBrowse) return;
    const cached = cachedTournaments();
    if (cached) setTournaments(cached);
    void (async () => {
      const r = await fetchTournaments();
      if (r.ok) setTournaments(r.value);
      else if (!cached) setError(messageOf(r.error));
    })();
  }, [sport]);

  // The search field's TEAM half (27C): the same federated search the
  // Search screen runs, filtered to THIS sport. Competitions filter
  // locally below; a sport with no team browse never makes the call.
  useEffect(() => {
    const q = queryText.trim();
    if (q.length < 2 || !hasTeamSearch) {
      requestSeq.current++; // invalidate any in-flight search
      setTeamHits([]);
      setSearching(false);
      setSearchError(null);
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
          const hits = r.value.teams.filter(
            (h) => h.sportKey === route.params.sportKey,
          );
          setTeamHits(hits);
          hydrateFollowArt(hits);
          setSearchError(null);
        } else {
          // A failed team search must not read as "no teams" — the
          // competitions half keeps working, the failure says so.
          setTeamHits([]);
          setSearchError(messageOf(r.error));
        }
      })();
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [queryText, hasTeamSearch, route.params.sportKey]);

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
    // Round 6 item 7: a row may follow under another identity (F1 inside
    // Motorsport follows as the f1 series).
    const followAs = staticFollowAsFor(route.params.sportKey, league.key);
    const item = {
      key: league.key,
      label: league.followLabel ?? league.name,
      sportKey: followAs?.sportKey ?? route.params.sportKey,
      type: followAs?.type ?? (isSeries ? ('series' as const) : ('competition' as const)),
      ...(league.pollPath ? { pollPath: league.pollPath } : {}),
      // The card one line below already renders this logo; not putting it
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

  // A team hit's follow carries exactly what the Search screen's would —
  // same source, same shape (SearchScreen::teamRows).
  const toggleTeamHit = useCallback(
    async (hit: SearchTeamHit) => {
      const brandColour = colourFromKitText(hit.colours);
      const item = {
        key: hit.key,
        label: hit.name,
        sportKey: hit.sportKey,
        type: 'team' as const,
        ...(hit.crestUrl ? { crestUrl: hit.crestUrl } : {}),
        ...(hit.pollPath ? { pollPath: hit.pollPath } : {}),
        ...(brandColour ? { brandColour } : {}),
      };
      setBusyKey(hit.key);
      const wasFollow = !isFollowed(hit.key);
      const r = wasFollow ? await follow(item) : await unfollow(item);
      if (!r.ok && r.error.kind !== 'sync-in-progress') {
        setError(messageOf(r.error));
      } else {
        setError(null);
        followFeedback(r, item, wasFollow, () =>
          navigation.navigate('CalendarPriming'),
        );
      }
      setBusyKey((k) => (k === hit.key ? null : k));
      forceRender((n) => n + 1);
    },
    [navigation],
  );

  const q = queryText.trim();
  // The query, plus every alias it triggers (searchAliases) — "epl"
  // style typing reaches the same rows here as on the Search screen.
  const needles = useMemo(
    () => (q.length >= 2 ? expandQuery(q) : []),
    [q],
  );

  const visibleLeagues = useMemo(() => {
    if (!leagues) return null;
    if (needles.length === 0) return leagues;
    return leagues.filter((l) =>
      needles.some((n) => anyFoldedIncludes([l.name, l.country], n)),
    );
  }, [leagues, needles]);

  if (error && !leagues) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <Text style={[type.body, { color: t.danger }]}>{error}</Text>
      </View>
    );
  }
  if (!leagues || !visibleLeagues) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={t.primary} />
      </View>
    );
  }

  // ONE CARD PER COMPETITION (Stage 6, plus the owner's Fixtures
  // ruling). Teams decide the tap: a team league expands to
  // [Fixtures-word | Teams]; a competition without teams opens its
  // content directly — a tennis tour its tournament list, everything
  // else its fixtures page — exactly as a team card does.
  const tourOf = (key: string): 'atp' | 'wta' | null =>
    route.params.sportKey !== 'tennis'
      ? null
      : key === 'tennis-atp'
        ? 'atp'
        : key === 'tennis-wta'
          ? 'wta'
          : null;

  // THE SUBTITLE ADVERTISES THE TAP (Round 2 ruling) — on cards whose
  // tap does something beyond opening a page: team leagues say what
  // expansion offers ("England · Tap to follow teams (20) · fixtures",
  // the trailing word per-sport), tournament-bearing tours say theirs.
  // Non-expandable rows keep their plain facts.
  const captionFor = (item: DirectoryLeague, tour: 'atp' | 'wta' | null): string => {
    if (tour) {
      const n = tournamentsFor(tournaments, tour, 'all').length;
      return n > 0
        ? i18n.t('follows.league.tapTournamentsCount', { count: n })
        : i18n.t('follows.league.tapTournaments');
    }
    if (!item.followOnly) {
      const word = fixturesWordFor(route.params.sportKey).toLowerCase();
      return item.teamCount !== undefined
        ? i18n.t('follows.league.tapTeamsCount', {
            country: item.country,
            count: item.teamCount,
            fixtures: word,
          })
        : i18n.t('follows.league.tapTeams', {
            country: item.country,
            fixtures: word,
          });
    }
    return subtitleOf(item);
  };

  const leagueCard = (item: DirectoryLeague) => {
    const tour = tourOf(item.key);
    // The badge's extracted pair — by TSDB id for TSDB rows, by FOLLOW
    // key for the aliased marks (Round 3 burst ruling).
    const artColours = cachedPriorities().competitionArtColours;
    const burstColours = artColours[String(item.id)] ?? artColours[item.key];
    // The prepared tile fill, same dual keying (Round 6 tile prep).
    const artFills = cachedPriorities().competitionArtTileFills;
    const tileFill = artFills[String(item.id)] ?? artFills[item.key];
    return (
      <CompetitionCard
        expanded={openKey === item.key}
        onExpandedChange={(v) => setOpenKey(v ? item.key : null)}
        // Exonym where the active language genuinely has one (Phase C)
        // — browse rows only; follows, search matching and fixtures
        // keep the provider/config name.
        name={competitionDisplayName(item.name, item.key)}
        caption={captionFor(item, tour)}
        {...(burstColours ? { burstColours } : {})}
        theme={teamTheme(sport?.accent ?? null, mode)}
        monogram={monogramOf(item.name)}
        {...(item.crestUrl ? { crestUrl: item.crestUrl } : {})}
        {...(tileFill ? { tileFill } : {})}
        glyph={sport?.glyph ?? '🏟️'}
        fixturesWord={fixturesWordFor(route.params.sportKey)}
        onOpen={
          tour
            ? () =>
                navigation.navigate('TournamentList', {
                  tour,
                  kind: 'all',
                  title: i18n.t('follows.tournaments.navTitle', {
                    tour: tour.toUpperCase(),
                  }),
                })
            : () => openEntity(item.key, item.name, item.crestUrl, item.pollPath)
        }
        {...(!item.followOnly
          ? {
              onTeams: () =>
                navigation.navigate('TeamList', {
                  sportKey: route.params.sportKey,
                  leagueId: item.id,
                  leagueName: item.name,
                  ...(item.teamPollPath ? { teamPollPath: item.teamPollPath } : {}),
                }),
            }
          : {})}
        following={isFollowed(item.key)}
        onFollow={() => void toggle(item)}
        busy={busyKey === item.key}
      />
    );
  };

  // A tennis tournament as a card: no sub-levels, so tapping it opens
  // its matches directly; its caption is its dates.
  const tournamentCard = (row: TournamentRow) => (
    <CompetitionCard
      name={row.name}
      expanded={openKey === row.key}
      onExpandedChange={(v) => setOpenKey(v ? row.key : null)}
      caption={tournamentDateRange(row.startUtc, row.endUtc)}
      theme={teamTheme(sport?.accent ?? null, mode)}
      monogram={monogramOf(row.name)}
      {...(cachedPriorities().competitionArt[row.key]
        ? { crestUrl: cachedPriorities().competitionArt[row.key] }
        : {})}
      {...(cachedPriorities().competitionArtTileFills[row.key]
        ? { tileFill: cachedPriorities().competitionArtTileFills[row.key] }
        : {})}
      {...(cachedPriorities().competitionArtColours[row.key]
        ? { burstColours: cachedPriorities().competitionArtColours[row.key] }
        : {})}
      glyph={sport?.glyph ?? '🎾'}
      onOpen={() =>
        navigation.navigate('Team', {
          teamKey: row.key,
          name: row.name,
          sportKey: route.params.sportKey,
          followType: 'competition',
        })
      }
      following={isFollowed(row.key)}
      onFollow={() =>
        void toggle({ id: row.key, name: row.name, country: '', key: row.key, followOnly: true })
      }
      busy={busyKey === row.key}
    />
  );

  const teamHitRow = (hit: SearchTeamHit) => (
    <TileRow
      key={hit.key}
      right={
        <FollowButton
          theme={teamTheme(
            colourFromKitText(hit.colours) ?? sport?.accent ?? null,
            mode,
          )}
          {...(hit.burstColours ? { burstColours: hit.burstColours } : {})}
          following={isFollowed(hit.key)}
          subject={hit.name}
          busy={busyKey === hit.key}
          onPress={() => void toggleTeamHit(hit)}
        />
      }
    >
      <SportCard
        fullWidth
        label={hit.name}
        caption={hit.league}
        glyph={sport?.glyph ?? '🏟️'}
        theme={teamTheme(
          colourFromKitText(hit.colours) ?? sport?.accent ?? null,
          mode,
        )}
        monogram={monogramOf(hit.name)}
        {...(hit.crestUrl ? { imageUrl: hit.crestUrl } : {})}
        accessibilityLabel={i18n.t('follows.card.a11yViewFixtures', {
          name: hit.name,
        })}
        onPress={() =>
          navigation.navigate('Team', {
            teamKey: hit.key,
            name: hit.name,
            sportKey: hit.sportKey,
            ...(hit.pollPath ? { pollPath: hit.pollPath } : {}),
            ...(hit.crestUrl ? { crestUrl: hit.crestUrl } : {}),
            ...(hit.colours ? { colours: hit.colours } : {}),
          })
        }
      />
    </TileRow>
  );

  const searchField = (
    <TextInput
      accessibilityLabel={
        hasTeamSearch
          ? i18n.t('follows.league.searchCompsTeams')
          : i18n.t('follows.league.searchComps')
      }
      placeholder={
        hasTeamSearch
          ? i18n.t('follows.league.searchCompsTeams')
          : i18n.t('follows.league.searchComps')
      }
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
  );

  // The sport's own name above its cards — the mockup's section header,
  // in the user's regional vocabulary (a UK screen says FOOTBALL). The
  // nav title is the level ("Competitions"); this is the group.
  const sportHeader = sport ? (
    <Text
      accessibilityRole="header"
      style={[
        type.caption,
        styles.sportHeading,
        { color: t.textSecondary },
      ]}
    >
      {sportLabelFor(sport.key, sport.label, activeRegion()).toUpperCase()}
    </Text>
  ) : null;

  // The sport's coverage note, read from the string catalog
  // (domain/coverageNotes.ts) — the config field itself is no longer
  // read by this screen.
  const coverageNote = sport ? coverageNoteFor(sport.key) : undefined;

  const banners = (
    <>
      {error ? (
        <Text style={[type.secondary, { color: t.danger, padding: spacing.l }]}>
          {error}
        </Text>
      ) : null}
      {searchError ? (
        <Text style={[type.secondary, { color: t.danger, paddingHorizontal: spacing.l }]}>
          {searchError}
        </Text>
      ) : null}
    </>
  );

  // TENNIS IS THREE THINGS (Prompt 19): ATP, WTA, and the majors, which
  // belong to neither tour. Searching flattens that to the things a
  // query can actually name — tour cards and tournament cards.
  const tennisRows: BrowseRow[] | null =
    route.params.sportKey === 'tennis' && leagues
      ? tennisBrowseRows(leagues, tournaments)
      : null;

  if (tennisRows) {
    if (needles.length > 0) {
      // Tour rows render as the same card searched or browsed — the
      // subtitle says what the tour IS rather than "World".
      const tourCards = visibleLeagues.map((l) => ({
        ...l,
        country: i18n.t('follows.league.everyEventOnTour'),
      }));
      const tournamentCards = tournaments.filter((row) =>
        needles.some((n) => anyFoldedIncludes([row.name], n)),
      );
      return (
        <View style={{ flex: 1, backgroundColor: t.bg }}>
          {searchField}
          {banners}
          <FlatList
            data={[
              ...tourCards.map((l) => ({ kind: 'tour' as const, l })),
              ...tournamentCards.map((row) => ({ kind: 'tournament' as const, row })),
            ]}
            keyExtractor={(r) => (r.kind === 'tour' ? r.l.key : r.row.key)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) =>
              item.kind === 'tour'
                ? leagueCard(item.l)
                : tournamentCard(item.row)
            }
            ListEmptyComponent={
              <Text style={[type.secondary, styles.noMatches, { color: t.textSecondary }]}>
                {i18n.t('follows.league.noMatches', { query: q })}
              </Text>
            }
          />
        </View>
      );
    }
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {searchField}
        {banners}
        <FlatList
          data={tennisRows}
          keyExtractor={(r) => r.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => renderTennisRow(item)}
        />
      </View>
    );
  }

  function renderTennisRow(r: BrowseRow) {
    // The four majors' keys, for the row-level Follow all. Derived from
    // the served tournaments so a slam we do not hold is never claimed.
    const slamKeys = tournaments
      .filter((x) => SLAM_KEYS.includes(x.key))
      .map((x) => x.key);
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
          <TileRow>
            <SportCard
              fullWidth
              rowHeight={COMPETITION_ROW_HEIGHT}
              label={r.title}
              caption={peopleCaption(
                i18n.t('follows.athletes.players').toLowerCase(),
                cachedAthleteCount(route.params.sportKey, { tour: r.tour }),
              )}
              glyph={sport?.glyph ?? '🎾'}
              theme={teamTheme(sport?.accent ?? null, mode)}
              accessibilityLabel={i18n.t(
                'follows.athletes.a11yBrowseTourPlayers',
                { tour: r.tour.toUpperCase() },
              )}
              onPress={() =>
                navigation.navigate('AthleteList', {
                  sportKey: route.params.sportKey,
                  tour: r.tour,
                })
              }
            />
          </TileRow>
        );
      case 'competition': {
        // The tour row is a competition like any other now — a card,
        // with no Teams to browse and "Tournaments" as its contents.
        // Built from the REAL static row so the follow carries its
        // pollPath, exactly as following the same tour from Search
        // does — the browse row used to be the one surface that
        // dropped it.
        const full = leagues?.find((l) => l.key === r.key);
        const tourRow: DirectoryLeague = {
          id: r.key,
          name: r.name,
          country: i18n.t('follows.league.everyEventOnTour'),
          key: r.key,
          followOnly: true,
          ...(full?.pollPath ? { pollPath: full.pollPath } : {}),
          ...(full?.crestUrl ? { crestUrl: full.crestUrl } : {}),
        };
        return leagueCard(tourRow);
      }
      case 'slams':
      case 'others': {
        const isSlams = r.kind === 'slams';
        const title = isSlams
          ? i18n.t('follows.tennis.allFourMajors')
          : i18n.t('follows.tennis.otherTournaments');
        // ICON SWEEP (Prompt 20): inside a tennis section, Players, the
        // tour row and Other tournaments ALL fell back to the sport
        // glyph, so three different things carried one tennis ball and
        // the tile stopped distinguishing anything. A trophy for the
        // majors, a medal for the rest, the ball reserved for Players —
        // whose row is about people, which is the one thing the sport's
        // own mark reads as here.
        return (
          <TileRow
            right={
              isSlams ? (
                <FollowButton
                  theme={teamTheme(sport?.accent ?? null, mode)}
                  following={slamKeys.every((k) => isFollowed(k))}
                  subject={i18n.t('follows.tennis.allFourMajorsSubject')}
                  busy={busyKey === 'slams'}
                  onPress={() => void followAll(slamKeys, 'slams')}
                />
              ) : undefined
            }
          >
            <SportCard
              fullWidth
              label={title}
              caption={i18n.tn('follows.tennis.tournamentCount', r.count)}
              glyph={isSlams ? '\u{1F3C6}' : '\u{1F3C5}'}
              theme={teamTheme(sport?.accent ?? null, mode)}
              accessibilityLabel={i18n.t('follows.card.a11ySummary', {
                name: title,
                caption: r.tour.toUpperCase(),
              })}
              onPress={() =>
                navigation.navigate('TournamentList', {
                  tour: r.tour,
                  kind: isSlams ? 'slams' : 'others',
                  title,
                })
              }
            />
          </TileRow>
        );
      }
    }
  }

  // Boxing at rest (B7 FINAL SHAPE, owner 2026-08-30 — the standing
  // design): TWO sections in tennis's exact treatment — "BOXING —
  // MEN'S" and "BOXING — WOMEN'S" small-caps headers, each with its
  // own coverage line and three standard rows: Fighters · Major fight
  // cards · Premier Boxing Champions. Row labels are UNSEXED — the
  // section header carries the sex, exactly as tennis's Players rows
  // do. The card rows are SEX-SCOPED views and follows (`<base>-m` /
  // `<base>-w`, server-stamped from bout classification; a zero-classed
  // card carries both — deliver, don't drop); their display keeps the
  // base name and badge while the FOLLOW's stored label carries the
  // sex so the Following screen stays tellable. Searching falls
  // through to the generic list.
  if (route.params.sportKey === 'boxing' && needles.length === 0) {
    type BoxRow =
      | { kind: 'header'; sex: 'm' | 'w' }
      | { kind: 'fighters'; sex: 'm' | 'w' }
      | { kind: 'comp'; sex: 'm' | 'w'; item: DirectoryLeague };
    const sexWord = (sex: 'm' | 'w') =>
      i18n.t(sex === 'm' ? 'follows.athletes.mens' : 'follows.athletes.womens');
    const scoped = (base: DirectoryLeague, sex: 'm' | 'w'): DirectoryLeague => ({
      ...base,
      key: `${base.key}-${sex}`,
      followLabel: `${base.name} — ${sexWord(sex)}`,
    });
    const section = (sex: 'm' | 'w'): BoxRow[] => [
      { kind: 'header', sex },
      { kind: 'fighters', sex },
      ...visibleLeagues.map((item) => ({
        kind: 'comp' as const,
        sex,
        item: scoped(item, sex),
      })),
    ];
    const rows: BoxRow[] = [...section('m'), ...section('w')];
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {searchField}
        {banners}
        <FlatList
          data={rows}
          keyExtractor={(r) =>
            r.kind === 'comp' ? r.item.key : `${r.kind}-${r.sex}`
          }
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: row }) => {
            if (row.kind === 'header') {
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
                    {i18n
                      .t(
                        row.sex === 'm'
                          ? 'follows.boxing.sectionMens'
                          : 'follows.boxing.sectionWomens',
                      )
                      .toUpperCase()}
                  </Text>
                  {coverageNote ? <CoverageNote note={coverageNote} /> : null}
                </View>
              );
            }
            if (row.kind === 'fighters') {
              return (
                <TileRow>
                  <SportCard
                    fullWidth
                    rowHeight={COMPETITION_ROW_HEIGHT}
                    label={athleteRowTitle('boxing')}
                    caption={peopleCaption(
                      athleteRowTitle('boxing').toLowerCase(),
                      cachedAthleteCount('boxing', {
                        groupMatches: (k) => boxingGroupSex(k) === row.sex,
                      }),
                    )}
                    glyph={sport?.glyph ?? '🥊'}
                    theme={teamTheme(sport?.accent ?? null, mode)}
                    accessibilityLabel={i18n.t('follows.athletes.a11yBrowse', {
                      athletes: i18n
                        .t(
                          row.sex === 'm'
                            ? 'follows.boxing.mensTitle'
                            : 'follows.boxing.womensTitle',
                        )
                        .toLowerCase(),
                    })}
                    onPress={() =>
                      navigation.navigate('AthleteList', {
                        sportKey: 'boxing',
                        sex: row.sex,
                        title: i18n.t(
                          row.sex === 'm'
                            ? 'follows.boxing.mensTitle'
                            : 'follows.boxing.womensTitle',
                        ),
                      })
                    }
                  />
                </TileRow>
              );
            }
            return leagueCard(row.item);
          }}
        />
      </View>
    );
  }

  // Olympics at rest (Round 3 B6): TWO standard expandable cards —
  // Summer and Winter — each expanding to [Sports | Games], ending the
  // mixed 40-row mishmash. Follow on the card follows that season's
  // NEXT edition (the config's own row, pollPath and all). Searching
  // falls through to the generic list, which still matches every
  // discipline and edition row.
  if (
    route.params.sportKey === 'olympics' &&
    !route.params.olympics &&
    needles.length === 0
  ) {
    const editions = (sport?.staticCompetitions ?? [])
      .filter((c) => OLYMPIC_EDITION_KEY.test(c.key))
      .sort((a, b) => a.key.localeCompare(b.key));
    const seasonCards = (['summer', 'winter'] as const).flatMap((season) => {
      const next = editions.find(
        (e) =>
          olympicSeasonOf(Number(e.key.match(OLYMPIC_EDITION_KEY)![1])) ===
          season,
      );
      if (!next) return [];
      const word =
        season === 'summer'
          ? i18n.t('follows.olympics.summer')
          : i18n.t('follows.olympics.winter');
      return [
        {
          season,
          word,
          next,
          name: i18n.t('follows.olympics.seasonOlympics', { season: word }),
        },
      ];
    });
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {searchField}
        {banners}
        <FlatList
          data={seasonCards}
          keyExtractor={(s) => s.season}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <>
              {sportHeader}
              {coverageNote ? <CoverageNote note={coverageNote} /> : null}
            </>
          }
          renderItem={({ item }) => (
            <CompetitionCard
              name={item.name}
              expanded={openKey === `olympics-${item.season}`}
              onExpandedChange={(v) => setOpenKey(v ? `olympics-${item.season}` : null)}
              caption={i18n.t('follows.olympics.tapForSports', {
                edition: item.next.name,
              })}
              theme={teamTheme(sport?.accent ?? null, mode)}
              monogram={monogramOf(item.name)}
              glyph={sport?.glyph ?? '🏅'}
              onOpen={() =>
                navigation.push('LeagueList', {
                  sportKey: 'olympics',
                  olympics: { season: item.season, view: 'sports' },
                  title: i18n.t('follows.olympics.seasonSports', {
                    season: item.word,
                  }),
                })
              }
              destinations={[
                {
                  label: i18n.t('follows.browse.sports'),
                  onPress: () =>
                    navigation.push('LeagueList', {
                      sportKey: 'olympics',
                      olympics: { season: item.season, view: 'sports' },
                      title: i18n.t('follows.olympics.seasonSports', {
                        season: item.word,
                      }),
                    }),
                },
                {
                  label: i18n.t('follows.olympics.games'),
                  onPress: () =>
                    navigation.push('LeagueList', {
                      sportKey: 'olympics',
                      olympics: { season: item.season, view: 'games' },
                      title: i18n.t('follows.olympics.seasonGames', {
                        season: item.word,
                      }),
                    }),
                },
              ]}
              following={isFollowed(item.next.key)}
              onFollow={() => void toggle(item.next)}
              busy={busyKey === item.next.key}
            />
          )}
        />
      </View>
    );
  }

  const searchActive = needles.length > 0;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {searchField}
      {banners}
      <FlatList
        data={visibleLeagues}
        keyExtractor={(l) => l.key}
        keyboardShouldPersistTaps="handled"
        // Athlete browse rides ABOVE the competition cards for sports
        // that have a directory (Prompt 8): people are what a fan of an
        // individual sport arrives looking for, and the entry point must
        // not hide behind global search. Hidden while a query is active —
        // results are the whole screen then.
        ListHeaderComponent={
          searchActive ? null : (
            <>
              {sportHeader}
              {/* What this sport's data honestly is — one line, opened
                  on demand. */}
              {coverageNote ? <CoverageNote note={coverageNote} /> : null}
              {sport?.browse.includes('athlete') ? (
                <TileRow>
                  <SportCard
                    fullWidth
                    rowHeight={COMPETITION_ROW_HEIGHT}
                    label={athleteRowTitle(route.params.sportKey)}
                    caption={peopleCaption(
                      athleteRowTitle(route.params.sportKey).toLowerCase(),
                      cachedAthleteCount(route.params.sportKey),
                    )}
                    glyph={sport?.glyph ?? '🏟️'}
                    theme={teamTheme(sport?.accent ?? null, mode)}
                    accessibilityLabel={i18n.t('follows.athletes.a11yBrowse', {
                      athletes: athleteRowTitle(route.params.sportKey).toLowerCase(),
                    })}
                    onPress={() =>
                      navigation.navigate('AthleteList', {
                        sportKey: route.params.sportKey,
                      })
                    }
                  />
                </TileRow>
              ) : null}
            </>
          )
        }
        renderItem={({ item }) => leagueCard(item)}
        // The TEAM half of the search (27C): server hits for this sport,
        // below whatever competitions matched.
        ListFooterComponent={
          searchActive ? (
            <>
              {teamHits.map(teamHitRow)}
              {searching ? (
                <View style={styles.empty}>
                  <ActivityIndicator color={t.primary} />
                </View>
              ) : null}
              {!searching &&
              !searchError &&
              visibleLeagues.length === 0 &&
              teamHits.length === 0 ? (
                <Text style={[type.secondary, styles.noMatches, { color: t.textSecondary }]}>
                  {i18n.t('follows.league.noMatches', { query: q })}
                </Text>
              ) : null}
            </>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  search: {
    margin: spacing.l,
    marginBottom: spacing.s,
    paddingHorizontal: spacing.l,
    minHeight: 44,
    borderRadius: radius.button,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
  },
  sportHeading: {
    paddingHorizontal: spacing.l,
    paddingTop: spacing.m,
    paddingBottom: spacing.s,
    fontWeight: '600',
  },
  noMatches: { padding: spacing.xl, textAlign: 'center' },
  empty: { padding: spacing.xl, alignItems: 'center' },
});
