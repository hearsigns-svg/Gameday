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
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { FollowButton, ListRow, SectionHeader } from '../../../core/components';
import { RootStackParamList } from '../../../core/navigation';
import { messageOf } from '../../../core/result';
import { spacing, type, useTheme } from '../../../core/tokens';
import { subscribeSync } from '../../calendar-sync/syncEngine';
import { follow, unfollow } from '../followActions';
import { followFeedback } from '../followFeedback';
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
}

// "Champion · WBA, WBC" / "#3 · GBR" / "Competes 16 Aug" — the caption
// says why this row is on a curated list.
function captionFor(a: AthleteCard): string {
  const parts: string[] = [];
  if (a.championOf && a.championOf.length > 0) {
    parts.push(`Champion · ${a.championOf.join(', ')}`);
  } else if (a.rank !== undefined) {
    parts.push(`#${a.rank}`);
  }
  if (a.countryCode) parts.push(a.countryCode);
  if (a.nextStartUtc) {
    const d = new Date(a.nextStartUtc);
    if (d.getTime() > Date.now()) {
      parts.push(
        `Competes ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`,
      );
    }
  }
  // A searched athlete with no rank or date still deserves a caption:
  // the grouping says who they are ("WTA Tour", "Heavyweight").
  if (parts.length === 0 && a.grouping) parts.push(a.grouping);
  return parts.join(' · ');
}

export default function AthleteListScreen({ navigation, route }: Props) {
  const t = useTheme();
  const sport = sportByKey(route.params.sportKey);
  const [browse, setBrowse] = useState<AthleteSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AthleteCard[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
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
      if (r.value.competingSoon.length > 0) {
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
      : (browse ?? []);

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
          renderItem={({ item: a }) => (
            <ListRow
              title={a.name}
              caption={captionFor(a)}
              accessibilityLabel={`${a.name}, open athlete page`}
              onPress={() =>
                navigation.navigate('Team', {
                  teamKey: a.key,
                  name: a.name,
                  sportKey: a.sportKey,
                  followType: 'athlete',
                })
              }
              right={
                <FollowButton
                  following={isFollowed(a.key)}
                  subject={a.name}
                  busy={busyKey === a.key}
                  onPress={() => void toggle(a)}
                />
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
});
