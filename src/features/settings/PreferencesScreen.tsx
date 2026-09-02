// Calendar preferences. Changes apply from the next sync; the event-
// style switch flips every scheduled event's kind on that sync.
//
// VISUALLY REDESIGNED (Prompt 27 D, owner ruling: "full redesign"):
// six intent-groups, each a heading over ONE grouped card. Short
// choices (two or three options) render as segmented controls on a
// single row — the current value is always visible without tapping —
// and only genuinely long lists (reminders' four, Region's many) stay
// as rows. The destructive choice sits alone at the end, past a rule.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RootScreenProps } from '../../core/navigation';
import { t as tr, type CatalogKey } from '../../core/i18n';
import { motion, radius, spacing, type, useTheme } from '../../core/tokens';
import { useReduceMotion } from '../../core/useReduceMotion';
import { PAST_RETENTION_DAYS } from '../fixtures/domain/horizon';
import { ALL_DAY_REMINDER_OPTIONS, CalendarPrefs } from '../calendar-sync/domain/prefs';
import { ReminderSlotsRow } from './ReminderSlots';
import { loadPrefs, savePrefs } from '../calendar-sync/data/prefsStore';
import { lastRegistryError } from '../calendar-sync/data/deviceRegistry';
import {
  lastSyncErrorKind,
  runSync,
  subscribeSync,
  syncStalenessHours,
} from '../calendar-sync/syncEngine';
import { dataStaleness } from '../fixtures/data/freshnessRepo';
import { loadFollowables } from '../follows/data/followStore';
import { storedTarget } from '../calendar-sync/data/calendarTargetStore';
import { activeBackend } from '../calendar-sync/data/calendarBackend';
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
} from '../calendar-sync/data/googleCalendarAuth';
import { DataPrivacyRows } from './DataPrivacy';
// The colour verbs come through the FACADE, which routes by backend
// (Round 4 B4 item 3): the provider function answered 'not-ours' under
// REST and toasted "saves when your calendar connects" beside a
// connected calendar.
import {
  calendarColour,
  nativeSyncRoute,
  setCalendarColour,
} from '../calendar-sync/data/driver';
import { restColourState } from '../calendar-sync/data/restCalendarDriver';
import {
  calendarConnection,
  legacyCalendarEventsRemain,
} from '../calendar-sync/data/calendarConnection';
import { premiumLocked } from '../../core/entitlementStore';
import { reminderChoice, setReminderChoice } from '../reminders/data/reminderChoice';
import {
  readNotificationPermission,
  requestNotificationPermission,
} from '../reminders/data/notificationScheduler';
import { requestPaywall } from '../../core/paywall';
import {
  ownsCalendarColour,
  restRowMode,
} from '../calendar-sync/domain/calendarConnection';
import { consequenceForTarget } from '../calendar-sync/domain/calendarTarget';
import { showToast } from '../../core/toast';
import { REGIONS, RegionKey, regionLabel } from '../../core/region';
import {
  detectedRegion,
  regionOverride,
} from '../../core/regionStore';
import {
  AppearanceChoice,
  appearanceChoice,
  setAppearanceChoice,
} from '../../core/appearanceStore';

// Colour choices for the Gameday calendar as it appears in the OS
// calendar app. Named for accessibility; applied live when possible.
// Names are CATALOG KEYS (Round 3 Phase C) — resolved at the use sites
// so the words stay in the typed catalog, not in config.
const CALENDAR_COLOURS: Array<{ nameKey: CatalogKey; hex: string }> = [
  { nameKey: 'settings.colours.kickoffcalBlue', hex: '#1463F3' },
  { nameKey: 'settings.colours.red', hex: '#C81E1E' },
  { nameKey: 'settings.colours.orange', hex: '#EA580C' },
  { nameKey: 'settings.colours.green', hex: '#16A34A' },
  { nameKey: 'settings.colours.teal', hex: '#0D9488' },
  { nameKey: 'settings.colours.purple', hex: '#6D28D9' },
  { nameKey: 'settings.colours.pink', hex: '#DB2777' },
  { nameKey: 'settings.colours.graphite', hex: '#52525B' },
];

