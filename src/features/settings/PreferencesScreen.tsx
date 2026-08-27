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
  AccessibilityInfo,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RootScreenProps } from '../../core/navigation';
import { motion, radius, spacing, type, useTheme } from '../../core/tokens';
import { PAST_RETENTION_DAYS } from '../fixtures/domain/horizon';
import { ALL_DAY_REMINDER_OPTIONS, CalendarPrefs, REMINDER_OPTIONS } from '../calendar-sync/domain/prefs';
import { loadPrefs, savePrefs } from '../calendar-sync/data/prefsStore';
import {
  calendarColour,
  setCalendarColour,
} from '../calendar-sync/data/calendarDriver';
import { lastRegistryError } from '../calendar-sync/data/deviceRegistry';
import { syncStalenessHours } from '../calendar-sync/syncEngine';
import { dataStaleness } from '../fixtures/data/freshnessRepo';
import { loadFollowables } from '../follows/data/followStore';
import { storedTarget } from '../calendar-sync/data/calendarTargetStore';
import { activeBackend } from '../calendar-sync/data/calendarBackend';
import { connectGoogleCalendar } from '../calendar-sync/data/googleCalendarAuth';
import { nativeSyncRoute } from '../calendar-sync/data/driver';
import { consequenceForTarget } from '../calendar-sync/domain/calendarTarget';
import { runSync } from '../calendar-sync/syncEngine';
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
const CALENDAR_COLOURS: Array<{ name: string; hex: string }> = [
  { name: 'KickOffCal blue', hex: '#1463F3' },
  { name: 'Red', hex: '#C81E1E' },
  { name: 'Orange', hex: '#EA580C' },
  { name: 'Green', hex: '#16A34A' },
  { name: 'Teal', hex: '#0D9488' },
  { name: 'Purple', hex: '#6D28D9' },
  { name: 'Pink', hex: '#DB2777' },
  { name: 'Graphite', hex: '#52525B' },
];

