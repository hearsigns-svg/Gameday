// Schedule: what Gameday manages — not an imitation of the user's
// calendar. ONE surface (consolidation brief, Stage 3): the month grid
// above a partition, the full day-grouped list beneath it, in lockstep
// both ways — tapping a day jumps the list, scrolling the list drives
// the grid's highlight and month. The old List/Month toggle is gone.
// Rows carry the per-event opt-out: removed fixtures stay visible,
// greyed, with a restore affordance.
//
// THE LOOP IS GUARDED BY OWNERSHIP, NOT TIMERS. Only a USER scroll may
// drive the grid: a day tap disables scroll-sync before its
// programmatic scroll (so the snap to a following section cannot steal
// the tapped day's highlight), and the next onScrollBeginDrag — which
// only a finger fires — hands the list back. Grid updates never scroll
// the list, so there is no path around the circle in either direction.
//
// PAGED BY DATE (Round 5 ruling 4). The snapshot holds EVERY upcoming
// fixture; the list shows the loaded window — this month and next to
// begin with, one more calendar month per page (domain/schedulePaging).
// Reaching the end loads the next page on its own; a "Show more" footer
// is the reachable fallback, and when nothing more exists there is
// nothing there at all. The GRID always marks the whole set, so a day
// beyond the loaded window loads its pages first, then jumps.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
  ViewToken,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCardExpansion } from '../../../core/cardExpansion';
import { fixtureCardRequest } from '../openFixtureCard';
import { monogramOf,
  CalendarOffBanner,
  DATA_STALE_HOURS,
  EmptyState,
  EventRow,
  lastSyncLine,
  SyncStatusChip,
} from '../../../core/components';
import { calendarConnected } from '../data/calendarConnection';
import { loadExclusions, setExcluded } from '../data/exclusionStore';
// Aliased: `t` is this screen's theme handle (useTheme), so the
// catalog function travels as `tr` here.
import { t as tr } from '../../../core/i18n';
import { TabScreenProps } from '../../../core/navigation';
import { useColorSchemeMode } from '../../../core/useColorSchemeMode';
import { useReduceMotion } from '../../../core/useReduceMotion';
import { teamTheme } from '../../../core/teamTheme';
import { motion, radius, spacing, type, useTheme } from '../../../core/tokens';
import { showToast } from '../../../core/toast';
import { dayHeading, dayKey, isDateOnly, timeLabel } from '../../../core/when';
import {
  dataStaleness,
  refreshDataFreshness,
} from '../../fixtures/data/freshnessRepo';
import { sportByKey } from '../../follows/domain/sportsConfig';
import { olympicGlyphForKeys } from '../../follows/domain/olympicGlyphs';
import { headlineParticipant } from '../../follows/domain/participants';
import {
  competitionTileFillFor,
  followMarkUrl,
  hasServedMark,
  subscribePriorities,
} from '../../follows/data/browsePriority';
import { useAthletePhoto } from '../../follows/useEntityPhoto';
import { identityFollow } from '../../follows/domain/followIdentity';
import { Followable, loadFollowables } from '../../follows/data/followStore';
import {
  lastSync,
  lastSyncError,
  lastSyncErrorKind,
  runSync,
  subscribeSync,
  UpcomingFixture,
  upcomingFixtures,
} from '../syncEngine';
import {
  dayMarks,
  monthOfDay,
  sectionIndexForDay,
} from '../domain/scheduleSync';
import {
  fixturesInWindow,
  loadedWindow,
  localDayEndUtc,
  nextPageAvailable,
  nextPagesLoaded,
  pagesToFirst,
  pagesToReach,
} from '../domain/schedulePaging';
import { MonthGrid } from './MonthGrid';
import { premiumLocked } from '../../../core/entitlementStore';
import { loadLedger } from '../data/ledger';
import { currentFixtures, isLive } from '../../fixtures/domain/horizon';

type Props = TabScreenProps<'Schedule'>;

interface DaySection {
  // The day's grouping key — the same string the grid's cells carry,
  // which is what makes the two-way sync a string comparison.
  key: string;
  title: string;
  data: UpcomingFixture[];
}

