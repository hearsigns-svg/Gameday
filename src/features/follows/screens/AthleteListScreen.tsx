// Individual-sport athlete browse (Prompt 8). NOT a copy of the teams
// list, because the entity set is different:
//   - SEARCH-FIRST: a name is what a user arrives with, and the search
//     hits the canonical directory — an athlete with no scheduled event
//     is findable and followable. That empty state is the feature.
//   - CURATED ENTRY POINTS so the screen is never empty: champions and
//     rated fighters by weight class, tennis's top 50, the F1 grid.
//   - COMPETING SOON: who has something scheduled in the next weeks.
// Rows follow directly or open the athlete page (the Team route with
// followType 'athlete', whose empty state is honest about "nothing
// announced yet").

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { FollowButton, ListRow, monogramOf, SectionHeader } from '../../../core/components';
import { RootStackParamList } from '../../../core/navigation';
import { messageOf } from '../../../core/result';
import { hueToHex, teamTheme } from '../../../core/teamTheme';
import { useColorSchemeMode } from '../../../core/useColorSchemeMode';
import { spacing, type, useTheme } from '../../../core/tokens';
import { subscribeSync } from '../../calendar-sync/syncEngine';
import { follow, unfollow } from '../followActions';
import { followFeedback } from '../followFeedback';
import { isRetired, retiredCaption } from '../domain/careerStatus';
import { athleteIdentity, nationCaption } from '../domain/athleteIdentity';
import { flagEmojiOf } from '../../../core/nationality';

// Whether a row shows a follow control at all. Retired athletes do not,
// unless the user already follows them — see the ruling in
// domain/careerStatus.ts.
const followControlFor = (a: { key: string } & Parameters<typeof isRetired>[0]) =>
  !isRetired(a) || isFollowed(a.key);
import {
  AthleteCard,
  fetchAthleteBrowse,
  searchEntities,
} from '../data/directoryRepo';
import { Followable, isFollowed } from '../data/followStore';
import { sportByKey } from '../domain/sportsConfig';

type Props = NativeStackScreenProps<RootStackParamList, 'AthleteList'>;

const DEBOUNCE_MS = 350;

interface AthleteSection {
  title: string;
  data: AthleteCard[];
  // Rows in the FULL group, before the collapsed preview slice. Present
  // only on browse sections; search results are never collapsed.
  fullCount?: number;
}

// EVERY group must be discoverable without archaeology (Prompt 11c fix,
// found on the simulator): tennis opened as ~20 "competing soon" women
// + the WTA top 50, which buried the men's group seventy rows deep —
// read by the owner, reasonably, as "there are no men". Long sections
// collapse to a preview with an explicit "Show all N" row, so every
// section HEADER lands within the first couple of screenfuls.
const SECTION_PREVIEW = 6;

// "Champion · WBA, WBC" / "#3 · GBR" / "Competes 16 Aug" — the caption
// says why this row is on a curated list.
function captionFor(a: AthleteCard, showGrouping: boolean): string {
  const parts: string[] = [];
  // Retirement leads. For the ATP directory it is usually the only
  // thing known about a row — those athletes carry no rank, no country
  // and no scheduled event — so without it the caption falls all the
  // way through to the group name and every row reads identically.
  const retired = retiredCaption(a);
  if (retired) parts.push(retired);
  if (a.championOf && a.championOf.length > 0) {
    parts.push(`Champion · ${a.championOf.join(', ')}`);
  } else if (a.rank !== undefined) {
    parts.push(`#${a.rank}`);
  }
  // Nationality leads with its flag (Prompt 16 B) — the athlete
  // equivalent of a crest, and the mark a boxing fan actually reads.
  // The code stays beside it so a font without flag glyphs still says
  // what this row always said.
  const nation = nationCaption(a.countryCode);
  if (nation) parts.push(nation);
  if (a.nextStartUtc) {
    const d = new Date(a.nextStartUtc);
    if (d.getTime() > Date.now()) {
      parts.push(
        `Competes ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`,
      );
    }
  }
  // A SEARCHED athlete with no rank or date still deserves a caption —
  // the grouping says who they are ("Heavyweight", "ATP Tour — Men").
  // In BROWSE the section header two rows up already says it, so
  // repeating it per row is noise: with the A–Z directory group that
  // was 1,374 rows each captioned with their own heading.
  if (showGrouping && parts.length === 0 && a.grouping) parts.push(a.grouping);
  return parts.join(' · ');
}

