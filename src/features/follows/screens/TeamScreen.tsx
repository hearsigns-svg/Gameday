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
import {
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
import { ensurePolled, follow, unfollow } from '../followActions';
import { followFeedback } from '../followFeedback';
import { isFollowed, Followable } from '../data/followStore';
import { colourFromKitText } from '../domain/entityColour';
import { sportByKey } from '../domain/sportsConfig';

type Props = RootScreenProps<'Team'>;

// One preview poll per team per session — browsing must not hammer
// rate-limited providers.
const polledThisSession = new Set<string>();

export default function TeamScreen({ navigation, route }: Props) {
  const { teamKey, name, sportKey, pollPath, crestUrl, colours, followType } =
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
    ...(crestUrl ? { crestUrl } : {}),
    ...(brandColour ? { brandColour } : {}),
  };

  const loadFixtures = useCallback(async () => {
    const r = await fetchFixturesForFollows([teamKey]);
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
          crestUrl={crestUrl}
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
      {fixtures === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={t.primary} />
        </View>
      ) : fixtures.length === 0 ? (
        <View style={styles.center}>
          <Text
            style={[type.body, { color: t.textSecondary, textAlign: 'center' }]}
          >
            No upcoming fixtures yet — schedules land here as soon as they
            are announced.
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
              crestUrl={crestUrl}
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
});