function sectionsFrom(fixtures: UpcomingFixture[], nowMs: number = Date.now()): DaySection[] {
  const byDay = new Map<string, { anchorIso: string; dateOnly: boolean; data: UpcomingFixture[] }>();
  const nowIso = new Date(nowMs).toISOString();
  for (const f of fixtures) {
    // A block that has BEGUN sits under today, not under the day it
    // started (P0 2026-09-02) — the section a reader looks at first.
    const live = isLive(f, nowMs);
    const anchorIso = live ? nowIso : f.startUtc;
    const dateOnly = live ? false : isDateOnly(f.status, f.timePrecision);
    const key = dayKey(anchorIso, dateOnly);
    const bucket = byDay.get(key);
    if (bucket) bucket.data.push(f);
    else byDay.set(key, { anchorIso, dateOnly, data: [f] });
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { anchorIso, dateOnly, data }]) => ({
      key,
      title: dayHeading(anchorIso, dateOnly),
      data,
    }));
}

const todayKey = () => dayKey(new Date().toISOString());

// The last-sync sentence is a toast now, not chrome (Round 4): it says
// its piece ONCE per app session, the first time Schedule is opened,
// then vanishes. Module state, so a remount within the session cannot
// repeat it — only relaunching the app resets it.
let syncToastShownThisSession = false;

// List tuning for a window that can hold a couple of hundred rows. A
// row is ~72pt, so a dozen fills a phone screen at first paint; the next
// page loads while the end is still half a viewport away — before the
// footer can be seen, in ordinary scrolling.
const INITIAL_ROWS = 12;
const END_REACHED_VIEWPORTS = 0.5;