export default function AthleteListScreen({ navigation, route }: Props) {
  const t = useTheme();
  const mode = useColorSchemeMode();
  const sport = sportByKey(route.params.sportKey);
  const [browse, setBrowse] = useState<AthleteSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AthleteCard[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [, forceRender] = useState(0);
  const requestSeq = useRef(0);

  useEffect(() => subscribeSync(() => forceRender((n) => n + 1)), []);

  useEffect(() => {
    void (async () => {
      const r = await fetchAthleteBrowse(route.params.sportKey);
      if (!r.ok) {
        setError(messageOf(r.error));
        return;
      }
      const sections: AthleteSection[] = [];
      // TENNIS IS TWO SECTIONS: women, men (owner ruling 2026-08-04).
      // "Competing soon" is redundant there — both groups are already
      // scoped to players who compete, and everyone it surfaced was
      // also in the women's group. Boxing and F1 keep it: their groups
      // are weight classes and a grid, where "who is out this month" is
      // information the sections genuinely do not carry.
      if (
        r.value.competingSoon.length > 0 &&
        route.params.sportKey !== 'tennis'
      ) {
        sections.push({ title: 'Competing soon', data: r.value.competingSoon });
      }
      for (const g of r.value.groups) {
        sections.push({ title: g.grouping, data: g.athletes });
      }
      setBrowse(sections);
    })();
  }, [route.params.sportKey]);

  // Search-first: the box feeds the same canonical directory search as
  // global search, filtered to this sport. Stale responses are dropped.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      // Invalidate any in-flight search too: a response landing after
      // the box was cleared must not repaint stale results.
      requestSeq.current++;
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++requestSeq.current;
    const timer = setTimeout(() => {
      void (async () => {
        const r = await searchEntities(q);
        if (seq !== requestSeq.current) return;
        setSearching(false);
        if (!r.ok) {
          setError(messageOf(r.error));
          return;
        }
        setError(null);
        setResults(
          r.value.athletes
            .filter((h) => h.sportKey === route.params.sportKey)
            .map((h) => ({
              key: h.key,
              name: h.name,
              sportKey: h.sportKey,
              ...(h.grouping ? { grouping: h.grouping } : {}),
              ...(h.nextStartUtc ? { nextStartUtc: h.nextStartUtc } : {}),
              ...(h.accentHue !== undefined ? { accentHue: h.accentHue } : {}),
              // The retirement marker MUST survive this hop (review
              // round). This screen's own search box is the only route
              // to the 1,484 ATP men who carry no browse group at all
              // — exactly the population the marker was added for —
              // and dropping it here left three consumers below
              // (caption, navigation params, the stored follow)
              // unreachable for them: code that typechecks and never
              // runs, which is how the dead iOS push import shipped.
              ...(h.careerStatus ? { careerStatus: h.careerStatus } : {}),
              ...(h.careerEndYear !== undefined
                ? { careerEndYear: h.careerEndYear }
                : {}),
            })),
        );
      })();
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, route.params.sportKey]);

  const followableOf = (a: AthleteCard): Followable => ({
    key: a.key,
    label: a.name,
    sportKey: a.sportKey,
    type: 'athlete',
    ...(a.accentHue !== undefined
      ? { brandColour: hueToHex(a.accentHue) }
      : {}),
    // Captured at follow time so the Following rail — which has no
    // directory read of its own — still reaches an honest page.
    ...(a.careerStatus ? { careerStatus: a.careerStatus } : {}),
    ...(a.careerEndYear !== undefined
      ? { careerEndYear: a.careerEndYear }
      : {}),
    // No pollPath, deliberately: athlete follows need no poll route of
    // their own — the catalogue keeps their sources warm, and the
    // appearance carrying this athlete's canonical key reaches the
    // follower through the ordinary query path.
  });

  const toggle = useCallback(
    async (a: AthleteCard) => {
      const item = followableOf(a);
      setBusyKey(a.key);
      const wasFollow = !isFollowed(a.key);
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

  const sections: AthleteSection[] =
    results !== null
      ? [{ title: searching ? 'Searching…' : 'Results', data: results }]
      : (browse ?? []).map((s) =>
          expanded.has(s.title) || s.data.length <= SECTION_PREVIEW
            ? { ...s, fullCount: s.data.length }
            : {
                title: s.title,
                data: s.data.slice(0, SECTION_PREVIEW),
                fullCount: s.data.length,
              },
        );

  // A failed directory read is an ERROR SCREEN, never the empty state:
  // "No athletes here yet" rendered from a 404 is a read failure
  // impersonating an empty result — the standing invariant, client-side.
  if (error && browse === null && results === null) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <Text style={[type.body, { color: t.danger, textAlign: 'center' }]}>
          {error}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ padding: spacing.l, paddingBottom: spacing.s }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={`Search ${sport?.label ?? ''} athletes`}
          placeholderTextColor={t.textSecondary}
          autoCorrect={false}
          accessibilityLabel={`Search ${sport?.label ?? ''} athletes`}
          style={[
            styles.input,
            { borderColor: t.border, color: t.textPrimary, backgroundColor: t.surface },
          ]}
        />
      </View>
      {error ? (
        <Text style={[type.secondary, { color: t.danger, paddingHorizontal: spacing.l }]}>
          {error}
        </Text>
      ) : null}
      {/* The sport's coverage note, shown HERE as well as on the
          competitions screen (Prompt 12). It is the same string and the
          same mechanism — it was simply never visible on the screen it
          describes: what the athlete groups are and are not built from
          is athlete-browse information, and a user reading "Men's world
          No. 1s" deserves to know in the same glance that no ATP
          ranking source is approved. Browse only — a search has moved
          past the question. */}
      {results === null && sport?.coverageNote ? (
        <Text
          style={[
            type.caption,
            {
              color: t.textSecondary,
              paddingHorizontal: spacing.l,
              paddingBottom: spacing.s,
            },
          ]}
        >
          {sport.coverageNote}
        </Text>
      ) : null}
      {browse === null && results === null && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color={t.primary} />
        </View>
      ) : sections.every((s) => s.data.length === 0) ? (
        <View style={styles.center}>
          <Text style={[type.body, { color: t.textSecondary, textAlign: 'center' }]}>
            {results !== null
              ? searching
                ? ' '
                : 'No athletes match that name.'
              : 'No athletes here yet — they arrive as rankings and entries are published.'}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(a) => a.key}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <SectionHeader title={section.title} />
          )}
          renderSectionFooter={({ section }) => {
            const full = section.fullCount ?? section.data.length;
            if (results !== null || full <= SECTION_PREVIEW) return null;
            const isOpen = expanded.has(section.title);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isOpen
                    ? `Show fewer in ${section.title}`
                    : `Show all ${full} in ${section.title}`
                }
                onPress={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (isOpen) next.delete(section.title);
                    else next.add(section.title);
                    return next;
                  })
                }
                style={styles.showAll}
              >
                <Text style={[type.body, { color: t.primary, fontWeight: '600' }]}>
                  {isOpen ? 'Show fewer' : `Show all ${full}`}
                </Text>
              </Pressable>
            );
          }}
          renderItem={({ item: a }) => (
            <ListRow
              title={a.name}
              caption={captionFor(a, results !== null)}
              glyph={sport?.glyph ?? '·'}
              monogram={monogramOf(a.name)}
              {...(flagEmojiOf(a.countryCode)
                ? { tileBadge: flagEmojiOf(a.countryCode) as string }
                : {})}
              tileTheme={teamTheme(
                (() => {
                  // Division colour where the grouping IS a category
                  // (a boxer's weight class); the per-athlete hue
                  // otherwise. Never a raw hex from here — teamTheme
                  // tone-maps it and guarantees the contrast.
                  const identity = athleteIdentity({
                    sportKey: a.sportKey,
                    ...(a.countryCode ? { countryCode: a.countryCode } : {}),
                    // The card carries the division's DISPLAY name
                    // ('Heavyweight'), which is the category itself —
                    // no need for the server to start sending the slug
                    // as well, and no deploy skew to handle.
                    ...(a.grouping ? { groupingKey: a.grouping } : {}),
                    ...(a.accentHue !== undefined
                      ? { accentHue: a.accentHue }
                      : {}),
                  });
                  return identity.hue !== null
                    ? hueToHex(identity.hue)
                    : (sport?.accent ?? null);
                })(),
                mode,
              )}
              accessibilityLabel={`${a.name}, open athlete page`}
              onPress={() =>
                navigation.navigate('Team', {
                  teamKey: a.key,
                  name: a.name,
                  sportKey: a.sportKey,
                  followType: 'athlete',
                  // Hex rides the colours param; TeamScreen's hex
                  // detection turns it into the page theme.
                  ...(a.accentHue !== undefined
                    ? { colours: hueToHex(a.accentHue) }
                    : {}),
                  ...(a.countryCode ? { countryCode: a.countryCode } : {}),
                  ...(a.careerStatus
                    ? { careerStatus: a.careerStatus }
                    : {}),
                  ...(a.careerEndYear !== undefined
                    ? { careerEndYear: a.careerEndYear }
                    : {}),
                })
              }
              // A retired athlete offers NO follow (owner ruling
              // 2026-08-04): a follow is a promise of future events,
              // and there are none coming. An EXISTING follow keeps
              // its control so it can still be undone — hiding that
              // would strand whoever followed them yesterday.
              right={
                followControlFor(a) ? (
                  <FollowButton
                    following={isFollowed(a.key)}
                    subject={a.name}
                    busy={busyKey === a.key}
                    onPress={() => void toggle(a)}
                  />
                ) : null
              }
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.m,
    fontSize: 16,
  },
  showAll: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.l,
  },
});
