// Team preview: see a team's upcoming fixtures BEFORE committing to a
// follow (owner ruling: never force "follow all" blind). Once followed,
// the same rows grow the per-event remove/restore toggles — so "follow
// Liverpool but skip the matches I don't care about" happens right here.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCardExpansion } from '../../../core/cardExpansion';
import { fixtureCardRequest } from '../../calendar-sync/openFixtureCard';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { monogramOf,
  EventRow,
  FollowButton,
  GlyphTile,
  SectionHeader,
} from '../../../core/components';
import { RootScreenProps } from '../../../core/navigation';
// Namespace import: `t` is this component's theme binding.
import * as i18n from '../../../core/i18n';
import { useColorSchemeMode } from '../../../core/useColorSchemeMode';
import { messageOf } from '../../../core/result';
import { teamTheme } from '../../../core/teamTheme';
import { spacing, type, useTheme } from '../../../core/tokens';
import { showToast } from '../../../core/toast';
import { isDateOnly, timeLabel, whenLabel } from '../../../core/when';
import {
  loadExclusions,
  setExcluded,
} from '../../calendar-sync/data/exclusionStore';
import { pinnedIds, setPinned } from '../../calendar-sync/data/pinStore';
import { runSync, subscribeSync } from '../../calendar-sync/syncEngine';
import {
  competitionMarkFor,
  competitionTileFillFor,
} from '../data/browsePriority';
import { fetchFixturesForFollows } from '../../fixtures/data/fixturesRepo';
import { dedupeSameEvent } from '../../fixtures/domain/sameBout';
import { Fixture } from '../../fixtures/domain/fixture';
import { loadPrefs } from '../../calendar-sync/data/prefsStore';
import { ensurePolled, follow, setScope, unfollow } from '../followActions';
import { followFeedback } from '../followFeedback';
import { isFollowed, loadFollowables, Followable } from '../data/followStore';
import { colourFromKitText } from '../domain/entityColour';
import {
  followQueryKeys,
  FollowScope,
  scopesFor,
} from '../domain/followScopes';
import { sportByKey } from '../domain/sportsConfig';
import {
  CareerStatusFields,
  isRetired,
  retiredEmptyState,
} from '../domain/careerStatus';
import { deliveryGap } from '../domain/athleteDelivery';
import { sportLabelFor } from '../domain/sportTerms';
import { nationLabelOf } from '../../../core/nationality';
import { activeRegion } from '../../../core/regionStore';

type Props = RootScreenProps<'Team'>;

// One preview poll per team per session — browsing must not hammer
// rate-limited providers.
const polledThisSession = new Set<string>();