function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (live) setReduceMotion(on);
    });
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduceMotion;
}

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
        accessibilityLabel={`${props.title} settings`}
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
          <View
            style={[
              styles.card,
              { backgroundColor: t.surface, borderColor: t.border },
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
}) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.row,
        !props.last && { borderBottomWidth: StyleSheet.hairlineWidth },
        { borderColor: t.border },
      ]}
    >
      <Text style={[type.body, { color: t.textPrimary, flex: 1 }]} numberOfLines={1}>
        {props.label}
      </Text>
      <View style={[styles.segments, { backgroundColor: t.bg }]}>
        {props.options.map((o) => (
          <Pressable
            key={o.label}
            accessibilityRole="button"
            accessibilityState={{ selected: o.selected }}
            accessibilityLabel={`${props.label}: ${o.label}`}
            onPress={o.onPress}
            style={[
              styles.segment,
              o.selected && { backgroundColor: t.surfaceRaised },
            ]}
          >
            <Text
              style={[
                type.secondary,
                {
                  color: o.selected ? t.textPrimary : t.textSecondary,
                  fontWeight: o.selected ? '600' : '400',
                },
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

// A row whose right side is its current value; tapping navigates.
function ValueRow(props: {
  label: string;
  value?: string;
  caption?: string;
  onPress: () => void;
  accessibilityLabel: string;
  last?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      onPress={props.onPress}
      style={[
        styles.row,
        !props.last && { borderBottomWidth: StyleSheet.hairlineWidth },
        { borderColor: t.border, minHeight: 56 },
      ]}
    >
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
    </Pressable>
  );
}

type SectionKey = 'calendar' | 'events' | 'reminders' | 'app' | 'past';

export default function PreferencesScreen({
  navigation,
}: RootScreenProps<'Preferences'>) {
  // All collapsed on entry — the accordion's default state is the list
  // of section titles. Several may be open at once; nothing persists.
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    calendar: false,
    events: false,
    reminders: false,
    app: false,
    past: false,
  });
  const toggleSection = (key: SectionKey) =>
    setOpenSections((s) => ({ ...s, [key]: !s[key] }));
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
  const ownCalendar = target === null || target.kind === 'ours';

  const pickColour = async (hex: string, name: string) => {
    setColour(hex);
    const outcome = await setCalendarColour(hex);
    showToast({
      message:
        outcome === 'applied'
          ? `Calendar colour is now ${name.toLowerCase()}`
          : 'Colour saved — applies when your calendar connects',
    });
  };

  const apply = (next: CalendarPrefs) => {
    setPrefs(next);
    savePrefs(next);
    void runSync(); // re-plan immediately so the change is visible
  };

  const regionValue =
    region === null
      ? `Match my device (${regionLabel(detectedRegion())})`
      : region === 'default'
        ? 'Default'
        : regionLabel(region);

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: spacing.l, paddingTop: 0 }}
    >
      <Section
        title="Calendar"
        open={openSections.calendar}
        onToggle={() => toggleSection('calendar')}
      >
        {activeBackend() === 'rest' ? (
          // Google-connected: one calendar, ours by construction —
          // nothing to pick. The row is the reconnect surface, which is
          // also how a weekly-expired Testing grant heals.
          <ValueRow
            label="KickOffCal"
            caption="In your Google Calendar — tap to reconnect the sign-in"
            accessibilityLabel="KickOffCal in Google Calendar. Reconnect Google sign-in"
            onPress={() =>
              void connectGoogleCalendar().then((r) => {
                if (r.ok) {
                  showToast({ message: 'Google Calendar reconnected' });
                  void runSync();
                }
              })
            }
          />
        ) : nativeSyncRoute() === 'google-connect' ? (
          // Android, not yet connected: settings is the later door into
          // the same priming flow onboarding offers.
          <ValueRow
            label="Connect Google Calendar"
            caption="Fixtures live in the app until you do"
            accessibilityLabel="Connect Google Calendar"
            onPress={() => navigation.navigate('CalendarPriming', {})}
          />
        ) : (
          <ValueRow
            label={target ? target.label : 'Choose a calendar'}
            caption={
              target
                ? consequenceForTarget({
                    accountLabel: target.accountLabel,
                    sourceKind: target.sourceKind,
                    ours: target.kind === 'ours',
                  })
                : 'Picked automatically when your calendar connects'
            }
            accessibilityLabel={
              target
                ? `Calendar: ${target.label}. ${target.accountLabel}. Change where fixtures are written`
                : 'Choose where fixtures are written'
            }
            onPress={() => navigation.navigate('CalendarTarget')}
          />
        )}
        {/* The calendar's colour lives WITH the calendar. */}
        {ownCalendar ? (
          <View style={styles.swatchRow}>
            <Text style={[type.body, { color: t.textPrimary, marginBottom: spacing.s }]}>
              Colour
            </Text>
            <View style={styles.swatches}>
              {CALENDAR_COLOURS.map((c) => (
                <Pressable
                  key={c.hex}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: colour === c.hex }}
                  accessibilityLabel={`Calendar colour ${c.name}`}
                  onPress={() => void pickColour(c.hex, c.name)}
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
              How KickOffCal events look inside your phone's calendar app.
            </Text>
          </View>
        ) : (
          <View style={styles.swatchRow}>
            <Text style={[type.caption, { color: t.textSecondary }]}>
              Your fixtures take the colour of {target?.label ?? 'your calendar'},
              which is yours to set in your calendar app.
            </Text>
          </View>
        )}
      </Section>

      <Section
        title="Events"
        open={openSections.events}
        onToggle={() => toggleSection('events')}
        footnote="Timed events run kick-off to full time. Changes apply to every synced fixture on the next sync."
      >
        <SegmentedRow
          label="Event style"
          options={[
            {
              label: 'Timed',
              selected: prefs.eventStyle === 'timed',
              onPress: () => apply({ ...prefs, eventStyle: 'timed' }),
            },
            {
              label: 'All-day',
              selected: prefs.eventStyle === 'all-day',
              onPress: () => apply({ ...prefs, eventStyle: 'all-day' }),
            },
          ]}
        />
        <SegmentedRow
          label="Race weekends"
          last
          options={[
            {
              label: 'All sessions',
              selected: prefs.seriesSessions === 'all',
              onPress: () => apply({ ...prefs, seriesSessions: 'all' }),
            },
            {
              label: 'Race only',
              selected: prefs.seriesSessions === 'race-only',
              onPress: () => apply({ ...prefs, seriesSessions: 'race-only' }),
            },
          ]}
        />
      </Section>

      <Section
        title="Reminders"
        open={openSections.reminders}
        onToggle={() => toggleSection('reminders')}
        footnote="Reminder changes apply to fixtures as they are added or updated."
      >
        {REMINDER_OPTIONS.map((opt, i) => (
          <OptionRow
            key={String(opt.value)}
            label={opt.label}
            selected={prefs.reminderMinutes === opt.value}
            onPress={() => apply({ ...prefs, reminderMinutes: opt.value })}
            last={i === REMINDER_OPTIONS.length - 1 && ALL_DAY_REMINDER_OPTIONS.length === 0}
          />
        ))}
        <SegmentedRow
          label="Days without a time yet"
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
        title="App"
        open={openSections.app}
        onToggle={() => toggleSection('app')}
      >
        <SegmentedRow
          label="Appearance"
          options={[
            { key: 'system', label: 'Auto' },
            { key: 'light', label: 'Light' },
            { key: 'dark', label: 'Dark' },
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
          label="Region"
          value={regionValue}
          accessibilityLabel={`Region: ${regionValue}. Change region`}
          onPress={() => navigation.navigate('Region')}
          last
        />
      </Section>

      {/* Status, not settings — the quiet tail. */}
      <Text style={[type.caption, { color: t.textSecondary, marginTop: spacing.xl }]}>
        {(() => {
          const device = syncStalenessHours();
          const data = dataStaleness(loadFollowables());
          const fmt = (h: number) =>
            h < 1 ? 'under an hour ago' : h < 48 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`;
          const deviceLine =
            device === null ? 'This device: not synced yet' : `This device last synced ${fmt(device)}`;
          const followCount = loadFollowables().length;
          const dataLine =
            followCount === 0
              ? 'Fixture sources: nothing followed yet'
              : data === null || data.worstHours === null
                ? 'Fixture sources: freshness unknown'
                : `Fixture sources last confirmed ${fmt(data.worstHours)}`;
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Photo credits"
        onPress={() => navigation.navigate('Credits')}
        style={{ marginTop: spacing.m, minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={[type.secondary, { color: t.textSecondary }]}>
          Photo credits
        </Text>
      </Pressable>

      {/* Destructive, last, and past a rule — finished games are a
          record of something that happened, and this is the only way
          to opt out of keeping that record. */}
      <View style={[styles.rule, { borderColor: t.border }]} />
      <Section
        title="Past games"
        open={openSections.past}
        onToggle={() => toggleSection('past')}
        footnote="Only games KickOffCal added are ever removed, and only ones it still has a record of. Switching back stops further removals — it does not bring back anything already deleted."
      >
        <OptionRow
          label="Keep past games in my calendar"
          selected={!prefs.autoDeletePast}
          onPress={() => apply({ ...prefs, autoDeletePast: false })}
        />
        <OptionRow
          label={`Remove them ${PAST_RETENTION_DAYS} days after they finish`}
          selected={prefs.autoDeletePast}
          onPress={() => apply({ ...prefs, autoDeletePast: true })}
          last
        />
      </Section>

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
  segments: {
    flexDirection: 'row',
    borderRadius: radius.button,
    padding: 2,
  },
  segment: {
    paddingHorizontal: spacing.m,
    minHeight: 36,
    borderRadius: radius.button - 2,
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
