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
import {
  CoverageNote,
  FollowButton,
  monogramOf,
  SectionHeader,
  SportCard,
  TileRow,
} from '../../../core/components';
import { RootStackParamList } from '../../../core/navigation';
// Namespace import: `t` is this component's theme binding.
import * as i18n from '../../../core/i18n';
import { boxingCardSex, boxingGroupSex, inSexView } from '../domain/boxingBrowse';
import { coverageNoteFor } from '../domain/coverageNotes';
import { sportLabelFor } from '../domain/sportTerms';
import { activeRegion } from '../../../core/regionStore';
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
import { Followable, hydrateFollowArt, isFollowed } from '../data/followStore';
import { sportByKey } from '../domain/sportsConfig';

type Props = NativeStackScreenProps<RootStackParamList, 'AthleteList'>;

const DEBOUNCE_MS = 350;

interface AthleteSection {
  title: string;
  data: AthleteCard[];
  // Rows in the FULL group, before the collapsed preview slice. Present
  // only on browse sections; search results are never collapsed.
  fullCount?: number;
  // The fighter-level sex split (Round 3 B7): set on the FIRST section
  // of a block, rendered as a standing header above the group's own
  // title. Grouped only where the signal exists — the IBF-derived
  // class keys — and never guessed: unclassed fighters live in
  // "Competing soon", which stays unsplit by construction.
  blockTitle?: string;
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
    parts.push(
      i18n.t('follows.athletes.champion', { orgs: a.championOf.join(', ') }),
    );
  } else if (a.rank !== undefined) {
    parts.push(i18n.t('follows.athletes.rank', { rank: a.rank }));
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
        i18n.t('follows.athletes.competes', {
          date: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
        }),
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
  // What this user's region calls the sport — the same string the tile
  // they arrived from was showing.
  const sportName = sport
    ? sportLabelFor(sport.key, sport.label, activeRegion())
    : '';
  // The sport's coverage note, read from the string catalog
  // (domain/coverageNotes.ts) — the config field itself is no longer
  // read by this screen.
  const coverageNote = sport ? coverageNoteFor(sport.key) : undefined;
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
      // Athletes followed before their nationality was captured get it
      // here — the same repair the crest work needed, for the same
      // reason: a follow is a snapshot and nothing else revisits it.
      hydrateFollowArt(
        [...r.value.groups.flatMap((g) => g.athletes), ...r.value.competingSoon]
          .filter((a) => a.countryCode)
          .map((a) => ({ key: a.key, countryCode: a.countryCode as string })),
      );
      const sections: AthleteSection[] = [];
      // TENNIS IS TWO SECTIONS: women, men (owner ruling 2026-08-04).
      // "Competing soon" is redundant there — both groups are already
      // scoped to players who compete, and everyone it surfaced was
      // also in the women's group. Boxing and F1 keep it: their groups
      // are weight classes and a grid, where "who is out this month" is
      // information the sections genuinely do not carry.
      if (
        r.value.competingSoon.length > 0 &&
        route.params.sportKey !== 'tennis' &&
        // A boxing SEX view builds its own filtered Competing soon
        // below — the unfiltered one here would double it.
        !(route.params.sportKey === 'boxing' && route.params.sex)
      ) {
        sections.push({
          title: i18n.t('follows.athletes.competingSoon'),
          data: r.value.competingSoon,
        });
      }
      // A `tour` param narrows to one population (Prompt 19). Tennis
      // browses ATP and WTA as separate SECTIONS now, each with its own
      // Players entry, so arriving from the men's section and being
      // shown the women's list first would undo the split. Matched on
      // the server's own group titles ("ATP Tour — Men", "More ATP
      // players — A–Z", "WTA Tour — Women"), which is where the tour's
      // name lives.
      const tour = route.params.tour;
      const wanted = (title: string): boolean => {
        if (!tour) return true;
        return new RegExp(`\\b${tour}\\b`, 'i').test(title);
      };
      if (route.params.sportKey === 'boxing') {
        // BOXING'S SEX VIEWS (Round 3 B7, mirrored structure
        // reinstated 2026-08-30). The weight-class groups are sexed by
        // their KEYS (boxing-w-* vs boxing-*; boxingBrowse.ts).
        //
        // With a `sex` param (arrived from the Men's/Women's browse
        // sections) the screen IS that sex's fighter list: only its
        // class groups, no block headers (the screen title says it),
        // and Competing soon filtered by the card-label convention —
        // an UNCLASSED fighter rides in BOTH views, which claims
        // nothing (never guessed).
        //
        // Without one (search, deep links) the combined list keeps the
        // standing Men's/Women's block headers.
        const view = route.params.sex;
        if (view) {
          const soon = r.value.competingSoon.filter((a) =>
            inSexView(view, boxingCardSex(a.grouping)),
          );
          if (soon.length > 0) {
            sections.push({
              title: i18n.t('follows.athletes.competingSoon'),
              data: soon,
            });
          }
          for (const g of r.value.groups) {
            if (boxingGroupSex(g.groupingKey) === view) {
              sections.push({ title: g.grouping, data: g.athletes });
            }
          }
          setBrowse(sections);
          return;
        }
        const men = r.value.groups.filter(
          (g) => boxingGroupSex(g.groupingKey) === 'm',
        );
        const women = r.value.groups.filter(
          (g) => boxingGroupSex(g.groupingKey) === 'w',
        );
        men.forEach((g, i) =>
          sections.push({
            title: g.grouping,
            data: g.athletes,
            ...(i === 0 ? { blockTitle: i18n.t('follows.athletes.mens') } : {}),
          }),
        );
        women.forEach((g, i) =>
          sections.push({
            title: g.grouping,
            data: g.athletes,
            ...(i === 0 ? { blockTitle: i18n.t('follows.athletes.womens') } : {}),
          }),
        );
        setBrowse(sections);
        return;
      }
      for (const g of r.value.groups) {
        if (wanted(g.grouping)) sections.push({ title: g.grouping, data: g.athletes });
      }
      setBrowse(sections);
    })();
  }, [route.params.sportKey, route.params.tour, route.params.sex]);

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
    // directory read of its own — still reaches an honest page, and so
    // a followed boxer carries the one identity mark they have.
    ...(a.countryCode ? { countryCode: a.countryCode } : {}),
    ...(a.grouping ? { grouping: a.grouping } : {}),
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
      ? [
          {
            title: searching
              ? i18n.t('follows.search.searching')
              : i18n.t('follows.search.results'),
            data: results,
          },
        ]
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
          // The region's word, like every other sport-naming site — the
        // placeholder in a UK user's search box read "Search Soccer
        // athletes" on a screen they had reached from a tile saying
        // Football.
        placeholder={i18n.t('follows.athletes.searchPlaceholder', {
          sport: sportName,
        })}
          placeholderTextColor={t.textSecondary}
          autoCorrect={false}
          accessibilityLabel={i18n.t('follows.athletes.searchPlaceholder', {
            sport: sportName,
          })}
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
      {/* The sport's coverage note. What the athlete groups are and
          are not built from is athlete-browse information, and it
          belongs in the same glance as the group headings. Browse only
          — a search has moved past the question.

          THIS IS TENNIS'S ONLY RENDER SITE. The comment here used to
          say the note also showed on the competitions screen and that
          "no ATP ranking source is approved"; Prompt 19 gave tennis its
          own render path on LeagueListScreen, which returns before the
          note and shows per-tour SECTION_NOTES instead, and Prompt 18
          replaced the men's source outright. Both halves of the old
          comment were stale (22b). */}
      {results === null && coverageNote ? (
        <CoverageNote note={coverageNote} />
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
                : i18n.t('follows.athletes.noneMatch')
              : i18n.t('follows.athletes.noneYet')}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(a) => a.key}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <>
              {section.blockTitle ? (
                <Text
                  accessibilityRole="header"
                  style={[
                    type.title,
                    styles.blockTitle,
                    { color: t.textPrimary },
                  ]}
                >
                  {section.blockTitle}
                </Text>
              ) : null}
              <SectionHeader title={section.title} />
            </>
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
                    ? i18n.t('follows.athletes.a11yShowFewer', {
                        section: section.title,
                      })
                    : i18n.t('follows.athletes.a11yShowAll', {
                        n: full,
                        section: section.title,
                      })
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
                  {isOpen
                    ? i18n.t('follows.athletes.showFewer')
                    : i18n.t('follows.athletes.showAll', { n: full })}
                </Text>
              </Pressable>
            );
          }}
          renderItem={({ item: a }) => {
            // Hoisted so the tile AND the Follow control share one
            // theme — the burst is the athlete's own palette (Round 3).
            const rowTheme = teamTheme(
              (() => {
                const identity = athleteIdentity({
                  sportKey: a.sportKey,
                  ...(a.countryCode ? { countryCode: a.countryCode } : {}),
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
            );
            return (
            <TileRow
              compact
              // DENSITY IS THE RISK HERE, not on any other surface: the
              // ATP directory alone is 500 names. The compact tile keeps
              // the edge and the press that make it obviously openable
              // while giving back most of the height — a 28pt mark, one
              // line of name, tighter padding.
              right={
                followControlFor(a) ? (
                  <FollowButton
                    theme={rowTheme}
                    following={isFollowed(a.key)}
                    subject={a.name}
                    busy={busyKey === a.key}
                    onPress={() => void toggle(a)}
                  />
                ) : null
              }
            >
            <SportCard
              compact
              fullWidth
              label={a.name}
              caption={captionFor(a, results !== null)}
              glyph={sport?.glyph ?? '\u00B7'}
              monogram={monogramOf(a.name)}
              {...(flagEmojiOf(a.countryCode)
                ? { tileBadge: flagEmojiOf(a.countryCode) as string }
                : {})}
              // Division colour where the grouping IS a category (a
              // boxer's weight class); the per-athlete hue otherwise —
              // hoisted above so the Follow burst shares it.
              theme={rowTheme}
              accessibilityLabel={i18n.t('follows.athletes.a11yOpenPage', {
                name: a.name,
              })}
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
                  ...(a.grouping ? { grouping: a.grouping } : {}),
                  ...(a.careerStatus
                    ? { careerStatus: a.careerStatus }
                    : {}),
                  ...(a.careerEndYear !== undefined
                    ? { careerEndYear: a.careerEndYear }
                    : {}),
                })
              }
            />
            </TileRow>
            );
          }}
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
  // The sex-block header (Round 3 B7): a standing title over its run
  // of weight-class sections — weight and spacing, not a caps label.
  blockTitle: {
    paddingHorizontal: spacing.l,
    paddingTop: spacing.xl,
  },
});