export default function ScheduleScreen({ navigation }: Props) {
  const t = useTheme();
  const mode = useColorSchemeMode();
  const reduceMotion = useReduceMotion();
  const [fixtures, setFixtures] = useState<UpcomingFixture[]>(upcomingFixtures);
  // Round 5 lock badges: a Free install under an entitled gate sees a
  // lock on every fixture NOT already in the calendar — the ledger is
  // the truth of "placed". Re-read on every fixture refresh.
  const locked = premiumLocked();
  const placedIds = useMemo(
    () => (locked ? new Set(Object.keys(loadLedger())) : new Set<string>()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locked, fixtures],
  );
  const [follows, setFollows] = useState<Followable[]>(loadFollowables);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(loadExclusions);
  // How many month pages the list holds (≥ 1). Only ever grows while
  // the screen is up; the tab-press entry state takes it back to one.
  const [pagesLoaded, setPagesLoaded] = useState(1);
  // Entry state: today highlighted, current month shown. The list opens
  // at its top, which IS the nearest upcoming section.
  const [selectedDay, setSelectedDay] = useState<string>(todayKey);
  const [shownMonth, setShownMonth] = useState(() => monthOfDay(todayKey()));
  // The partition's two states. `openness` is the animated truth the
  // grid's height rides on (1 split, 0 full-screen list); `split` is
  // the settled state the handle's semantics read.
  const [split, setSplit] = useState(true);
  const [gridH, setGridH] = useState<number | null>(null);
  const openness = useRef(new Animated.Value(1)).current;
  const opennessValue = useRef(1);
  const gridHRef = useRef(0);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState(lastSync);
  const [syncError, setSyncError] = useState<string | null>(lastSyncError);
  const [syncErrorKind, setSyncErrorKind] = useState(lastSyncErrorKind);
  const [dataStaleHours, setDataStaleHours] = useState<number | null>(null);

  const listRef = useRef<SectionList<UpcomingFixture, DaySection>>(null);
  // Scroll-sync ownership (see the header note): false until the user
  // actually drags the list.
  const syncFromScroll = useRef(false);
  // A far jump can overshoot the render window; keep the target so the
  // failure handler can close in on it, boundedly.
  const pendingJump = useRef<{ sectionIndex: number; tries: number } | null>(null);
  // A day tap that first had to load pages: the day to land on once the
  // list holds them (see jumpToDay).
  const pendingDayJump = useRef<string | null>(null);
  const sectionsRef = useRef<DaySection[]>([]);
  const selectedDayRef = useRef(selectedDay);
  const shownMonthRef = useRef(shownMonth);
  useEffect(() => {
    selectedDayRef.current = selectedDay;
  }, [selectedDay]);
  useEffect(() => {
    shownMonthRef.current = shownMonth;
  }, [shownMonth]);
  useEffect(() => {
    const id = openness.addListener(({ value }) => {
      opennessValue.current = value;
    });
    return () => openness.removeListener(id);
  }, [openness]);

  // Data age is the SOURCE's, not the device's: refresh the freshness
  // summary the sweep maintains, then judge the followed sources by it.
  // Failure leaves it null — unknown renders as nothing claimed, never
  // as green.
  useEffect(() => {
    void (async () => {
      await refreshDataFreshness();
      const s = dataStaleness(loadFollowables());
      setDataStaleHours(s?.worstHours ?? null);
    })();
  }, [fixtures]);

  useEffect(() => {
    const refresh = () => {
      setFixtures(upcomingFixtures());
      setFollows(loadFollowables());
      setExcludedIds(loadExclusions());
    };
    const unsub = subscribeSync((state) => {
      setRunning(state.running);
      setLast(state.last);
      setSyncError(state.lastError);
      setSyncErrorKind(state.lastErrorKind);
      refresh();
    });
    // Row marks/fills paint from the priorities cache — repaint when a
    // fetch lands (Round 6 follow-up).
    const unsubArt = subscribePriorities(refresh);
    const focus = navigation.addListener('focus', refresh);
    return () => {
      unsub();
      unsubArt();
      focus();
    };
  }, [navigation]);

  // A TAB PRESS LANDS AT THE ENTRY STATE (Round 4 B3), whether the tab
  // is already frontmost or being switched back to: split open, today
  // selected in its month, the list at its top — which IS the nearest
  // upcoming section — holding its first page only.
  useEffect(
    () =>
      navigation.addListener('tabPress', () => {
        const today = todayKey();
        settleRef.current(true);
        setSelectedDay(today);
        selectedDayRef.current = today;
        const m = monthOfDay(today);
        shownMonthRef.current = m;
        setShownMonth(m);
        syncFromScroll.current = false;
        pendingJump.current = null;
        pendingDayJump.current = null;
        setPagesLoaded(1);
        listRef.current
          ?.getScrollResponder()
          ?.scrollTo({ y: 0, animated: !reduceMotion });
      }),
    [navigation, reduceMotion],
  );

  // First focus per app session: say when the calendar was last checked,
  // then get out of the way. A focus listener rather than a mount effect,
  // so the toast can never fire while another tab is frontmost.
  useEffect(
    () =>
      navigation.addListener('focus', () => {
        if (syncToastShownThisSession) return;
        const l = lastSync();
        if (!l) return; // never synced: nothing to tell yet
        syncToastShownThisSession = true;
        showToast({
          message: lastSyncLine(l.at, l.created + l.updated + l.deleted),
        });
      }),
    [navigation],
  );

  // The WHOLE upcoming set, less anything that kicked off over an hour
  // ago — what the grid marks and what the pages are cut from. `nowMs`
  // travels with it so the page windows are cut against the same
  // instant the set was.
  const { ahead, nowMs } = useMemo(() => {
    const now = Date.now();
    return {
      nowMs: now,
      // Not yet FINISHED (P0 2026-09-02): a live multi-day block stays
      // in the list, under today.
      ahead: currentFixtures(fixtures, now),
    };
  }, [fixtures]);
  // The pages actually shown: what has been loaded, floored so the first
  // window always reaches the soonest fixture — an off-season follow
  // opens on its next fixtures, not on two empty months.
  const pages = useMemo(
    () => Math.max(pagesLoaded, pagesToFirst(ahead, nowMs)),
    [ahead, nowMs, pagesLoaded],
  );
  // The loaded window and the rows inside it. Sections are built from
  // the WINDOW only — the set can run to several hundred rows, and the
  // grid never needs them grouped.
  const loadedRange = useMemo(
    () => loadedWindow(nowMs, pages),
    [nowMs, pages],
  );
  const loaded = useMemo(
    () => [
      // Live blocks began before the window opens; they belong to today.
      ...ahead.filter((f) => isLive(f, nowMs)),
      ...fixturesInWindow(
        ahead.filter((f) => !isLive(f, nowMs)),
        loadedRange.fromUtc,
        loadedRange.toUtc,
      ),
    ],
    [ahead, loadedRange, nowMs],
  );
  const hasMore = useMemo(
    () => nextPageAvailable(ahead, loadedRange.toUtc),
    [ahead, loadedRange],
  );
  const sections = useMemo(() => sectionsFrom(loaded, nowMs), [loaded]);
  // Display order across every day heading — what the expanded card
  // pages through, so a swipe follows the list exactly.
  const listIds = useMemo(
    () => sections.flatMap((s) => s.data.map((f) => f.id)),
    [sections],
  );

  // The next page: the month holding the next fixture beyond the
  // window (empty months are skipped, so every load shows a row). A
  // no-op when nothing more exists — the state does not change — and
  // idempotent when the auto-load and the footer fire together.
  const loadMore = () => {
    setPagesLoaded(nextPagesLoaded(ahead, nowMs, pages));
  };

  const countsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of ahead) {
      if (excludedIds.has(f.id)) continue;
      const key = dayKey(f.startUtc, isDateOnly(f.status, f.timePrecision));
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [ahead, excludedIds]);

  // Days where everything has been opted out keep a dimmed mark — the
  // list rows' shown/removed distinction, on the grid.
  const removedOnlyDays = useMemo(() => {
    const marks = dayMarks(
      ahead.map((f) => ({
        id: f.id,
        day: dayKey(f.startUtc, isDateOnly(f.status, f.timePrecision)),
      })),
      excludedIds,
    );
    const days = new Set<string>();
    for (const [day, mark] of marks) if (mark === 'removed') days.add(day);
    return days;
  }, [ahead, excludedIds]);

  // ---- calendar → list -----------------------------------------------

  // The programmatic scroll to a day's section (or the nearest following
  // one), against the sections the list currently holds.
  const scrollToDay = (day: string) => {
    const idx = sectionIndexForDay(
      sectionsRef.current.map((s) => s.key),
      day,
    );
    if (idx === null) return;
    pendingJump.current = { sectionIndex: idx, tries: 0 };
    listRef.current?.scrollToLocation({
      sectionIndex: idx,
      itemIndex: 0, // the section HEADER — the day lands with its heading
      viewPosition: 0,
      animated: !reduceMotion,
    });
  };

  useEffect(() => {
    sectionsRef.current = sections;
    // A tap that had to load pages first lands now that the list holds
    // them (jumpToDay). Nothing pending on an ordinary refresh.
    const day = pendingDayJump.current;
    if (day === null) return;
    pendingDayJump.current = null;
    scrollToDay(day);
  }, [sections]);

  const jumpToDay = (day: string) => {
    setSelectedDay(day);
    selectedDayRef.current = day;
    const m = monthOfDay(day);
    if (
      m.year !== shownMonthRef.current.year ||
      m.month !== shownMonthRef.current.month
    ) {
      shownMonthRef.current = m;
      setShownMonth(m);
    }
    // This scroll is OURS: it must not re-drive the grid, and the snap
    // to a following section must not steal the tapped day's highlight.
    syncFromScroll.current = false;
    // The grid marks the whole set; the list may not hold the tapped
    // day yet. Load the pages up to the instant that LOCAL day ends —
    // its last hours can sit in the next UTC month — and land once the
    // sections have caught up.
    const needed = pagesToReach(nowMs, localDayEndUtc(day));
    if (needed > pages) {
      pendingDayJump.current = day;
      setPagesLoaded(needed);
      return;
    }
    scrollToDay(day);
  };

  // A jump outside the render window: get close by offset, then land
  // precisely once the window has caught up. Bounded — four tries, then
  // wherever the offset scroll got us is where we honestly are.
  const onScrollToIndexFailed = (info: {
    index: number;
    averageItemLength: number;
  }) => {
    const pending = pendingJump.current;
    listRef.current
      ?.getScrollResponder()
      ?.scrollTo({ y: info.averageItemLength * info.index, animated: false });
    if (!pending || pending.tries >= 4) return;
    pendingJump.current = { ...pending, tries: pending.tries + 1 };
    setTimeout(() => {
      const again = pendingJump.current;
      if (!again) return;
      listRef.current?.scrollToLocation({
        sectionIndex: again.sectionIndex,
        itemIndex: 0,
        viewPosition: 0,
        animated: false,
      });
    }, 120);
  };

  // ---- list → calendar -----------------------------------------------

  // Stable pair: RN forbids swapping onViewableItemsChanged mid-life,
  // so the handler reads everything through refs.
  const viewability = useRef([
    {
      viewabilityConfig: { itemVisiblePercentThreshold: 5 },
      onViewableItemsChanged: ({
        viewableItems,
      }: {
        viewableItems: ViewToken[];
      }) => {
        if (!syncFromScroll.current) return;
        const top = viewableItems.find((v) => v.isViewable) ?? viewableItems[0];
        if (!top) return;
        const sec = (top.section ?? top.item) as Partial<DaySection> | undefined;
        const day =
          sec && typeof sec.key === 'string' && Array.isArray(sec.data)
            ? sec.key
            : undefined;
        if (!day) return;
        if (day !== selectedDayRef.current) {
          selectedDayRef.current = day;
          setSelectedDay(day);
        }
        const m = monthOfDay(day);
        if (
          m.year !== shownMonthRef.current.year ||
          m.month !== shownMonthRef.current.month
        ) {
          shownMonthRef.current = m;
          setShownMonth(m);
        }
      },
    },
  ]).current;

  // ---- the partition ---------------------------------------------------

  // The settle lives in a ref because the PanResponder is created once
  // and must not capture a stale reduceMotion or setSplit.
  const settleRef = useRef((toSplit: boolean) => {
    void toSplit;
  });
  settleRef.current = (toSplit: boolean) => {
    setSplit(toSplit);
    Animated.timing(openness, {
      toValue: toSplit ? 1 : 0,
      duration: reduceMotion ? 0 : motion.standard,
      useNativeDriver: false, // height cannot ride the native driver
    }).start();
  };
  const dragStart = useRef(1);
  const pan = useRef(
    PanResponder.create({
      // Claim only real vertical movement, so plain taps fall through
      // to the Pressable underneath.
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6,
      onPanResponderGrant: () => {
        dragStart.current = opennessValue.current;
      },
      onPanResponderMove: (_e, g) => {
        const h = Math.max(gridHRef.current, 1);
        openness.setValue(
          Math.min(1, Math.max(0, dragStart.current + g.dy / h)),
        );
      },
      onPanResponderRelease: (_e, g) => {
        // A flick decides by direction; a slow drag by where it let go.
        const toSplit =
          Math.abs(g.vy) > 0.3 ? g.vy > 0 : opennessValue.current > 0.5;
        settleRef.current(toSplit);
      },
      onPanResponderTerminate: () =>
        settleRef.current(opennessValue.current > 0.5),
    }),
  ).current;

  const toggleExclude = (f: UpcomingFixture) => {
    const was = excludedIds.has(f.id);
    setExcluded(f.id, !was);
    setExcludedIds(loadExclusions());
    showToast(
      was
        ? { message: tr('calendar.toast.restored') }
        : {
            message: tr('calendar.toast.removed'),
            action: {
              label: tr('calendar.toast.undo'),
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

  const changed = last ? last.created + last.updated + last.deleted : 0;
  // Off = not connected THROUGH A WRITE PATH (B4 item 5) — an Android
  // install waiting to connect Google reads as off, whatever its stored
  // choice says, so the banner and the footer tell the truth.
  const calendarOff = !calendarConnected();
  // The chip earns its row only when something is WRONG — a sync error,
  // or sources quiet past the staleness line. The happy state is silence
  // plus the once-per-session toast (Round 4): a standing "up to date"
  // sentence was chrome explaining a non-event.
  const dataStale = dataStaleHours != null && dataStaleHours > DATA_STALE_HOURS;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {syncError || dataStale ? (
        <View style={styles.header}>
          <SyncStatusChip
            running={running}
            lastAt={last?.at ?? null}
            changed={changed}
            error={syncError}
            calendarOff={calendarOff}
            dataStaleHours={dataStaleHours}
            // A denied permission: the OS will not ask again, so the one
            // useful action is Settings (Round 5 ruling 7).
            action={
              syncErrorKind === 'permission-denied'
                ? {
                    label: tr('calendar.priming.openSettings'),
                    onPress: () => void Linking.openSettings(),
                  }
                : null
            }
          />
        </View>
      ) : null}
      {calendarOff && fixtures.length > 0 ? (
        <CalendarOffBanner
          fixtureCount={fixtures.length}
          onEnable={() => navigation.navigate('CalendarPriming')}
        />
      ) : null}
      {ahead.length === 0 ? (
        <EmptyState
          headline={tr('calendar.schedule.emptyHeadline')}
          body={
            follows.length === 0
              ? tr('calendar.schedule.emptyNoFollows')
              : tr('calendar.schedule.emptyWaiting')
          }
        />
      ) : (
        <>
          <Animated.View
            accessibilityElementsHidden={!split}
            importantForAccessibility={split ? 'auto' : 'no-hide-descendants'}
            style={{
              height:
                gridH === null
                  ? undefined
                  : openness.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, gridH],
                      extrapolate: 'clamp',
                    }),
              overflow: 'hidden',
            }}
          >
            {/* Measured ABSOLUTE once the height is known, so the
                grid's own layout can never be constrained by the
                clipping window: a measurement taken mid-collapse (or at
                height 0) would otherwise overwrite gridH and pin the
                restore's output range at zero — the calendar would
                never come back. The h > 0 guard is the same defence for
                any layout pass that still reports a clipped frame. */}
            <View
              style={gridH === null ? undefined : styles.gridInner}
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                if (h > 0 && h !== gridH) {
                  gridHRef.current = h;
                  setGridH(h);
                }
              }}
            >
              <MonthGrid
                year={shownMonth.year}
                month={shownMonth.month}
                onChangeMonth={(delta) =>
                  setShownMonth((m) => {
                    const d = new Date(m.year, m.month + delta, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })
                }
                countsByDay={countsByDay}
                removedOnlyDays={removedOnlyDays}
                selectedDay={selectedDay}
                onSelectDay={jumpToDay}
              />
            </View>
          </Animated.View>
          <View {...pan.panHandlers}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                split
                  ? tr('calendar.schedule.hideCalendar')
                  : tr('calendar.schedule.showCalendar')
              }
              accessibilityState={{ expanded: split }}
              onPress={() => settleRef.current(!split)}
              hitSlop={8}
              style={styles.handleRow}
            >
              <View
                style={[
                  styles.handlePill,
                  { backgroundColor: t.surface, borderColor: t.border },
                ]}
              >
                <Ionicons
                  name={split ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={t.primary}
                />
              </View>
            </Pressable>
          </View>
          <SectionList
            ref={listRef}
            style={{ flex: 1 }}
            sections={sections}
            keyExtractor={(f) => f.id}
            initialNumToRender={INITIAL_ROWS}
            stickySectionHeadersEnabled={false}
            onScrollBeginDrag={() => {
              // Only a finger fires this: the list is the user's again.
              syncFromScroll.current = true;
              pendingJump.current = null;
            }}
            onEndReached={loadMore}
            onEndReachedThreshold={END_REACHED_VIEWPORTS}
            viewabilityConfigCallbackPairs={viewability}
            onScrollToIndexFailed={onScrollToIndexFailed}
            renderSectionHeader={({ section }) => (
              <Text
                accessibilityRole="header"
                style={[
                  type.label,
                  styles.dayHeading,
                  { color: t.textSecondary },
                ]}
              >
                {section.title}
              </Text>
            )}
            // The row is the MODULE-LEVEL component, rendered directly:
            // a wrapper component created inside this render was a new
            // type on every sync tick, so every row unmounted and
            // remounted and its resolved photo was thrown away.
            renderItem={({ item }) => (
              <ScheduleRow
                item={item}
                pagerIds={listIds}
                follows={follows}
                mode={mode}
                excluded={excludedIds.has(item.id)}
                onToggleExcluded={() => toggleExclude(item)}
                locked={locked && !placedIds.has(item.id)}
              />
            )}
            ListFooterComponent={
              <View>
                {/* The reachable way to the next page — the end-reached
                    auto-load usually gets there first. Absent, not
                    disabled, once nothing more exists (rule 10). */}
                {hasMore ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={loadMore}
                    hitSlop={8}
                    style={styles.showMore}
                  >
                    <Text
                      style={[
                        type.secondary,
                        { color: t.primary, fontWeight: '600' },
                      ]}
                    >
                      {tr('calendar.schedule.showMore')}
                    </Text>
                  </Pressable>
                ) : null}
                <Text
                  style={[
                    type.caption,
                    styles.footer,
                    { color: t.textSecondary },
                  ]}
                >
                  {calendarOff
                    ? tr('calendar.schedule.footerOff')
                    : tr('calendar.schedule.footerOn')}
                </Text>
              </View>
            }
          />
        </>
      )}
    </View>
  );
}

