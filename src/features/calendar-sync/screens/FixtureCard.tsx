// The expanded fixture card.
//
// It is the SAME object the user tapped, grown: one painted surface
// (PosterSurface), the poster's own type block at the top, and
// everything else sitting on that surface in its own tones. No white
// sheet, no caps headings, no system blue or red — those belong to the
// shell, and this is content.
//
// Content is grouped by rhythm and weight rather than by labels:
//   poster ── hairline ── one control row ── the card itself
// The undercard is the substance and gets the room; the controls are one
// line each because that is all they are.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  HERO_MIN_HEIGHT,
  monogramOf,
  PosterFace,
  PosterSurface,
  usableImage,
} from '../../../core/components';
import { teamTheme, TeamTheme } from '../../../core/teamTheme';
import { showToast } from '../../../core/toast';
import { radius, spacing, type } from '../../../core/tokens';
import { useColorSchemeMode } from '../../../core/useColorSchemeMode';
import { isDateOnly, timeLabel } from '../../../core/when';
import {
  fetchEventCard,
  fetchFixtureById,
} from '../../fixtures/data/fixturesRepo';
import {
  refreshSliceFreshness,
  sliceCheckedAt,
} from '../../fixtures/data/freshnessRepo';
import { cardEntries, CardEntry } from '../../fixtures/domain/card';
import { Fixture } from '../../fixtures/domain/fixture';
import { isPast, timePrecisionOf } from '../../fixtures/domain/horizon';
import { shortTimingNote } from '../../fixtures/domain/timingExplanation';
import { identityFollow } from '../../follows/domain/followIdentity';
import { sportByKey } from '../../follows/domain/sportsConfig';
import { loadFollowables, loadFollowKeys } from '../../follows/data/followStore';
import {
  useTournamentVenuePhoto,
  useVenuePhoto,
  useVenuePlacePhoto,
} from '../../follows/useEntityPhoto';
import { calendarCapabilities } from '../data/driver';
import {
  loadEventSettings,
  setEventColour,
  setEventAllDayReminder,
  setEventReminder,
} from '../data/eventSettingsStore';
import { isExcluded, setExcluded } from '../data/exclusionStore';
import { isPinned, setPinned } from '../data/pinStore';
import { loadPrefs } from '../data/prefsStore';
import { hasAllDayReminderOverride, hasReminderOverride } from '../domain/eventSettings';
import { ALL_DAY_REMINDER_OPTIONS, AllDayReminder, REMINDER_OPTIONS } from '../domain/prefs';
import { runSync, subscribeSync, upcomingFixtures } from '../syncEngine';

// What a caller hands the host to fly a card.
export interface FixtureCardPayload {
  fixtureId: string;
  // The ordered set the tapped card belongs to — the carousel's cards,
  // the schedule's visible fixtures. Present, the expanded view PAGES
  // laterally through them (Prompt 26 device pass: "carousel scrolls
  // but when you click into expanded view you cannot laterally scroll,
  // which you should be able to do"). Absent or singular, the card is
  // alone, exactly as before.
  pagerIds?: string[];
}

interface Displayed {
  id: string;
  title: string;
  startUtc: string;
  status: string;
  sport: string;
  competition: string;
  competitionId?: string;
  followKeys: string[];
  durationHours?: number;
  timePrecision?: 'exact' | 'nominal' | 'date_only';
  confidence?: 'confirmed' | 'provisional';
  parentFixtureId?: string;
  athletes?: string[];
  participantCountries?: string[];
  homeTeam?: string;
  awayTeam?: string;
  venue?: string;
  venueCity?: string;
  homeCrestUrl?: string;
  awayCrestUrl?: string;
}

// Durations only. "Use my default" is not a fifth duration — it is a
// different KIND of answer, so it is a separate affordance (the reset
// below), never a sibling chip.
const DURATIONS = REMINDER_OPTIONS;

