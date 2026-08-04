// The expanded card — what you get when you tap the poster.
//
// NOT A REDESIGN. The same HeroCard renders at the top, with the same
// layers and the same identity; everything below it is the ordinary row
// vocabulary this app already uses. Tapping the card opens more of the
// same thing.
//
// ACTIONS FIRST, FACTS SECOND. The reason to open this is to DO
// something — change a reminder, take one event out of the calendar, add
// a single bout — so those come first. The facts underneath earn their
// place by changing what you do: where it is, what is on the card, and
// why the time says what it says. Deliberately absent: provider names as
// data, internal ids, stats, form, head-to-head. We do not have that
// data and must not imply we do.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  EmptyState,
  EventRow,
  SectionHeader,
  monogramOf,
} from '../../../core/components';
import { RootScreenProps } from '../../../core/navigation';
import { messageOf } from '../../../core/result';
import { teamTheme } from '../../../core/teamTheme';
import { showToast } from '../../../core/toast';
import { radius, spacing, type, useTheme } from '../../../core/tokens';
import { useColorSchemeMode } from '../../../core/useColorSchemeMode';
import { isDateOnly, timeLabel, whenLabel } from '../../../core/when';
import { isPast, timePrecisionOf } from '../../fixtures/domain/horizon';
import { fetchEventCard, fetchFixtureById } from '../../fixtures/data/fixturesRepo';
import {
  refreshSliceFreshness,
  sliceCheckedAt,
} from '../../fixtures/data/freshnessRepo';
import { CardEntry, boutTimingCaption, cardEntries, cardSectionTitle } from '../../fixtures/domain/card';
import { Fixture } from '../../fixtures/domain/fixture';
import {
  explainTiming,
  WILL_UPDATE_NOTE,
} from '../../fixtures/domain/timingExplanation';
import { FixtureHero } from '../../follows/FixtureHero';
import { Followable, loadFollowables } from '../../follows/data/followStore';
import { sportByKey } from '../../follows/domain/sportsConfig';
import { headlineParticipant } from '../../follows/domain/participants';
import { useAthletePhoto } from '../../follows/useEntityPhoto';
import { loadEventSettings } from '../data/eventSettingsStore';
import { setEventReminder } from '../data/eventSettingsStore';
import { isExcluded, setExcluded } from '../data/exclusionStore';
import { isPinned, setPinned } from '../data/pinStore';
import { loadPrefs } from '../data/prefsStore';
import {
  hasReminderOverride,
  reminderMinutesFor,
} from '../domain/eventSettings';
import { REMINDER_OPTIONS } from '../domain/prefs';
import { runSync, subscribeSync, upcomingFixtures } from '../syncEngine';
import { calendarChoice } from '../data/calendarChoice';
import { loadFollowKeys } from '../../follows/data/followStore';

type Props = RootScreenProps<'Fixture'>;

// A fixture as this screen needs it. Two sources feed it: the app's own
// snapshot (instant, offline, capped and follow-filtered) and the
// document itself (anything the snapshot cannot cover). A snapshot
// WRITTEN BY AN EARLIER BUILD carries no competitionId — it is optional
// here for that reason, and every consumer of it is guarded.
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
  homeTeam?: string;
  awayTeam?: string;
  venue?: string;
  venueCity?: string;
}