// One intent-group: a heading and its card. The heading is now a
// DISCLOSURE (consolidation brief, Stage 2): the whole row toggles the
// card beneath it, so the screen's first paint is its map — five
// titles — rather than every control at once. State lives in the
// screen and dies with it: a fresh entry is always all-collapsed.
function Section(props: {
  title: string;
  open: boolean;
  onToggle: () => void;
  // The section's explanatory caption, folded INTO the disclosure —
  // a collapsed section must not leave its explanation orphaned on
  // the screen.
  footnote?: string;
  children: React.ReactNode;
}) {
  const t = useTheme();
  const reduceMotion = useReduceMotion();
  const caret = useRef(new Animated.Value(props.open ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(caret, {
      toValue: props.open ? 1 : 0,
      duration: reduceMotion ? 0 : motion.standard,
      useNativeDriver: true,
    }).start();
  }, [props.open, caret, reduceMotion]);
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: props.open }}
        accessibilityLabel={tr('settings.sections.a11y', { title: props.title })}
        onPress={props.onToggle}
        style={styles.sectionHeader}
      >
        <Text style={[type.heading, { color: t.textPrimary, flex: 1 }]}>
          {props.title}
        </Text>
        {/* A rotating caret, not a navigation chevron: it points at
            where the content goes, and turns to face it. */}
        <Animated.View
          style={{
            transform: [
              {
                rotate: caret.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '180deg'],
                }),
              },
            ],
          }}
        >
          <Ionicons name="chevron-down" size={18} color={t.textSecondary} />
        </Animated.View>
      </Pressable>
      {props.open ? (
        <>
          {/* White card, thin gray border (Stage 5 redesign — the
              filled gray panel is gone; surfaceRaised is white in
              light mode and the elevated tone in dark). */}
          <View
            style={[
              styles.card,
              { backgroundColor: t.surfaceRaised, borderColor: t.border },
            ]}
          >
            {props.children}
          </View>
          {props.footnote ? (
            <Text
              style={[type.caption, { color: t.textSecondary, marginTop: spacing.s }]}
            >
              {props.footnote}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

// A setting with few, short choices: label left, segments right —
// the value is readable at a glance and changeable in one tap.
function SegmentedRow(props: {
  label: string;
  options: Array<{ label: string; selected: boolean; onPress: () => void }>;
  last?: boolean;
  // Label on its own line, segments beneath. For rows whose option set
  // is wide (three tier chips): inline, the label column was squeezed
  // to a letters-tall sliver ("Tou rna me nts" — owner screenshot,
  // 2026-09-01). Explicit per row, so every language gets the same
  // geometry for the same control.
  stacked?: boolean;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.row,
        props.stacked && styles.rowStacked,
        !props.last && { borderBottomWidth: StyleSheet.hairlineWidth },
        { borderColor: t.border },
      ]}
    >
      <Text style={[type.body, { color: t.textPrimary, flexShrink: 1 }]}>
        {props.label}
      </Text>
      {props.stacked ? null : <View style={{ flex: 1 }} />}
      {/* Bordered segments (Stage 5 restyle): joined by hairlines,
          selected = a light tint of the brand blue with blue text —
          the tint is the brand token at 10% alpha, not a new colour. */}
      <View style={[styles.segments, { borderColor: t.border }]}>
        {props.options.map((o, i) => (
          <Pressable
            key={o.label}
            accessibilityRole="button"
            accessibilityState={{ selected: o.selected }}
            accessibilityLabel={`${props.label}: ${o.label}`}
            onPress={o.onPress}
            style={[
              styles.segment,
              i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth },
              { borderColor: t.border },
              o.selected
                ? { backgroundColor: `${t.primary}1A` }
                : { backgroundColor: t.surfaceRaised },
            ]}
          >
            <Text
              style={[
                type.secondary,
                o.selected
                  ? { color: t.primary, fontWeight: '600' }
                  : { color: t.textPrimary },
              ]}
              maxFontSizeMultiplier={1.4}
            >
              {o.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// A radio row inside a card, for the lists short enough to stay flat.
function OptionRow(props: {
  label: string;
  selected: boolean;
  onPress: () => void;
  last?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: props.selected }}
      accessibilityLabel={props.label}
      onPress={props.onPress}
      style={[
        styles.row,
        !props.last && { borderBottomWidth: StyleSheet.hairlineWidth },
        { borderColor: t.border },
      ]}
    >
      <Text style={[type.body, { color: t.textPrimary, flex: 1 }]}>
        {props.label}
      </Text>
      {props.selected ? (
        <Text style={[type.body, { color: t.primary, fontWeight: '700' }]}>✓</Text>
      ) : null}
    </Pressable>
  );
}

// A row whose right side is its current value; tapping navigates. With
// no onPress it is a STATEMENT, not a control — the connected Google
// row (B4 item 2) says where fixtures are and offers no verb.
function ValueRow(props: {
  label: string;
  value?: string;
  caption?: string;
  onPress?: () => void;
  accessibilityLabel: string;
  last?: boolean;
}) {
  const t = useTheme();
  const rowStyle = [
    styles.row,
    !props.last && { borderBottomWidth: StyleSheet.hairlineWidth },
    { borderColor: t.border, minHeight: 56 },
  ];
  const body = (
    <>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { color: t.textPrimary }]}>{props.label}</Text>
        {props.caption ? (
          <Text style={[type.caption, { color: t.textSecondary }]} numberOfLines={2}>
            {props.caption}
          </Text>
        ) : null}
      </View>
      {props.value ? (
        <Text style={[type.body, { color: t.textSecondary, marginLeft: spacing.m }]}>
          {props.value}
        </Text>
      ) : null}
    </>
  );
  if (!props.onPress) {
    return (
      <View accessible accessibilityLabel={props.accessibilityLabel} style={rowStyle}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      onPress={props.onPress}
      style={rowStyle}
    >
      {body}
    </Pressable>
  );
}

type SectionKey =
  | 'calendar'
  | 'events'
  | 'reminders'
  | 'app'
  | 'past'
  | 'privacy';

export default function PreferencesScreen({
  navigation,
}: RootScreenProps<'Preferences'>) {
  // All collapsed on entry — the accordion's default state is the list
  // of section titles. EXCLUSIVE (owner amendment): opening a section
  // closes whichever was open, so at most one is expanded at a time.
  // Nothing persists.
  const [openSection, setOpenSection] = useState<SectionKey | null>(null);
  // Round 5 Stage 2: the notification channel's choice + OS state.
  const [reminderChoiceValue, setReminderChoiceValue] = useState(reminderChoice);
  const [notificationsDenied, setNotificationsDenied] = useState(false);
  useEffect(() => {
    void readNotificationPermission().then((p) =>
      setNotificationsDenied(p.status === 'denied' && !p.canAskAgain),
    );
  }, []);
  const enableReminders = async () => {
    const current = await readNotificationPermission();
    const state =
      current.status === 'granted'
        ? current
        : current.status === 'undetermined' || current.canAskAgain
          ? await requestNotificationPermission()
          : current;
    if (state.status === 'granted') {
      setReminderChoice('enabled');
      setReminderChoiceValue('enabled');
      setNotificationsDenied(false);
      void runSync(); // reconciles the notifications through the refresh hook
      return;
    }
    setReminderChoice('deferred');
    setReminderChoiceValue('deferred');
    setNotificationsDenied(state.status === 'denied' && !state.canAskAgain);
  };
  const toggleSection = (key: SectionKey) =>
    setOpenSection((current) => (current === key ? null : key));
  // Which reminder slot's wheels are out — one at a time, same rule as
  // the sections themselves.
  const [openReminderSlot, setOpenReminderSlot] = useState<number | null>(null);
  // Backend flips (connect/disconnect) change what the Calendar card
  // shows without any state of this screen changing — repaint by hand.
  const [, forceRepaint] = useState(0);
  const [region, setRegion] = useState<RegionKey | null>(regionOverride());
  const [appearance, setAppearance] = useState<AppearanceChoice>(appearanceChoice);
  const t = useTheme();
  const [prefs, setPrefs] = useState<CalendarPrefs>(loadPrefs);
  const [colour, setColour] = useState<string>(calendarColour);
  // Read from the persisted target so the row paints immediately, and
  // refreshed on focus because a sync (or the picker) may have moved it.
  const [target, setTarget] = useState(storedTarget);
  useFocusEffect(
    useCallback(() => {
      setTarget(storedTarget());
      // Returning from the Region screen: the value row must show what
      // was just chosen.
      setRegion(regionOverride());
    }, []),
  );
  // A sync landing while this screen is open changes what the Calendar
  // card must say — an expired grant (the reconnect row), the REST
  // target record being written, a colour painted or refused.
  useEffect(
    () =>
      subscribeSync(() => {
        setTarget(storedTarget());
        forceRepaint((n) => n + 1);
      }),
    [],
  );
  // Backend-aware (B4 item 1): the stale pre-P28 provider record can no
  // longer call a REST-created KickOffCal calendar "Social".
  const ownCalendar = ownsCalendarColour(
    activeBackend(),
    nativeSyncRoute(),
    target,
  );
  // Under REST the swatch must not claim a colour Google refused.
  const colourRefused =
    activeBackend() === 'rest' && restColourState()?.status === 'refused';

  const pickColour = async (hex: string, name: string) => {
    setColour(hex);
    const outcome = await setCalendarColour(hex);
    showToast({
      message:
        outcome === 'applied'
          ? tr('settings.calendar.colourApplied', {
              colour: name.toLowerCase(),
            })
          : outcome === 'refused'
            ? tr('settings.calendar.colourRefused')
            : tr('settings.calendar.colourSaved'),
    });
    forceRepaint((n) => n + 1);
  };

  const apply = (next: CalendarPrefs) => {
    setPrefs(next);
    savePrefs(next);
    void runSync(); // re-plan immediately so the change is visible
  };

  const regionValue =
    region === null
      ? tr('settings.region.matchDevice', {
          region: regionLabel(detectedRegion()),
        })
      : region === 'default'
        ? tr('settings.region.default')
        : regionLabel(region);

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: spacing.l, paddingTop: 0 }}
    >
      <Section
        title={tr('settings.sections.calendar')}
        open={openSection === 'calendar'}
        onToggle={() => toggleSection('calendar')}
      >
        {premiumLocked() && calendarConnection() !== 'connected' ? (
          // Round 5: sync is Premium. A Free install that has not
          // connected sees the Sync row in its Premium state — the
          // control shows what it is, and a tap is the on-demand way
          // into the paywall (Stage 3/4 register the presenter). Never
          // shown to a connected install: its calendar stays connected
          // and the planner, not the row, applies the downgrade rules.
          <ValueRow
            label={tr('premium.syncRow')}
            accessibilityLabel={tr('premium.syncRow')}
            onPress={() => requestPaywall('on_demand')}
          />
        ) : activeBackend() === 'rest' ? (
          // Google-connected: one calendar, ours by construction —
          // nothing to pick. The first row states where fixtures are,
          // and becomes the reconnect surface ONLY when the last sync
          // died of an expired grant (B4 item 2 — it used to read "tap
          // to reconnect" whenever the backend was REST, i.e. always;
          // the real signal is the sync engine's error kind, the same
          // one the Schedule chip renders). The second row is its
          // other half (Stage 7B): Connect ⇄ Disconnect as a proper
          // state pair. Disconnect ends the grant and halts calendar
          // writes — the calendar and its events are left exactly as
          // they are.
          <>
            {restRowMode(lastSyncErrorKind()) === 'reconnect' ? (
              <ValueRow
                label="KickOffCal"
                caption={tr('settings.calendar.googleReconnectCaption')}
                accessibilityLabel={tr('settings.calendar.googleReconnectA11y')}
                onPress={() =>
                  void connectGoogleCalendar().then((r) => {
                    if (r.ok) {
                      showToast({
                        message: tr('settings.calendar.googleReconnected'),
                      });
                      setTarget(storedTarget());
                      forceRepaint((n) => n + 1);
                      void runSync();
                    }
                  })
                }
              />
            ) : (
              <ValueRow
                label="KickOffCal"
                caption={tr('settings.calendar.googleConnectedCaption')}
                accessibilityLabel={tr('settings.calendar.googleConnectedA11y')}
              />
            )}
            <ValueRow
              label={tr('settings.calendar.disconnectGoogle')}
              caption={tr('settings.calendar.disconnectCaption')}
              accessibilityLabel={tr('settings.calendar.disconnectGoogle')}
              onPress={() =>
                void disconnectGoogleCalendar().then(() => {
                  showToast({
                    message: tr('settings.calendar.googleDisconnected'),
                  });
                  setTarget(storedTarget());
                  forceRepaint((n) => n + 1);
                })
              }
            />
          </>
        ) : nativeSyncRoute() === 'google-connect' ? (
          // Android, not connected: settings is the later door into the
          // same priming flow onboarding offers. An install that already
          // holds ledgered events — a legacy provider-path install, or a
          // disconnected REST one — is told those stay where they are:
          // the REST scope cannot move what another path wrote (B4
          // item 7).
          <ValueRow
            label={tr('settings.calendar.connectGoogle')}
            caption={
              legacyCalendarEventsRemain()
                ? tr('settings.calendar.connectLegacyCaption')
                : tr('settings.calendar.connectCaption')
            }
            accessibilityLabel={tr('settings.calendar.connectGoogle')}
            onPress={() => navigation.navigate('CalendarPriming', {})}
          />
        ) : (
          <ValueRow
            label={target ? target.label : tr('settings.calendar.choose')}
            caption={
              target
                ? consequenceForTarget({
                    accountLabel: target.accountLabel,
                    sourceKind: target.sourceKind,
                    ours: target.kind === 'ours',
                  })
                : tr('settings.calendar.autoPickedCaption')
            }
            accessibilityLabel={
              target
                ? tr('settings.calendar.targetA11y', {
                    label: target.label,
                    account: target.accountLabel,
                  })
                : tr('settings.calendar.chooseA11y')
            }
            onPress={() => navigation.navigate('CalendarTarget')}
          />
        )}
        {/* The calendar's colour lives WITH the calendar. */}
        {ownCalendar ? (
          <View style={styles.swatchRow}>
            <Text style={[type.body, { color: t.textPrimary, marginBottom: spacing.s }]}>
              {tr('settings.calendar.colour')}
            </Text>
            <View style={styles.swatches}>
              {CALENDAR_COLOURS.map((c) => (
                <Pressable
                  key={c.hex}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: colour === c.hex }}
                  accessibilityLabel={tr('settings.calendar.colourA11y', {
                    name: tr(c.nameKey),
                  })}
                  onPress={() => void pickColour(c.hex, tr(c.nameKey))}
                  style={[
                    styles.swatch,
                    { backgroundColor: c.hex },
                    colour === c.hex && {
                      borderWidth: 3,
                      borderColor: t.textPrimary,
                    },
                  ]}
                />
              ))}
            </View>
            <Text style={[type.caption, { color: t.textSecondary, marginTop: spacing.s }]}>
              {colourRefused
                ? tr('settings.calendar.colourRefused')
                : tr('settings.calendar.colourCaption')}
            </Text>
          </View>
        ) : (
          <View style={styles.swatchRow}>
            <Text style={[type.caption, { color: t.textSecondary }]}>
              {tr('settings.calendar.inheritedColour', {
                calendar: target?.label ?? tr('settings.words.yourCalendar'),
              })}
            </Text>
          </View>
        )}
      </Section>

      <Section
        title={tr('settings.sections.events')}
        open={openSection === 'events'}
        onToggle={() => toggleSection('events')}
        footnote={tr('settings.events.footnote')}
      >
        <SegmentedRow
          label={tr('settings.events.style')}
          options={[
            {
              label: tr('settings.events.timed'),
              selected: prefs.eventStyle === 'timed',
              onPress: () => apply({ ...prefs, eventStyle: 'timed' }),
            },
            {
              label: tr('settings.events.allDay'),
              selected: prefs.eventStyle === 'all-day',
              onPress: () => apply({ ...prefs, eventStyle: 'all-day' }),
            },
          ]}
        />
        <SegmentedRow
          label={tr('settings.events.raceWeekends')}
          options={[
            {
              label: tr('settings.events.allSessions'),
              selected: prefs.seriesSessions === 'all',
              onPress: () => apply({ ...prefs, seriesSessions: 'all' }),
            },
            {
              label: tr('settings.events.raceOnly'),
              selected: prefs.seriesSessions === 'race-only',
              onPress: () => apply({ ...prefs, seriesSessions: 'race-only' }),
            },
          ]}
        />
        {/* Tournament calendar tiers (Round 3 B3): what a followed
            multi-day tournament writes — the full block, bookend notes
            plus the key rounds, or bookends plus every match. The row's
            word is the shared sport vocabulary — core, not settings. */}
        <SegmentedRow
          label={tr('core.tournaments')}
          stacked
          last
          options={[
            {
              label: tr('settings.events.block'),
              selected: prefs.tournamentTier === 'block',
              onPress: () => apply({ ...prefs, tournamentTier: 'block' }),
            },
            {
              label: tr('settings.events.keyRounds'),
              selected: prefs.tournamentTier === 'key',
              onPress: () => apply({ ...prefs, tournamentTier: 'key' }),
            },
            {
              label: tr('settings.events.allMatches'),
              selected: prefs.tournamentTier === 'all',
              onPress: () => apply({ ...prefs, tournamentTier: 'all' }),
            },
          ]}
        />
      </Section>

      <Section
        title={tr('settings.reminders.title')}
        open={openSection === 'reminders'}
        onToggle={() => toggleSection('reminders')}
        footnote={tr('settings.reminders.footnote')}
      >
        {/* The three slots (Stage 5, redesigned to the mock): one row,
            three compact dropdowns under their digits; the wheel pair
            grows beneath the row for whichever dropdown is open. Values
            persist through apply() like every other preference, and the
            immediate runSync reschedules every materialised reminder
            through the existing channels. The card's ONE internal
            hairline sits between this row and the segmented row. */}
        <View
          style={{
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderColor: t.border,
          }}
        >
          <ReminderSlotsRow
            slots={[
              prefs.reminderMinutes,
              prefs.extraReminders[0] ?? null,
              prefs.extraReminders[1] ?? null,
            ]}
            openSlot={openReminderSlot}
            onToggleSlot={(slot) =>
              setOpenReminderSlot((s) => (s === slot ? null : slot))
            }
            onChange={(slot, m) => {
              if (slot === 0) apply({ ...prefs, reminderMinutes: m });
              else {
                const extras = [...prefs.extraReminders];
                while (extras.length < 2) extras.push(null);
                extras[slot - 1] = m;
                apply({ ...prefs, extraReminders: extras });
              }
            }}
          />
        </View>
        {/* Round 5 Stage 2: the system-notification channel — one row,
            Off / On. On probes the OS first and asks only from the
            never-asked state; a denial shows the Settings link beneath
            (the OS will not ask again), never a re-prompt. */}
        <SegmentedRow
          label={tr('reminders.notify')}
          options={[
            {
              label: tr('settings.reminders.off'),
              selected: reminderChoiceValue !== 'enabled',
              onPress: () => {
                setReminderChoice('deferred');
                setReminderChoiceValue('deferred');
                void runSync();
              },
            },
            {
              label: tr('settings.reminders.on'),
              selected: reminderChoiceValue === 'enabled',
              onPress: () => void enableReminders(),
            },
          ]}
        />
        {notificationsDenied ? (
          <ValueRow
            label={tr('notifications.off')}
            caption={tr('notifications.openSettings')}
            accessibilityLabel={tr('notifications.openSettings')}
            onPress={() => void Linking.openSettings()}
          />
        ) : null}
        <SegmentedRow
          label={tr('settings.reminders.daysWithoutDates')}
          last
          options={ALL_DAY_REMINDER_OPTIONS.map((opt) => ({
            // The short form is what fits a segment; the full wording
            // ("Evening before, 6pm") belongs to the radio-row world.
            label: (opt as { short?: string }).short ?? opt.label,
            selected: prefs.allDayReminder === opt.value,
            onPress: () => apply({ ...prefs, allDayReminder: opt.value }),
          }))}
        />
      </Section>

      <Section
        title={tr('settings.sections.app')}
        open={openSection === 'app'}
        onToggle={() => toggleSection('app')}
      >
        <SegmentedRow
          label={tr('settings.app.appearance')}
          options={[
            { key: 'system', label: tr('settings.app.auto') },
            { key: 'light', label: tr('settings.app.light') },
            { key: 'dark', label: tr('settings.app.dark') },
          ].map((o) => ({
            label: o.label,
            selected: appearance === o.key,
            onPress: () => {
              setAppearanceChoice(o.key as AppearanceChoice);
              setAppearance(o.key as AppearanceChoice);
            },
          }))}
        />
        <ValueRow
          label={tr('settings.app.region')}
          value={regionValue}
          accessibilityLabel={tr('settings.app.regionA11y', {
            value: regionValue,
          })}
          onPress={() => navigation.navigate('Region')}
          last
        />
      </Section>

      {/* Destructive — finished games are a record of something that
          happened, and this is the only way to opt out of keeping that
          record. (The rule that used to sit above this moved below Data
          & privacy — Round 2 layout ruling.) */}
      <Section
        title={tr('settings.sections.pastGames')}
        open={openSection === 'past'}
        onToggle={() => toggleSection('past')}
        footnote={tr('settings.past.footnote')}
      >
        <OptionRow
          label={tr('settings.past.keep')}
          selected={!prefs.autoDeletePast}
          onPress={() => apply({ ...prefs, autoDeletePast: false })}
        />
        <OptionRow
          label={tr('settings.past.remove', { days: PAST_RETENTION_DAYS })}
          selected={prefs.autoDeletePast}
          onPress={() => apply({ ...prefs, autoDeletePast: true })}
          last
        />
      </Section>

      <Section
        title={tr('settings.sections.dataPrivacy')}
        open={openSection === 'privacy'}
        onToggle={() => toggleSection('privacy')}
      >
        <DataPrivacyRows
          onReset={() =>
            navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] })
          }
        />
      </Section>

      {/* The screen's tail (Round 2 layout ruling): divider, Photo
          credits, then the sync-status caption at the very bottom. */}
      <View style={[styles.rule, { borderColor: t.border }]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('settings.tail.photoCredits')}
        onPress={() => navigation.navigate('Credits')}
        style={{ marginTop: spacing.m, minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={[type.secondary, { color: t.textSecondary }]}>
          {tr('settings.tail.photoCredits')}
        </Text>
      </Pressable>

      {/* Status, not settings — the quiet tail. */}
      <Text style={[type.caption, { color: t.textSecondary, marginTop: spacing.m }]}>
        {(() => {
          const device = syncStalenessHours();
          const data = dataStaleness(loadFollowables());
          const fmt = (h: number) =>
            h < 1
              ? tr('settings.status.underHourAgo')
              : h < 48
                ? tr('settings.status.hoursAgo', { n: Math.round(h) })
                : tr('settings.status.daysAgo', { n: Math.round(h / 24) });
          const deviceLine =
            device === null
              ? tr('settings.status.deviceNotSynced')
              : tr('settings.status.deviceSynced', { when: fmt(device) });
          const followCount = loadFollowables().length;
          const dataLine =
            followCount === 0
              ? tr('settings.status.nothingFollowed')
              : data === null || data.worstHours === null
                ? tr('settings.status.freshnessUnknown')
                : tr('settings.status.sourcesConfirmed', {
                    when: fmt(data.worstHours),
                  });
          return `${deviceLine} · ${dataLine}`;
        })()}
      </Text>
      {/* A device over the 200-key rule limit is REJECTED wholesale by
          Firestore, so it silently stops being swept. Say so. */}
      {lastRegistryError() ? (
        <Text style={[type.secondary, { color: t.danger, marginTop: spacing.m }]}>
          {lastRegistryError()}
        </Text>
      ) : null}

      {__DEV__ ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open theme gallery"
          onPress={() => navigation.navigate('ThemeGallery')}
          style={{ marginTop: spacing.xl, minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={[type.body, { color: t.textSecondary }]}>
            Theme gallery (dev)
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // The disclosure row: the WHOLE row is the tap target, and it clears
  // 44pt on its own. The card follows it when open.
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    minHeight: 44,
    marginBottom: spacing.s,
  },
  card: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.s,
    gap: spacing.s,
  },
  rowStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  segments: {
    flexDirection: 'row',
    borderRadius: radius.button,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    flexShrink: 0,
  },
  segment: {
    paddingHorizontal: spacing.m,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchRow: {
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.m,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  rule: {
    borderTopWidth: 1,
    marginTop: spacing.xxl,
  },
});
