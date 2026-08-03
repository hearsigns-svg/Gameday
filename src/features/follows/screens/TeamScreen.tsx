// Team preview: see a team's upcoming fixtures BEFORE committing to a
// follow (owner ruling: never force "follow all" blind). Once followed,
// the same rows grow the per-event remove/restore toggles — so "follow
// Liverpool but skip the matches I don't care about" happens right here.

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { fetchFixturesForFollows } from '../../fixtures/data/fixturesRepo';
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

type Props = RootScreenProps<'Team'>;

// One preview poll per team per session — browsing must not hammer
// rate-limited providers.
const polledThisSession = new Set<string>();

export default function TeamScreen({ navigation, route }: Props) {
  const { teamKey, name, sportKey, pollPath, colours, followType } =
    route.params;
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
  };

  const loadFixtures = useCallback(async () => {
    const stored = loadFollowables().find((f) => f.key === teamKey);
    const keys = stored ? followQueryKeys(stored) : [teamKey];
    const r = await fetchFixturesForFollows(keys);
    if (!mounted.current) return;
    if (r.ok) {
      const upcoming = r.value.fixtures
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
        ? 'Removed from your calendar'
        : `Added ${f.title} to your calendar`,
    });
    void runSync();
  };

  const toggleExclude = (f: Fixture) => {
    const was = excludedIds.has(f.id);
    setExcluded(f.id, !was);
    setExcludedIds(loadExclusions());
    showToast(
      was
        ? { message: 'Restored to your calendar' }
        : {
            message: 'Removed from your calendar',
            action: {
              label: 'Undo',
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
          size={56}
        />
        <View style={{ flex: 1 }}>
          <Text style={[type.title, { color: t.textPrimary }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[type.caption, { color: t.textSecondary }]}>
            {sport?.label ?? sportKey}
            {fixtures ? ` · ${fixtures.length} upcoming` : ''}
          </Text>
        </View>
        <FollowButton
          following={following}
          subject={name}
          busy={busy}
          onPress={() => void toggleFollow()}
        />
      </View>
      {error ? (
        <Text style={[type.secondary, { color: t.danger, padding: spacing.l }]}>
          {error}
        </Text>
      ) : null}
      {scopeOptions.length > 0 ? (
        <View style={[styles.scopeBlock, { borderColor: t.border }]}>
          <Text style={[type.caption, { color: t.textSecondary, fontWeight: '600' }]}>
            CALENDAR EVENTS
          </Text>
          <View style={styles.scopeRow}>
            {scopeOptions.map((o) => {
              const active = (o.scope ?? null) === effectiveScope;
              return (
                <Text
                  key={o.label}
                  onPress={() => void selectScope(o.scope)}
                  accessibilityRole="button"
                  accessibilityLabel={`${o.label}${active ? ', selected' : ''}`}
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
                "No scheduled events. We'll add them when announced — follow now and they'll reach your calendar."
              : 'No upcoming fixtures yet — schedules land here as soon as they are announced.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={fixtures}
          keyExtractor={(f) => f.id}
          ListHeaderComponent={<SectionHeader title="Upcoming" />}
          renderItem={({ item: f }) => (
            <EventRow
              title={f.title}
              caption={`${whenLabel(f.startUtc, isDateOnly(f.status))} · ${f.competition}`}
              timeText={timeLabel(f.startUtc, f.status)}
              tbc={isDateOnly(f.status)}
              glyph={sport?.glyph ?? '🏟️'}
              monogram={monogramOf(f.homeTeam ?? name)}
              theme={theme}
              excluded={following ? excludedIds.has(f.id) : undefined}
              onToggleExcluded={following ? () => toggleExclude(f) : undefined}
              pinned={!following ? pinIds.has(f.id) : undefined}
              onTogglePinned={!following ? () => togglePin(f) : undefined}
            />
          )}
          ListFooterComponent={
            !following && fixtures.length > 0 ? (
              <Text
                style={[type.caption, styles.footer, { color: t.textSecondary }]}
              >
                Tap + to add a single match, or Follow for all of them —
                you can remove individual matches afterwards.
              </Text>
            ) : null
          }
        />
      )}
    </View>
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