export default function FixtureScreen({ navigation, route }: Props) {
  const { fixtureId } = route.params;
  const t = useTheme();
  const mode = useColorSchemeMode();
  const [fixture, setFixture] = useState<Displayed | null>(
    () => upcomingFixtures().find((f) => f.id === fixtureId) ?? null,
  );
  // 'gone' and 'unreadable' are different answers and must not look the
  // same: one is a cancellation, the other is a plane on aeroplane mode.
  const [loadState, setLoadState] = useState<'ok' | 'gone' | 'failed'>('ok');
  const [card, setCard] = useState<Fixture[] | null>(null);
  const [parentDoc, setParentDoc] = useState<Fixture | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [, forceRender] = useState(0);
  const repaint = useCallback(() => forceRender((n) => n + 1), []);

  const follows: Followable[] = loadFollowables();
  const prefs = loadPrefs();
  const settings = loadEventSettings();
  const sport = fixture ? sportByKey(fixture.sport) : undefined;

  // The snapshot is capped and follow-filtered, so a bout opened from a
  // card, or an event that has aged past the cap, is not in it. Fall
  // back to the document itself rather than showing an empty screen.
  useEffect(() => {
    let alive = true;
    if (fixture) return;
    void fetchFixtureById(fixtureId).then((r) => {
      if (!alive) return;
      if (r.ok && r.value) setFixture(r.value);
      else if (r.ok) setLoadState('gone');
      else setLoadState('failed'); // offline: say so, and offer a retry
    });
    return () => {
      alive = false;
    };
  }, [fixtureId, fixture, retry]);

  useEffect(() => {
    const unsub = subscribeSync(() => {
      const fresh = upcomingFixtures().find((f) => f.id === fixtureId);
      if (fresh) setFixture(fresh);
      repaint();
    });
    // Per-slice freshness is what lets this screen say when the source
    // was last checked. Hourly-throttled; failure leaves it unknown,
    // and unknown prints nothing.
    void refreshSliceFreshness().then(repaint);
    return unsub;
  }, [fixtureId, repaint]);

  // The card's own bouts / matches. Queried by parent id — a card and
  // its bouts share no follow key, so nothing else fetches them. When
  // the OPEN fixture is itself a bout, its PARENT has to be fetched
  // separately: a parent is not among its own children, so looking for
  // it in the sibling list always failed and the section stayed empty.
  useEffect(() => {
    if (!fixture) return;
    let alive = true;
    const parentId = fixture.parentFixtureId ?? fixture.id;
    void fetchEventCard(parentId).then((r) => {
      if (!alive) return;
      if (r.ok) setCard(r.value);
      else setCardError(messageOf(r.error));
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

  // The card's parent: the open fixture itself, or — when the open
  // fixture is one of the bouts — the document it hangs off.
  const cardParent: Displayed | null = fixture
    ? fixture.parentFixtureId
      ? parentDoc
      : fixture
    : null;

  const entries: CardEntry[] = useMemo(() => {
    if (!card || !cardParent) return [];
    return cardEntries(cardParent, card);
  }, [card, cardParent]);

  if (!fixture) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {loadState === 'gone' ? (
          <EmptyState
            headline="This event has gone"
            body="It is no longer in the fixture list — a cancellation or a schedule change usually explains it."
          />
        ) : loadState === 'failed' ? (
          <EmptyState
            headline="Couldn’t load this event"
            body="You may be offline. Everything already in your calendar is unaffected."
            actionLabel="Try again"
            onAction={() => {
              setLoadState('ok');
              setRetry((n) => n + 1);
            }}
          />
        ) : (
          <View style={styles.loading}>
            <ActivityIndicator color={t.primary} />
          </View>
        )}
      </View>
    );
  }

  // ALL-DAY AS THE PLANNER COMPUTES IT, not as the row styling does.
  // `isDateOnly` reads the STATUS, which is the legacy carrier; the
  // planner reads `timePrecision` first (horizon.ts::timePrecisionOf),
  // and 1,508 future fixtures are date_only while still 'scheduled'.
  // Disagreeing here would promise a reminder the sync then strips.
  const banner =
    timePrecisionOf(fixture) === 'date_only' ||
    fixture.status === 'postponed' ||
    prefs.eventStyle === 'all-day';
  const excluded = isExcluded(fixture.id);
  const pinned = isPinned(fixture.id);
  const effectiveReminder = reminderMinutesFor(
    fixture.id,
    settings,
    prefs,
    banner,
  );
  const overridden = hasReminderOverride(fixture.id, settings);
  const chosen = overridden
    ? settings[fixture.id]?.reminderMinutes ?? null
    : prefs.reminderMinutes;
  const timing = explainTiming(fixture, {
    // No competitionId (a snapshot from before this shipped) means no
    // slice to look up, which means we say nothing about freshness —
    // never a guess, and never "never checked".
    sliceCheckedAt: fixture.competitionId
      ? sliceCheckedAt(fixture.id, fixture.competitionId, fixture.followKeys)
      : null,
  });
  const theme = teamTheme(sport?.accent ?? null, mode);
  // Only these ever have constituent parts stored (appearances.ts): a
  // fight card's bouts, a draw's matches, or a bout's own siblings.
  const couldHaveCard =
    fixture.parentFixtureId !== undefined ||
    ['boxing', 'ufc', 'tennis'].includes(fixture.sport);

  const applyReminder = (minutes: number | null | undefined) => {
    setEventReminder(fixture.id, minutes);
    showToast({
      message:
        minutes === undefined
          ? 'Back to your default reminder'
          : minutes === null
            ? 'No reminder for this event'
            : `Reminder set — ${REMINDER_OPTIONS.find((o) => o.value === minutes)?.label.toLowerCase() ?? `${minutes} minutes before`}`,
    });
    repaint();
    void runSync();
  };

  // Is this event in the calendar because of something you FOLLOW, or
  // because you added it on its own? The two need different undoing, and
  // leaving a pin behind an exclusion would be a contradiction the
  // planner has to resolve every sync.
  const covered = fixture.followKeys.some((k) => loadFollowKeys().includes(k));
  // What the calendar actually holds for this fixture right now.
  const inCalendar = !excluded && (covered || pinned);
  const calendarOff = calendarChoice() !== 'enabled';
  const past = isPast(fixture as never, Date.now());

  const addToCalendar = () => {
    restore();
    showToast({ message: 'Added to your calendar' });
  };

  const restore = () => {
    setExcluded(fixture.id, false);
    if (!covered && fixture.competitionId) {
      setPinned(
        {
          id: fixture.id,
          title: fixture.title,
          startUtc: fixture.startUtc,
          competition: fixture.competition,
          sport: fixture.sport,
          followKey: fixture.competitionId,
          at: new Date().toISOString(),
        },
        true,
      );
    }
    repaint();
    void runSync();
  };

  const toggleExcluded = () => {
    if (excluded) {
      restore();
      showToast({ message: 'Restored to your calendar' });
      return;
    }
    // An exclusion beats a follow AND a pin, so it is the one honest
    // "remove this" — but a pin left underneath it would contradict it,
    // so it goes too.
    setExcluded(fixture.id, true);
    // setPinned deletes by id; the rest of the record is unread on the
    // removal path.
    if (pinned) {
      setPinned(
        {
          id: fixture.id,
          title: fixture.title,
          startUtc: fixture.startUtc,
          competition: fixture.competition,
          sport: fixture.sport,
          followKey: fixture.competitionId ?? '',
          at: new Date().toISOString(),
        },
        false,
      );
    }
    showToast({
      message: 'Removed from your calendar',
      action: { label: 'Undo', onPress: restore },
    });
    repaint();
    void runSync();
  };

  const togglePinned = (f: {
    id: string;
    title: string;
    startUtc: string;
    competition: string;
    sport: string;
    competitionId: string;
  }) => {
    const was = isPinned(f.id);
    setPinned(
      {
        id: f.id,
        title: f.title,
        startUtc: f.startUtc,
        competition: f.competition,
        sport: f.sport,
        // A bout's own slice key: its followKeys never include the
        // parent's, so this is the only key that fetches it back.
        followKey: f.competitionId,
        at: new Date().toISOString(),
      },
      !was,
    );
    showToast({
      message: was
        ? 'Removed from your calendar'
        : `Added ${f.title} to your calendar`,
    });
    repaint();
    void runSync();
  };

  const reminderChip = (
    label: string,
    selected: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}${selected ? ', selected' : ''}`}
      onPress={onPress}
      style={[
        styles.chip,
        selected
          ? { borderColor: t.primary, backgroundColor: t.surfaceRaised }
          : { borderColor: t.border },
      ]}
    >
      <Text
        style={[
          type.secondary,
          {
            color: selected ? t.primary : t.textSecondary,
            fontWeight: selected ? '600' : '400',
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={{ marginTop: spacing.l }}>
        <FixtureHero item={fixture} follows={follows} standalone />
      </View>

      {/* ── ACTIONS ───────────────────────────────────────────────── */}
      {/* A finished fixture's event is frozen by the horizon rule — the
          sync will never touch it again — so a reminder control here
          would be a promise nothing can keep. */}
      {past ? null : (
        <>
      <SectionHeader title="Reminder" />
      <View style={styles.block}>
        <View style={styles.chipRow}>
          {REMINDER_OPTIONS.map((o) =>
            reminderChip(o.label, overridden && chosen === o.value, () =>
              applyReminder(o.value),
            ),
          )}
          {reminderChip('Use my default', !overridden, () =>
            applyReminder(undefined),
          )}
        </View>
        <Text style={[type.caption, { color: t.textSecondary }]}>
          {effectiveReminder === null && banner
            ? // The promise this screen makes, and the bug it fixes: the
              // setting is KEPT while the event is a banner and applied
              // the moment a real time is published — even though that
              // change rebuilds the event.
              'All-day entries carry no alert. Your choice is saved and applied as soon as a start time is published.'
            : overridden
              ? 'Just this event — your other fixtures keep the default.'
              : `Following your default (${REMINDER_OPTIONS.find((o) => o.value === prefs.reminderMinutes)?.label.toLowerCase() ?? 'no reminder'}).`}
        </Text>
      </View>

      <SectionHeader title="Colour" />
      <View style={styles.block}>
        {/* THE ASYMMETRY, STATED. iOS events inherit their calendar's
            colour — EventKit has no per-event colour at all — while
            Android's provider does have one. We offer neither, because
            expo-calendar 57 exposes no per-event colour field on either
            platform, and a control that silently does nothing is worse
            than no control. What we CAN change is the calendar's own
            colour, which is a real setting and lives in Preferences. */}
        <Text style={[type.secondary, { color: t.textPrimary }]}>
          {Platform.OS === 'ios'
            ? 'iOS gives every event its calendar’s colour — single events can’t be coloured on their own.'
            : 'Android can colour a single event, but our calendar layer can’t set one yet — so fixtures take their calendar’s colour.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change the KickOffCal calendar colour"
          onPress={() => navigation.navigate('Preferences')}
          style={[styles.linkButton, { borderColor: t.border }]}
        >
          <Text style={[type.secondary, { color: t.primary, fontWeight: '600' }]}>
            Change calendar colour
          </Text>
        </Pressable>
      </View>
        </>
      )}

      <SectionHeader title="In your calendar" />
      <View style={styles.block}>
        {/* THE CONTROL MATCHES THE STATE. Offering "remove" for an event
            that was never in the calendar — a bout nobody pinned, a
            fixture nobody follows — wrote a permanent exclusion for a
            deletion that could not happen, and left no way to ADD it. */}
        {past ? (
          <Text style={[type.secondary, { color: t.textSecondary }]}>
            This event has finished. Anything already in your calendar stays
            exactly as it is.
          </Text>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                inCalendar
                  ? `Remove ${fixture.title} from your calendar`
                  : `Add ${fixture.title} to your calendar`
              }
              onPress={inCalendar ? toggleExcluded : addToCalendar}
              disabled={!inCalendar && !fixture.competitionId}
              style={[styles.linkButton, { borderColor: t.border }]}
            >
              <Text
                style={[
                  type.secondary,
                  {
                    color: inCalendar ? t.danger : t.primary,
                    fontWeight: '600',
                  },
                ]}
              >
                {inCalendar
                  ? 'Remove from my calendar'
                  : 'Add to my calendar'}
              </Text>
            </Pressable>
            <Text style={[type.caption, { color: t.textSecondary }]}>
              {calendarOff
                ? 'Your calendar isn’t connected yet — this decides what lands there when it is.'
                : inCalendar
                  ? pinned
                    ? 'You added this single event. Removing it does not change what you follow.'
                    : 'Removes just this event. You stay following everything else.'
                  : excluded
                    ? 'You removed this one. Adding it back changes nothing else.'
                    : 'Adds just this event — no need to follow anyone.'}
            </Text>
          </>
        )}
      </View>

      {/* ── FACTS ─────────────────────────────────────────────────── */}
      {timing.headline ? (
        <>
          <SectionHeader title="Why this time" />
          <View style={styles.block}>
            <Text style={[type.secondary, { color: t.textPrimary }]}>
              {timing.headline}
            </Text>
            {timing.attribution ? (
              <Text style={[type.secondary, { color: t.textSecondary }]}>
                {timing.attribution}
              </Text>
            ) : null}
            {/* The sport's standing caveat about its times — "card
                times are the broadcast start, not ringwalks" — belongs
                with the explanation of the time, not in a details list. */}
            {sport?.coverageNote ? (
              <Text style={[type.caption, { color: t.textSecondary }]}>
                {sport.coverageNote}
              </Text>
            ) : null}
            {timing.checked || timing.willUpdate ? (
              <Text style={[type.caption, { color: t.textSecondary }]}>
                {[timing.checked, timing.willUpdate ? WILL_UPDATE_NOTE : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            ) : null}
          </View>
        </>
      ) : null}

      {/* The poster above already carries the competition and the when,
          so repeating them here would be furniture. WHERE is the one
          fact it does not show — and the only one that changes what a
          user does. */}
      {fixture.venue || fixture.venueCity ? (
        <>
          <SectionHeader title="Where" />
          <View style={styles.block}>
            {fixture.venue ? (
              <Detail label="Venue" value={fixture.venue} />
            ) : null}
            {fixture.venueCity && fixture.venueCity !== fixture.venue ? (
              <Detail label="City" value={fixture.venueCity} />
            ) : null}
          </View>
        </>
      ) : null}

      {/* ── THE CARD ──────────────────────────────────────────────── */}
      {entries.length > 0 ? (
        <>
          <SectionHeader title={cardSectionTitle(fixture.sport)} />
          {entries.map((e) => (
            <CardRow
              key={e.id}
              entry={e}
              parent={cardParent}
              sportKey={fixture.sport}
              competition={fixture.competition}
              glyph={sport?.glyph ?? '🏟️'}
              theme={theme}
              onToggle={() =>
                togglePinned({
                  id: e.id,
                  title: e.title,
                  startUtc: e.startUtc,
                  competition: fixture.competition,
                  sport: fixture.sport,
                  competitionId: e.competitionId,
                })
              }
              onOpen={() =>
                navigation.push('Fixture', {
                  fixtureId: e.id,
                  title: e.title,
                })
              }
            />
          ))}
          <Text style={[type.caption, styles.footer, { color: t.textSecondary }]}>
            Tap + to put a single bout in your calendar — you do not have to
            follow anyone.
          </Text>
        </>
      ) : cardError && couldHaveCard ? (
        // A failed read is never an empty card — but only sports that
        // HAVE cards should say so. Offline, a league fixture that never
        // has bouts would otherwise claim something went wrong.
        <Text style={[type.caption, styles.footer, { color: t.textSecondary }]}>
          Couldn’t load the rest of the card just now.
        </Text>
      ) : null}
    </ScrollView>
  );
}

// A bout / match row. Its own component because the participant-photo
// hook may only be called from one — the same reason Schedule's rows
// are a component.
function CardRow(props: {
  entry: CardEntry;
  parent: { id: string; startUtc: string } | null;
  sportKey: string;
  competition: string;
  glyph: string;
  theme: ReturnType<typeof teamTheme>;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { entry } = props;
  const photo = useAthletePhoto(
    headlineParticipant(entry.title, props.sportKey),
    props.sportKey,
  );
  const caption = props.parent ? boutTimingCaption(props.parent, entry) : null;
  // A bout the user already gets through a FOLLOW is not something to
  // "add" — offering + on it would claim it is absent from a calendar
  // it is already in.
  const followed = new Set(loadFollowKeys());
  const covered = entry.followKeys.some((k) => followed.has(k));
  const removed = isExcluded(entry.id);
  return (
    <EventRow
      title={entry.title}
      caption={
        removed
          ? ''
          : (caption ??
            whenLabel(entry.startUtc, isDateOnly(entry.status, entry.timePrecision)))
      }
      timeText={timeLabel(entry.startUtc, entry.status, entry.timePrecision)}
      tbc={isDateOnly(entry.status, entry.timePrecision)}
      glyph={props.glyph}
      monogram={monogramOf(entry.athletes?.[0] ?? entry.title)}
      {...(photo?.url ? { imageUrl: photo.url } : {})}
      theme={props.theme}
      {...(entry.isMain ? { badge: 'Main event' } : {})}
      excluded={removed}
      {...(covered
        ? {}
        : { pinned: isPinned(entry.id), onTogglePinned: props.onToggle })}
      onPress={props.onOpen}
    />
  );
}

function Detail(props: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={styles.detailRow}>
      {/* minWidth, not width: at 130% Dynamic Type a fixed column
          truncates the label it exists to show. */}
      <Text style={[type.caption, { color: t.textSecondary, minWidth: 72 }]}>
        {props.label}
      </Text>
      <Text style={[type.secondary, { color: t.textPrimary, flex: 1 }]}>
        {props.value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    paddingHorizontal: spacing.l,
    gap: spacing.s,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.m,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  linkButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.l,
    borderRadius: radius.button,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.m },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  footer: { padding: spacing.l, textAlign: 'center' },
});