export function FixtureCardBody(props: {
  payload: FixtureCardPayload;
  close: () => void;
  reveal: Animated.Value;
  onContentHeight: (h: number) => void;
}) {
  const { fixtureId } = props.payload;
  const mode = useColorSchemeMode();
  const [fixture, setFixture] = useState<Displayed | null>(
    () => upcomingFixtures().find((f) => f.id === fixtureId) ?? null,
  );
  const [card, setCard] = useState<Fixture[] | null>(null);
  const [parentDoc, setParentDoc] = useState<Fixture | null>(null);
  const [failed, setFailed] = useState(false);
  const [, forceRender] = useState(0);
  const repaint = useCallback(() => forceRender((n) => n + 1), []);

  const follows = loadFollowables();
  const prefs = loadPrefs();
  const settings = loadEventSettings();
  const sport = fixture ? sportByKey(fixture.sport) : undefined;
  const owner = fixture ? identityFollow(fixture.followKeys, follows) : undefined;
  const theme = teamTheme(owner?.brandColour ?? sport?.accent ?? null, mode);

  useEffect(() => {
    if (fixture) return;
    let alive = true;
    void fetchFixtureById(fixtureId).then((r) => {
      if (!alive) return;
      if (r.ok && r.value) setFixture(r.value);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [fixtureId, fixture]);

  useEffect(() => {
    const unsub = subscribeSync(() => {
      const fresh = upcomingFixtures().find((f) => f.id === fixtureId);
      if (fresh) setFixture(fresh);
      repaint();
    });
    void refreshSliceFreshness().then(repaint);
    return unsub;
  }, [fixtureId, repaint]);

  useEffect(() => {
    if (!fixture) return;
    let alive = true;
    const parentId = fixture.parentFixtureId ?? fixture.id;
    void fetchEventCard(parentId).then((r) => {
      if (alive && r.ok) setCard(r.value);
    });
    if (fixture.parentFixtureId) {
      void fetchFixtureById(fixture.parentFixtureId).then((r) => {
        if (alive && r.ok) setParentDoc(r.value);
      });
    }
    return () => {
      alive = false;
    };
  }, [fixture?.id, fixture?.parentFixtureId]);

  // Photography: the same resolution the collapsed card ran, so the
  // surface it flew from and the surface it becomes carry one image.
  const placeArt = useVenuePlacePhoto(fixture?.venue, fixture?.venueCity);
  const isTennisParent =
    fixture?.sport === 'tennis' &&
    !fixture.venue &&
    !fixture.followKeys.some((k) => k.endsWith('-appearances'));
  const tournamentArt = useTournamentVenuePhoto(
    isTennisParent ? fixture?.title : null,
    fixture?.venueCity,
  );
  const teamArt = useVenuePhoto(
    fixture && !fixture.venue && !isTennisParent
      ? (fixture.homeTeam ?? (owner?.type === 'team' ? owner.label : null))
      : null,
  );
  const art = placeArt ?? tournamentArt ?? teamArt;

  const cardParent: Displayed | null = fixture
    ? fixture.parentFixtureId
      ? parentDoc
      : fixture
    : null;
  const entries: CardEntry[] = useMemo(
    () => (card && cardParent ? cardEntries(cardParent, card) : []),
    [card, cardParent],
  );

  if (!fixture) {
    return (
      <PosterSurface theme={theme} style={StyleSheet.absoluteFill}>
        <View style={styles.centre}>
          {failed ? (
            <Text style={[type.body, { color: theme.onGradient, opacity: 0.8 }]}>
              Couldn’t load this event
            </Text>
          ) : (
            <ActivityIndicator color={theme.onGradient} />
          )}
        </View>
      </PosterSurface>
    );
  }

  const banner =
    timePrecisionOf(fixture) === 'date_only' ||
    fixture.status === 'postponed' ||
    prefs.eventStyle === 'all-day';
  const past = isPast(fixture as never, Date.now());
  const overridden = hasReminderOverride(fixture.id, settings);
  const chosen = overridden
    ? (settings[fixture.id]?.reminderMinutes ?? null)
    : prefs.reminderMinutes;
  const allDayOverridden = hasAllDayReminderOverride(fixture.id, settings);
  const allDayChosen = allDayOverridden
    ? (settings[fixture.id]?.allDayReminder ?? null)
    : prefs.allDayReminder;
  const excluded = isExcluded(fixture.id);
  const pinned = isPinned(fixture.id);
  const covered = fixture.followKeys.some((k) => loadFollowKeys().includes(k));
  const inCalendar = !excluded && (covered || pinned);
  const colourCapable = calendarCapabilities().perEventColour;

  const applyReminder = (minutes: number | null | undefined) => {
    setEventReminder(fixture.id, minutes);
    repaint();
    void runSync();
  };

  const applyAllDayReminder = (r: AllDayReminder | undefined) => {
    setEventAllDayReminder(fixture.id, r);
    repaint();
    void runSync();
  };

  const pinPayload = (
    id: string,
    title: string,
    startUtc: string,
    competitionId: string,
  ) => ({
    id,
    title,
    startUtc,
    competition: fixture.competition,
    sport: fixture.sport,
    followKey: competitionId,
    at: new Date().toISOString(),
  });

  const toggleCalendar = () => {
    if (inCalendar) {
      setExcluded(fixture.id, true);
      if (pinned) {
        setPinned(
          pinPayload(
            fixture.id,
            fixture.title,
            fixture.startUtc,
            fixture.competitionId ?? '',
          ),
          false,
        );
      }
      showToast({
        message: 'Removed from your calendar',
        action: {
          label: 'Undo',
          onPress: () => {
            setExcluded(fixture.id, false);
            repaint();
            void runSync();
          },
        },
      });
    } else {
      setExcluded(fixture.id, false);
      if (!covered && fixture.competitionId) {
        setPinned(
          pinPayload(
            fixture.id,
            fixture.title,
            fixture.startUtc,
            fixture.competitionId,
          ),
          true,
        );
      }
      showToast({ message: 'Added to your calendar' });
    }
    repaint();
    void runSync();
  };

  const toggleBout = (e: CardEntry) => {
    const was = isPinned(e.id);
    setPinned(pinPayload(e.id, e.title, e.startUtc, e.competitionId), !was);
    repaint();
    void runSync();
  };

  const note = shortTimingNote(fixture, {
    sliceCheckedAt: fixture.competitionId
      ? sliceCheckedAt(fixture.id, fixture.competitionId, fixture.followKeys)
      : null,
  });

  const body = {
    opacity: props.reveal,
    transform: [
      {
        translateY: props.reveal.interpolate({
          inputRange: [0, 1],
          outputRange: [10, 0],
        }),
      },
    ],
  };

  return (
    <PosterSurface
      theme={theme}
      style={StyleSheet.absoluteFill}
      {...(sport?.key ? { sportKey: sport.key } : {})}
      monogram={monogramOf(owner?.label ?? fixture.homeTeam ?? fixture.competition)}
      {...(owner?.crestUrl && usableImage(owner.crestUrl)
        ? { crestUrl: owner.crestUrl }
        : {})}
      {...(art?.url ? { photoUrl: art.url } : {})}
      {...(fixture.participantCountries?.length
        ? { participantCountries: fixture.participantCountries }
        : {})}
      {...(fixture.homeCrestUrl ? { homeCrestUrl: fixture.homeCrestUrl } : {})}
      {...(fixture.awayCrestUrl ? { awayCrestUrl: fixture.awayCrestUrl } : {})}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.l }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={(_w, h) => props.onContentHeight(h)}
      >
        {/* The poster block: identical component, identical size, at the
            top of the same object it was before the tap — and tapping it
            again closes the card, because the thing you tapped to open
            it is the thing you expect to tap to shut it. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${fixture.title}. Close`}
          onPress={props.close}
        >
        <PosterFace
          title={fixture.title}
          competition={fixture.competition}
          startUtc={fixture.startUtc}
          status={fixture.status}
          {...(fixture.timePrecision ? { timePrecision: fixture.timePrecision } : {})}
          theme={theme}
          monogram={monogramOf(
            owner?.label ?? fixture.homeTeam ?? fixture.competition,
          )}
          {...(owner?.crestUrl ? { crestUrl: owner.crestUrl } : {})}
          {...(usableImage(fixture.homeCrestUrl) || usableImage(fixture.awayCrestUrl)
            ? { hasCrestPair: true }
            : {})}
          {...(art?.url ? { hasPhoto: true } : {})}
          {...(art
            ? {
                photoCredit: [
                  art.artist ? `Photo: ${art.artist}` : 'Photo: Wikimedia Commons',
                  art.licence,
                ]
                  .filter(Boolean)
                  .join(' · '),
              }
            : {})}
          timingNote={note}
          minHeight={HERO_MIN_HEIGHT}
        />
        </Pressable>

        <Animated.View style={body}>
          {past ? null : (
            <>
              {fixture.status === 'postponed' ? null : banner ? (
                // AN ALL-DAY ENTRY GETS DAY-SHAPED CHOICES, NOT DEAD
                // CHIPS (Prompt 24 A1). This row used to render the
                // minutes set disabled at 0.45 opacity with nothing
                // saying why — on a phone whose follows are mostly
                // date-only fixtures, the feature read as broken. Every
                // chip shown here works; inapplicable options are simply
                // not offered. Postponed events render no row at all:
                // the card already says postponed, and a reminder for an
                // event with no date is not a control, it is a promise
                // nobody can keep.
                <>
                  <Rule theme={theme} />
                  <AllDayReminderRow
                    theme={theme}
                    chosen={allDayChosen}
                    overridden={allDayOverridden}
                    onPick={applyAllDayReminder}
                    onReset={() => applyAllDayReminder(undefined)}
                  />
                </>
              ) : (
                <>
                  <Rule theme={theme} />
                  <ReminderRow
                    theme={theme}
                    chosen={chosen}
                    overridden={overridden}
                    onPick={applyReminder}
                    onReset={() => applyReminder(undefined)}
                  />
                </>
              )}
              {colourCapable ? (
                <>
                  <Rule theme={theme} />
                  <ColourRow
                    theme={theme}
                    chosen={settings[fixture.id]?.colour}
                    onPick={(hex) => {
                      setEventColour(fixture.id, hex);
                      repaint();
                      void runSync();
                    }}
                  />
                </>
              ) : null}
              <Rule theme={theme} />
              {/* THE WORDS ARE THE TARGET (Prompt 24 A2). This was a
                  full-width 52pt pressable row, which put a destructive
                  action exactly where a collapse tap lands — the owner
                  removed real events trying to close the card. The
                  visible outline now IS the boundary of the target,
                  the same contract BoutRow's toggle already keeps. */}
              <View style={styles.row}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    inCalendar
                      ? `Remove ${fixture.title} from your calendar`
                      : `Add ${fixture.title} to your calendar`
                  }
                  onPress={toggleCalendar}
                  style={({ pressed }) => [
                    styles.calendarToggle,
                    { borderColor: theme.onGradient },
                    pressed ? { opacity: 0.55 } : null,
                  ]}
                >
                  <Text
                    style={[
                      type.secondary,
                      {
                        fontWeight: '600',
                        color: theme.onGradient,
                        opacity: inCalendar ? 0.9 : 1,
                      },
                    ]}
                  >
                    {inCalendar ? 'Remove from calendar' : 'Add to calendar'}
                  </Text>
                </Pressable>
              </View>
            </>
          )}

          {entries.length > 0 ? (
            <>
              <Rule theme={theme} />
              <View style={{ height: spacing.s }} />
              {entries.map((e) => (
                <BoutRow
                  key={e.id}
                  entry={e}
                  theme={theme}
                  sportKey={fixture.sport}
                  onToggle={() => toggleBout(e)}
                />
              ))}
            </>
          ) : null}
        </Animated.View>
      </ScrollView>

      {/* Dismiss: a handle rather than an ✕ in the corner, which would
          sit on top of the countdown the poster already puts there. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={props.close}
        hitSlop={16}
        style={styles.handleHit}
      >
        <View
          style={[styles.handle, { backgroundColor: theme.onGradient }]}
        />
      </Pressable>
    </PosterSurface>
  );
}

function Rule(props: { theme: TeamTheme }) {
  return (
    <View
      style={[
        styles.rule,
        { backgroundColor: props.theme.onGradient, opacity: 0.14 },
      ]}
    />
  );
}

// ONE ROW. Four durations, and — only once a duration has been chosen —
// a reset back to the preference, which is a different kind of answer
// and therefore not a fifth chip.
// One segmented row serves both reminder kinds — the chips differ only
// in what they carry. Every rendered chip is pressable: the caller
// chooses WHICH set applies (minutes on timed events, day-shaped on
// all-day entries) rather than disabling the wrong one in place.
function SegmentedReminderRow<T>(props: {
  theme: TeamTheme;
  options: ReadonlyArray<{ label: string; short: string; value: T }>;
  chosen: T;
  overridden: boolean;
  onPick: (v: T) => void;
  onReset: () => void;
}) {
  const { theme } = props;
  return (
    <View style={styles.row}>
      <Text style={[type.body, { color: theme.onGradient, flex: 1 }]}>
        Reminder
      </Text>
      {/* Horizontal scroll, not wrap: the set has to stay one row (a
          list whose rows change height as you scroll is worse), and a
          chip that falls off a narrow screen must be REACHABLE rather
          than silently cropped — "so I can pick" (Prompt 24 B2). */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.segments}
        style={{ flexGrow: 0 }}
      >
        {props.options.map((o) => {
          const selected = props.chosen === o.value;
          return (
            <Pressable
              key={o.label}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${o.label}${selected ? ', selected' : ''}`}
              onPress={() => props.onPick(o.value)}
              hitSlop={6}
              style={[
                styles.segment,
                selected
                  ? { backgroundColor: theme.onGradient }
                  : { backgroundColor: 'transparent' },
                // Inherited from the preference reads as a ghost; an
                // explicit choice reads as a fill. Two kinds, two forms.
                selected && !props.overridden
                  ? { backgroundColor: 'transparent', borderColor: theme.onGradient }
                  : null,
              ]}
            >
              <Text
                style={[
                  type.caption,
                  {
                    fontWeight: '700',
                    color:
                      selected && props.overridden
                        ? theme.gradient[1]
                        : theme.onGradient,
                    opacity: selected ? 1 : 0.6,
                  },
                ]}
              >
                {o.short}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {props.overridden ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Use my default reminder"
          onPress={props.onReset}
          hitSlop={10}
          style={styles.reset}
        >
          <Text style={[type.caption, { color: theme.onGradient, opacity: 0.6 }]}>
            ↺
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ReminderRow(props: {
  theme: TeamTheme;
  chosen: number | null;
  overridden: boolean;
  onPick: (m: number | null) => void;
  onReset: () => void;
}) {
  return (
    <SegmentedReminderRow
      theme={props.theme}
      options={DURATIONS}
      chosen={props.chosen}
      overridden={props.overridden}
      onPick={props.onPick}
      onReset={props.onReset}
    />
  );
}

function AllDayReminderRow(props: {
  theme: TeamTheme;
  chosen: AllDayReminder;
  overridden: boolean;
  onPick: (r: AllDayReminder) => void;
  onReset: () => void;
}) {
  return (
    <SegmentedReminderRow
      theme={props.theme}
      options={ALL_DAY_REMINDER_OPTIONS}
      chosen={props.chosen}
      overridden={props.overridden}
      onPick={props.onPick}
      onReset={props.onReset}
    />
  );
}

// Rendered only where the calendar layer can actually colour ONE event
// (data/calendarDriver.ts::calendarCapabilities). Nothing about its
// absence is ever explained.
const EVENT_COLOURS = [
  '#C22A2A',
  '#D97706',
  '#0B7A4B',
  '#1463F3',
  '#6D28D9',
  '#111111',
];

function ColourRow(props: {
  theme: TeamTheme;
  chosen?: string;
  onPick: (hex: string | undefined) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={[type.body, { color: props.theme.onGradient, flex: 1 }]}>
        Colour
      </Text>
      <View style={styles.segments}>
        {EVENT_COLOURS.map((hex) => {
          const selected = props.chosen === hex;
          return (
            <Pressable
              key={hex}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Colour ${hex}${selected ? ', selected' : ''}`}
              onPress={() => props.onPick(selected ? undefined : hex)}
              style={[
                styles.swatch,
                { backgroundColor: hex },
                selected ? { borderColor: props.theme.onGradient } : null,
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

// A bout on the card. Its own component so the participant-photo hook is
// legal, and so the row reads as content rather than as a form field.
function BoutRow(props: {
  entry: CardEntry;
  theme: TeamTheme;
  sportKey: string;
  onToggle: () => void;
}) {
  const { entry, theme } = props;
  const followed = new Set(loadFollowKeys());
  const covered = entry.followKeys.some((k) => followed.has(k));
  const on = covered || isPinned(entry.id);
  return (
    <View style={styles.bout}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={[
            type.body,
            { color: theme.onGradient, fontWeight: entry.isMain ? '700' : '500' },
          ]}
          numberOfLines={1}
        >
          {entry.title}
        </Text>
        <Text
          style={[type.caption, { color: theme.onGradient, opacity: 0.55 }]}
          numberOfLines={1}
        >
          {[
            entry.isMain ? 'Main event' : null,
            timeLabel(entry.startUtc, entry.status, entry.timePrecision),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: on, disabled: covered }}
        accessibilityLabel={
          covered
            ? `${entry.title} is already in your calendar`
            : on
              ? `Remove ${entry.title} from your calendar`
              : `Add ${entry.title} to your calendar`
        }
        disabled={covered}
        onPress={props.onToggle}
        hitSlop={8}
        style={[
          styles.boutToggle,
          {
            borderColor: theme.onGradient,
            backgroundColor: on ? theme.onGradient : 'transparent',
            opacity: covered ? 0.45 : 1,
          },
        ]}
      >
        <Text
          style={[
            type.caption,
            {
              fontWeight: '700',
              color: on ? theme.gradient[1] : theme.onGradient,
            },
          ]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.4}
        >
          {/* The word, not the glyph (27C follow-up): same ruling as
              the fixture-row pin. */}
          {on ? 'Added' : 'Add'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  rule: { height: StyleSheet.hairlineWidth, marginHorizontal: spacing.l },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    paddingHorizontal: spacing.l,
  },
  segments: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  segment: {
    minWidth: 44,
    // 40 + the row's padding reaches the 44pt target; 32 undershot it.
    minHeight: 40,
    paddingHorizontal: spacing.s,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  reset: { minWidth: 28, alignItems: 'center' },
  // Self-sized, outlined, 44pt: the visible bounds ARE the tap bounds.
  calendarToggle: {
    minHeight: 44,
    paddingHorizontal: spacing.l,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  bout: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    paddingHorizontal: spacing.l,
  },
  // A pill, not the old 32pt circle — "Added" needs the width, and the
  // minWidth pins both words to one box so the toggle reflows nothing.
  boutToggle: {
    minWidth: 60,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: spacing.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleHit: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: { width: 36, height: 4, borderRadius: 2, opacity: 0.4 },
});