// One fixture row. Module level so its identity is stable across
// renders (see the note at the call site).
function ScheduleRow(props: {
  item: UpcomingFixture;
  pagerIds: readonly string[];
  follows: Followable[];
  mode: 'light' | 'dark';
  excluded: boolean;
  onToggleExcluded: () => void;
  locked?: boolean;
}) {
  const { item } = props;
  const sport = sportByKey(item.sport);
  const owner = identityFollow(item.followKeys, props.follows, hasServedMark);
  const photo = useAthletePhoto(
    headlineParticipant(item.title, item.sport),
    item.sport,
  );
  // An Olympic fixture's SPORT emoji is its mark (Round 7 item 5).
  const olympicGlyph = olympicGlyphForKeys(item.followKeys);
  const ref = useRef<View | null>(null);
  const expansion = useCardExpansion();
  return (
    <EventRow
      innerRef={ref}
      hidden={expansion.liftedKey === item.id}
      // A licensed portrait where the fixture names a person, the owning
      // follow's crest otherwise — the row had the crest in hand and
      // rendered a monogram anyway (Prompt 16 C sweep). The crest heals
      // from the served art map when the follow predates its mark.
      imageUrl={photo?.url ?? followMarkUrl(owner)}
      {...(!photo?.url && owner && competitionTileFillFor(owner.key)
        ? { tileFill: competitionTileFillFor(owner.key) as string }
        : {})}
      onPress={() => {
        void fixtureCardRequest(ref, item.id, props.pagerIds).then(
          expansion.open,
        );
      }}
      title={item.title}
      caption={item.competition}
      timeText={timeLabel(item.startUtc, item.status, item.timePrecision)}
      tbc={isDateOnly(item.status, item.timePrecision)}
      glyph={olympicGlyph ?? sport?.glyph ?? '🏟️'}
      {...(olympicGlyph
        ? {}
        : { monogram: monogramOf(owner?.label ?? item.homeTeam ?? item.competition) })}
      theme={teamTheme(owner?.brandColour ?? sport?.accent ?? null, props.mode)}
      excluded={props.excluded}
      onToggleExcluded={props.onToggleExcluded}
      {...(props.locked ? { badge: '🔒', badgeA11y: tr('premium.lockA11y') } : {})}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    flexDirection: 'row',
    alignItems: 'center',
  },
  // The grid, detached from the clipping window's constraints (see the
  // note at the measurement site). Width still comes from the window.
  gridInner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  // The partition: a chevron button on the seam between grid and list —
  // up while the calendar is shown (swipe up / tap gives the list the
  // screen), down while it is hidden. The anonymous dash it replaced
  // read as a divider, not a control (Round 4). Tap toggles; a flick or
  // drag on it does the same by gesture.
  handleRow: {
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handlePill: {
    minWidth: 56,
    height: 24,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayHeading: {
    paddingHorizontal: spacing.l,
    paddingTop: spacing.xl,
    paddingBottom: spacing.s,
  },
  // The next-page control: a text button on the list's own rhythm, a
  // full touch target tall, sitting where the next day heading would.
  showMore: {
    minHeight: 44,
    marginTop: spacing.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    padding: spacing.l,
    paddingBottom: spacing.xxl,
    textAlign: 'center',
  },
});