export default function TeamScreen({ navigation, route }: Props) {
  const {
    teamKey,
    name,
    sportKey,
    pollPath,
    colours,
    followType,
    careerStatus,
    careerEndYear,
    crestUrl: routeCrest,
    countryCode: routeCountry,
    grouping: routeGrouping,
  } = route.params;
  const t = useTheme();
  const mode = useColorSchemeMode();
  const sport = sportByKey(sportKey);
  // `colours` is kit-colour TEXT from browse, but an already-followed
  // entity arrives carrying its resolved hex — passing that through
  // colourFromKitText finds no colour WORD and drops the identity, so
  // the team would look themed on Home and grey here.
  const brandColour = /^#[0-9a-f]{3,8}$/i.test(colours ?? '')
    ? (colours as string)
    : colourFromKitText(colours);
  const theme = teamTheme(brandColour ?? sport?.accent ?? null, mode);
  const [fixtures, setFixtures] = useState<Fixture[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(loadExclusions);
  const [pinIds, setPinIds] = useState<Set<string>>(pinnedIds);
  const [, forceRender] = useState(0);
  const mounted = useRef(true);

  // Recorded retirement reaches this screen two ways and needs both:
  // browse and search pass it as route params, while the Following rail
  // and Home navigate with none of it — so an already-followed athlete
  // falls back to what was captured on the stored follow. Route params
  // win: they came from the directory this session, the stored copy may
  // be months old. Absent from both = unknown, and the page says
  // nothing.
  //
  // RESOLVED ONCE, NOT PER RENDER (review round). Reading the follow
  // store inline made a FACT ABOUT A PERSON depend on whether you
  // currently follow them: tapping Unfollow dropped the stored record,
  // the next render found nothing, and the empty state flipped from
  // "Retired in 2022" back to "We'll add them when announced" —
  // re-making the promise this stage exists to stop making, in the one
  // moment the user is looking straight at it. The memo's deps are the
  // athlete's identity, so follow/unfollow (which repaints via
  // forceRender) cannot disturb it. Both fields come from the SAME
  // side of the fallback, so a year can never be attributed to the
  // wrong person's marker.
  // The crest for THIS entity, captured when it was followed (Prompt
  // 13). Browse reaches this screen with route params and no crest, so
  // an unfollowed team shows its generated treatment until it is
  // followed — honest, and it never blocks on a directory read.
  // Route params win — they came from a directory read this session,
  // while the stored copy may be months old (and may be absent
  // entirely, for follows made before crests existed).
  const storedFollowCrest = useMemo(
    () =>
      routeCrest ??
      loadFollowables().find((f) => f.key === teamKey)?.crestUrl ??
      // The served art map, last: a competition followed before its
      // mark was imported has no stored crest and (from the rails) no
      // route param either — the map is what the server already shows
      // everywhere else (Round 5 item 1).
      competitionMarkFor(teamKey),
    [teamKey, routeCrest],
  );

  // Same fallback for nationality: the Following rail and the Home rail
  // navigate with no directory data of their own, so an athlete opened
  // from there would lose the one identity mark they have.
  const nationality = useMemo(
    () =>
      routeCountry ??
      loadFollowables().find((f) => f.key === teamKey)?.countryCode,
    [teamKey, routeCountry],
  );

  // Which population this athlete browses under — resolved the same way,
  // and for the same reason: reached from the Following rail there are no
  // route params, and what the page can honestly PROMISE must not depend
  // on which door the user came through.
  const grouping = useMemo(
    () =>
      routeGrouping ??
      loadFollowables().find((f) => f.key === teamKey)?.grouping,
    [teamKey, routeGrouping],
  );

  const career: CareerStatusFields = useMemo(() => {
    const stored = loadFollowables().find((f) => f.key === teamKey);
    const src =
      careerStatus !== undefined
        ? { careerStatus, careerEndYear }
        : {
            careerStatus: stored?.careerStatus,
            careerEndYear: stored?.careerEndYear,
          };
    return {
      ...(src.careerStatus ? { careerStatus: src.careerStatus } : {}),
      ...(src.careerStatus && src.careerEndYear !== undefined
        ? { careerEndYear: src.careerEndYear }
        : {}),
    };
  }, [teamKey, careerStatus, careerEndYear]);

  const item: Followable = {
    key: teamKey,
    label: name,
    sportKey,
    // Browse only ever reaches this screen with a team; the Following
    // rail can arrive with a competition or series, and unfollow →
    // re-follow from here must not rewrite what it is.
    type: followType ?? 'team',
    ...(pollPath ? { pollPath } : {}),
    ...(brandColour ? { brandColour } : {}),
    ...(nationality ? { countryCode: nationality } : {}),
    // PRESERVE THE CREST. `setFollowed` writes this object WHOLE, so an
    // unfollow→re-follow here (or the toast's Undo) used to replace a
    // crested follow with a crest-less one — the artwork was destroyed
    // by the act of undoing something.
    ...(storedFollowCrest ? { crestUrl: storedFollowCrest } : {}),
    ...career,
  };

  const loadFixtures = useCallback(async () => {
    const stored = loadFollowables().find((f) => f.key === teamKey);
    const keys = stored ? followQueryKeys(stored) : [teamKey];
    const r = await fetchFixturesForFollows(keys);
    if (!mounted.current) return;
    if (r.ok) {
      // ONE REAL EVENT, ONE ROW — the same rule the calendar planner and
      // the Home snapshot already apply (F28, Prompt 14). This screen
      // rendered the raw fetch, so a fighter followed across two
      // providers listed his fight twice ("Boxing · Time TBC" beside
      // "Premier Boxing Champions · 23:00") while the Following rail
      // one tap away said "1 upcoming" and the calendar held exactly
      // one event. Same data, two paths, and only this one skipped the
      // dedupe. `wantedKeys` is this page's own key set, so a pinned
      // or unrelated twin cannot drag an unwanted slice in.
      const upcoming = dedupeSameEvent(
        r.value.fixtures,
        pinnedIds(),
        new Set(keys),
      )
        .filter((f) => new Date(f.startUtc).getTime() > Date.now() - 3_600_000)
        .sort((a, b) => a.startUtc.localeCompare(b.startUtc));
      setFixtures(upcoming);
    } else if (fixtures === null) {
      setError(messageOf(r.error));
    }
  }, [teamKey]);

  useEffect(() => {
    mounted.current = true;
    void loadFixtures();
    // Preview poll: the cache may only hold this team's fixtures from
    // OTHER follows (e.g. just the derby). One poll fills the season,
    // exactly as following would — then re-read.
    if (!polledThisSession.has(teamKey) && !isFollowed(teamKey)) {
      polledThisSession.add(teamKey);
      void ensurePolled(item).then(() => void loadFixtures());
    }
    const unsub = subscribeSync(() => {
      setExcludedIds(loadExclusions());
      setPinIds(pinnedIds());
      forceRender((n) => n + 1);
    });
    return () => {
      mounted.current = false;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamKey]);

  const following = isFollowed(teamKey);

  // Per-follow granularity (Prompt 11): only rendered once followed —
  // scope is a property of the follow, and the options only exist for
  // sports whose providers give us the finer unit honestly. Derived
  // from the STORE every render (never cached in state): an unfollow →
  // re-follow on this same mount drops the scope with the follow, and
  // the selector must say so rather than remember a dead choice
  // (review round).
  const scopeOptions = following ? scopesFor({ ...item, key: teamKey }) : [];
  const storedScope =
    loadFollowables().find((f) => f.key === teamKey)?.scope ?? null;
  // F1 has no null option: the global preference is the default, and
  // the selected chip reflects the EFFECTIVE value until overridden.
  const globalDefault: FollowScope | null =
    item.type === 'series'
      ? loadPrefs().seriesSessions === 'race-only'
        ? 'race-only'
        : 'all-sessions'
      : null;
  const effectiveScope: FollowScope | null = storedScope ?? globalDefault;

  const selectScope = async (next: FollowScope | null) => {
    // Tapping the chip that equals the global default CLEARS a stored
    // override — the follow goes back to tracking the preference —
    // and is a no-op only when there is nothing to clear.
    const target = next === globalDefault && next !== null ? null : next;
    if (target === storedScope) return;
    const r = await setScope(teamKey, target);
    if (!r.ok && r.error.kind !== 'sync-in-progress') {
      setError(messageOf(r.error));
    }
    await loadFixtures();
    forceRender((n) => n + 1);
  };

  const toggleFollow = async () => {
    setBusy(true);
    const wasFollow = !following;
    const r = wasFollow ? await follow(item) : await unfollow(item);
    if (!r.ok && r.error.kind !== 'sync-in-progress') {
      setError(messageOf(r.error));
    } else {
      setError(null);
      followFeedback(r, item, wasFollow, () =>
        navigation.navigate('CalendarPriming'),
      );
    }
    setBusy(false);
    forceRender((n) => n + 1);
  };

  // Opt-in for a single fixture — no follow, no flood.
  const togglePin = (f: Fixture) => {
    const was = pinIds.has(f.id);
    setPinned(
      {
        id: f.id,
        title: f.title,
        startUtc: f.startUtc,
        competition: f.competition,
        sport: f.sport,
        followKey: f.competitionId,
        ...(pollPath ? { pollPath } : {}),
        at: new Date().toISOString(),
      },
      !was,
    );
    setPinIds(pinnedIds());
    showToast({
      message: was
        ? i18n.t('follows.team.removed')
        : i18n.t('follows.team.added', { title: f.title }),
    });
    void runSync();
  };

  const toggleExclude = (f: Fixture) => {
    const was = excludedIds.has(f.id);
    setExcluded(f.id, !was);
    setExcludedIds(loadExclusions());
    showToast(
      was
        ? { message: i18n.t('follows.team.restored') }
        : {
            message: i18n.t('follows.team.removed'),
            action: {
              label: i18n.t('follows.undo'),
              onPress: () => {
                setExcluded(f.id, false);
                setExcludedIds(loadExclusions());
                void runSync();
              },
            },
          },
    );
    void runSync();
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={[styles.header, { borderColor: t.border }]}>
        <GlyphTile
          glyph={sport?.glyph ?? '🏟️'}
          theme={theme}
          monogram={monogramOf(name)}
          {...(storedFollowCrest ? { imageUrl: storedFollowCrest } : {})}
          size={56}
        />
        <View style={{ flex: 1 }}>
          <Text style={[type.title, { color: t.textPrimary }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[type.caption, { color: t.textSecondary }]}>
            {[
              // Nationality first for an athlete (Prompt 16 B): with no
              // likeness allowed and a photo available for a minority,
              // the flag is what tells two fighters apart.
              nationLabelOf(nationality),
              sport
                ? sportLabelFor(sport.key, sport.label, activeRegion())
                : sportKey,
              fixtures ? i18n.tn('follows.team.upcoming', fixtures.length) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        {/* No follow for a retired athlete (owner ruling 2026-08-04) —
            the page's empty state says "Retired in 2022" and offers
            nothing to wait for. An existing follow keeps its control so
            it can still be removed. */}
        {!isRetired(career) || following ? (
          <FollowButton
            theme={theme}
            following={following}
            subject={name}
            busy={busy}
            onPress={() => void toggleFollow()}
          />
        ) : null}
      </View>
      {error ? (
        <Text style={[type.secondary, { color: t.danger, padding: spacing.l }]}>
          {error}
        </Text>
      ) : null}
      {scopeOptions.length > 0 ? (
        <View style={[styles.scopeBlock, { borderColor: t.border }]}>
          <Text style={[type.caption, { color: t.textSecondary, fontWeight: '600' }]}>
            {i18n.t('follows.team.calendarEvents')}
          </Text>
          <View style={styles.scopeRow}>
            {scopeOptions.map((o) => {
              const active = (o.scope ?? null) === effectiveScope;
              return (
                <Text
                  key={o.label}
                  onPress={() => void selectScope(o.scope)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    active
                      ? i18n.t('follows.team.a11ySelected', { label: o.label })
                      : o.label
                  }
                  style={[
                    type.body,
                    styles.scopeChoice,
                    active
                      ? { color: t.primary, fontWeight: '600', borderColor: t.primary }
                      : { color: t.textSecondary, borderColor: t.border },
                  ]}
                >
                  {o.label}
                </Text>
              );
            })}
          </View>
          {scopeOptions.find((o) => (o.scope ?? null) === effectiveScope)?.note ? (
            <Text style={[type.caption, { color: t.textSecondary }]}>
              {scopeOptions.find((o) => (o.scope ?? null) === effectiveScope)!.note}
            </Text>
          ) : null}
        </View>
      ) : null}
      {fixtures === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={t.primary} />
        </View>
      ) : fixtures.length === 0 ? (
        <View style={styles.center}>
          <Text
            style={[type.body, { color: t.textSecondary, textAlign: 'center' }]}
          >
            {item.type === 'athlete'
              ? // The honest empty state IS the feature (Prompt 8): an
                // athlete with nothing announced is still followable, and
                // the follow is exactly how the user finds out first.
                // Unless they have RETIRED — then "we'll add them when
                // announced" is a promise nobody can keep, and saying so
                // is the whole point (Prompt 12).
                // And unless we have no source for their matches AT ALL
                // — men's tennis — where the same promise is just as
                // empty (domain/athleteDelivery.ts).
                (retiredEmptyState(career) ??
                deliveryGap(sportKey, grouping) ??
                i18n.t('follows.team.athleteEmpty'))
              : i18n.t('follows.team.teamEmpty')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={fixtures}
          keyExtractor={(f) => f.id}
          ListHeaderComponent={
            <SectionHeader title={i18n.t('follows.team.upcomingHeader')} />
          }
          renderItem={({ item: f }) => (
            <TeamFixtureRow
              fixture={f}
              pagerIds={fixtures.map((x) => x.id)}
              name={name}
              glyph={sport?.glyph ?? '🏟️'}
              theme={theme}
              // On a competition's own page every row shares the page's
              // competition — the header already names it, so the caption
              // keeps just the date (27C). A team or athlete page spans
              // competitions, where the name is the only thing
              // distinguishing rows.
              competitionInCaption={
                followType !== 'competition' && followType !== 'series'
              }
              {...(storedFollowCrest ? { crestUrl: storedFollowCrest } : {})}
              {...(competitionTileFillFor(teamKey)
                ? { tileFill: competitionTileFillFor(teamKey) as string }
                : {})}
              {...(following
                ? {
                    excluded: excludedIds.has(f.id),
                    onToggleExcluded: () => toggleExclude(f),
                  }
                : { pinned: pinIds.has(f.id), onTogglePinned: () => togglePin(f) })}
            />
          )}
          ListFooterComponent={
            !following && fixtures.length > 0 ? (
              <Text
                style={[type.caption, styles.footer, { color: t.textSecondary }]}
              >
                {i18n.t('follows.team.footer')}
              </Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

// A fixture row on an entity's page. Its own component so it can measure
// itself: tapping it grows the card from exactly this row.
function TeamFixtureRow(props: {
  fixture: Fixture;
  pagerIds: readonly string[];
  name: string;
  glyph: string;
  theme: ReturnType<typeof teamTheme>;
  competitionInCaption: boolean;
  crestUrl?: string;
  tileFill?: string; // per-mark tile fill (Round 6 tile prep)
  excluded?: boolean;
  onToggleExcluded?: () => void;
  pinned?: boolean;
  onTogglePinned?: () => void;
}) {
  const f = props.fixture;
  const ref = useRef<View | null>(null);
  const expansion = useCardExpansion();
  const when = whenLabel(f.startUtc, isDateOnly(f.status, f.timePrecision));
  return (
    <EventRow
      innerRef={ref}
      hidden={expansion.liftedKey === f.id}
      title={f.title}
      caption={
        props.competitionInCaption
          ? i18n.t('follows.team.whenCompetition', {
              when,
              competition: f.competition,
            })
          : when
      }
      timeText={timeLabel(f.startUtc, f.status, f.timePrecision)}
      tbc={isDateOnly(f.status, f.timePrecision)}
      glyph={props.glyph}
      monogram={monogramOf(f.homeTeam ?? props.name)}
      {...(props.crestUrl ? { imageUrl: props.crestUrl } : {})}
      {...(props.tileFill ? { tileFill: props.tileFill } : {})}
      theme={props.theme}
      onPress={() => {
        void fixtureCardRequest(ref, f.id, props.pagerIds).then(expansion.open);
      }}
      {...(props.excluded !== undefined ? { excluded: props.excluded } : {})}
      {...(props.onToggleExcluded ? { onToggleExcluded: props.onToggleExcluded } : {})}
      {...(props.pinned !== undefined ? { pinned: props.pinned } : {})}
      {...(props.onTogglePinned ? { onTogglePinned: props.onTogglePinned } : {})}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    padding: spacing.l,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  footer: { padding: spacing.l, paddingBottom: spacing.xxl, textAlign: 'center' },
  scopeBlock: {
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    gap: spacing.s,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scopeRow: { flexDirection: 'row', gap: spacing.s, flexWrap: 'wrap' },
  scopeChoice: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs,
    overflow: 'hidden',
  },
});
