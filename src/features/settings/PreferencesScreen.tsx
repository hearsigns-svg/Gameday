// Calendar preferences. Changes apply from the next sync; the event-
// style switch flips every scheduled event's kind on that sync.

import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RootScreenProps } from '../../core/navigation';
import { radius, spacing, type, useTheme } from '../../core/tokens';
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
  setRegionOverride,
} from '../../core/regionStore';
import {
  AppearanceChoice,
  appearanceChoice,
  setAppearanceChoice,
} from '../../core/appearanceStore';
import { refreshPriorities } from '../follows/data/browsePriority';

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

function OptionRow(props: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: props.selected }}
      accessibilityLabel={props.label}
      onPress={props.onPress}
      style={[styles.option, { borderColor: t.border }]}
    >
      <Text style={[type.body, { color: t.textPrimary, flex: 1 }]}>
        {props.label}
      </Text>
      {props.selected ? (
        <Text style={[type.body, { color: t.primary, fontWeight: '700' }]}>
          ✓
        </Text>
      ) : null}
    </Pressable>
  );
}

export default function PreferencesScreen({
  navigation,
}: RootScreenProps<'Preferences'>) {
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

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: spacing.l }}
    >
      <Text style={[type.heading, { color: t.textPrimary }]}>Calendar</Text>
      {activeBackend() === 'rest' ? (
        // Google-connected: one calendar, ours by construction — nothing
        // to pick. The row is the reconnect surface, which is also how a
        // weekly-expired Testing grant heals (tap, pick account, done).
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="KickOffCal in Google Calendar. Reconnect Google sign-in"
          onPress={() =>
            void connectGoogleCalendar().then((r) => {
              if (r.ok) {
                showToast({ message: 'Google Calendar reconnected' });
                void runSync();
              }
            })
          }
          style={[
            styles.option,
            { borderColor: t.border, marginTop: spacing.m, minHeight: 60 },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { color: t.textPrimary }]}>KickOffCal</Text>
            <Text style={[type.caption, { color: t.textSecondary }]}>
              In your Google Calendar — tap to reconnect the sign-in
            </Text>
          </View>
        </Pressable>
      ) : nativeSyncRoute() === 'google-connect' ? (
        // Android, not yet connected: settings is the later door into
        // the same priming flow onboarding offers (owner §3 ruling).
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Connect Google Calendar"
          onPress={() => navigation.navigate('CalendarPriming', {})}
          style={[
            styles.option,
            { borderColor: t.border, marginTop: spacing.m, minHeight: 60 },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { color: t.textPrimary }]}>
              Connect Google Calendar
            </Text>
            <Text style={[type.caption, { color: t.textSecondary }]}>
              Fixtures live in the app until you do
            </Text>
          </View>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            target
              ? `Calendar: ${target.label}. ${target.accountLabel}. Change where fixtures are written`
              : 'Choose where fixtures are written'
          }
          onPress={() => navigation.navigate('CalendarTarget')}
          style={[
            styles.option,
            { borderColor: t.border, marginTop: spacing.m, minHeight: 60 },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { color: t.textPrimary }]}>
              {target ? target.label : 'Choose a calendar'}
            </Text>
            <Text style={[type.caption, { color: t.textSecondary }]}>
              {target
                ? consequenceForTarget({
                    accountLabel: target.accountLabel,
                    sourceKind: target.sourceKind,
                    ours: target.kind === 'ours',
                  })
                : 'Picked automatically when your calendar connects'}
            </Text>
          </View>
        </Pressable>
      )}
      <Text style={[type.label, { color: t.textSecondary, marginTop: spacing.l }]}>
        Calendar colour
      </Text>
      {/* A colour belongs to the CALENDAR, not to the events in it — so
          this only ever applies to a calendar of ours. Offering swatches
          over someone's own calendar would be a promise we refuse to
          keep: we do not restyle a user's calendar. */}
      {ownCalendar ? (
        <>
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
          <Text
            style={[type.caption, { color: t.textSecondary, marginTop: spacing.s }]}
          >
            How KickOffCal events look inside your phone's calendar app.
          </Text>
        </>
      ) : (
        <Text
          style={[type.caption, { color: t.textSecondary, marginTop: spacing.m }]}
        >
          Your fixtures take the colour of {target?.label ?? 'your calendar'},
          which is yours to set in your calendar app. Switch to a KickOffCal
          calendar above to colour them separately.
        </Text>
      )}

      <Text
        style={[type.heading, { color: t.textPrimary, marginTop: spacing.xl }]}
      >
        Events
      </Text>
      <Text style={[type.label, { color: t.textSecondary, marginTop: spacing.l }]}>
        Event style
      </Text>
      <View style={styles.group}>
        <OptionRow
          label="Timed events (kick-off to full time)"
          selected={prefs.eventStyle === 'timed'}
          onPress={() => apply({ ...prefs, eventStyle: 'timed' })}
        />
        <OptionRow
          label="All-day events"
          selected={prefs.eventStyle === 'all-day'}
          onPress={() => apply({ ...prefs, eventStyle: 'all-day' })}
        />
      </View>
      <Text style={[type.caption, { color: t.textSecondary, marginTop: spacing.s }]}>
        Applies to every synced fixture on the next sync.
      </Text>
      <Text style={[type.label, { color: t.textSecondary, marginTop: spacing.l }]}>
        Race weekends
      </Text>
      <View style={styles.group}>
        <OptionRow
          label="All sessions (practice, qualifying, race)"
          selected={prefs.seriesSessions === 'all'}
          onPress={() => apply({ ...prefs, seriesSessions: 'all' })}
        />
        <OptionRow
          label="Race only"
          selected={prefs.seriesSessions === 'race-only'}
          onPress={() => apply({ ...prefs, seriesSessions: 'race-only' })}
        />
      </View>
      <Text style={[type.caption, { color: t.textSecondary, marginTop: spacing.s }]}>
        For series like Formula 1.
      </Text>

      <Text
        style={[type.heading, { color: t.textPrimary, marginTop: spacing.xl }]}
      >
        Reminders
      </Text>
      <View style={styles.group}>
        {REMINDER_OPTIONS.map((opt) => (
          <OptionRow
            key={String(opt.value)}
            label={opt.label}
            selected={prefs.reminderMinutes === opt.value}
            onPress={() => apply({ ...prefs, reminderMinutes: opt.value })}
          />
        ))}
      </View>
      <Text style={[type.caption, { color: t.textSecondary, marginTop: spacing.s }]}>
        Reminder changes apply to fixtures as they are added or updated.
      </Text>

      {/* The all-day channel: fixtures whose TIME is not published yet
          get day-shaped reminders anchored to civil hours, because
          "1 hour before" means nothing against a date. Off by default —
          turning it on is a choice that adds an alarm to every
          date-only fixture (Prompt 24 A1/B2). */}
      <Text
        style={[type.heading, { color: t.textPrimary, marginTop: spacing.xl }]}
      >
        Days without a time yet
      </Text>
      <View style={styles.group}>
        {ALL_DAY_REMINDER_OPTIONS.map((opt) => (
          <OptionRow
            key={String(opt.value)}
            label={opt.label}
            selected={prefs.allDayReminder === opt.value}
            onPress={() => apply({ ...prefs, allDayReminder: opt.value })}
          />
        ))}
      </View>

      <Text
        style={[type.heading, { color: t.textPrimary, marginTop: spacing.xl }]}
      >
        App
      </Text>
      <Text style={[type.label, { color: t.textSecondary, marginTop: spacing.l }]}>
        Appearance
      </Text>
      <View style={styles.group}>
        {(
          [
            { key: 'system', label: 'Match my device' },
            { key: 'light', label: 'Light' },
            { key: 'dark', label: 'Dark' },
          ] as Array<{ key: AppearanceChoice; label: string }>
        ).map((o) => (
          <OptionRow
            key={o.key}
            label={o.label}
            selected={appearance === o.key}
            onPress={() => {
              setAppearanceChoice(o.key);
              setAppearance(o.key);
            }}
          />
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Region"
        onPress={() => navigation.navigate('Region')}
        style={[styles.option, { borderColor: t.border, marginTop: spacing.l }]}
      >
        <Text style={[type.body, { color: t.textPrimary, flex: 1 }]}>Region</Text>
        <Text style={[type.body, { color: t.textSecondary }]}>
          {region === null
            ? `Match my device (${regionLabel(detectedRegion())})`
            : region === 'default'
              ? 'Default'
              : regionLabel(region)}
        </Text>
      </Pressable>
















      {/* Sync health, both halves of it: the DEVICE's last successful
          sync (syncStalenessHours) and the SOURCES' last confirmed
          activity upstream (dataStaleness). They are different facts —
          a perfectly syncing device against a dead source was showing
          green until Prompt 7. Unknown renders as unknown. */}

      <Text style={[type.caption, { color: t.textSecondary, marginTop: spacing.s }]}>
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
        <Text
          style={[
            type.secondary,
            { color: t.danger, marginTop: spacing.xl },
          ]}
        >
          {lastRegistryError()}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Photo credits"
        onPress={() => navigation.navigate('Credits')}
        style={[styles.option, { borderColor: t.border, marginTop: spacing.xl }]}
      >
        <Text style={[type.body, { color: t.textPrimary, flex: 1 }]}>
          Photo credits
        </Text>
      </Pressable>

      <View
        style={{
          borderTopWidth: 1,
          borderColor: t.border,
          marginTop: spacing.xxl,
        }}
      />
      <Text
        style={[type.heading, { color: t.textPrimary, marginTop: spacing.xl }]}
      >
        Past games
      </Text>
      {/* Destructive and off by default. Finished games are normally left
          alone forever — the event has stopped being a promise about the
          future and become a record of something that happened. This is
          the only way to opt out of keeping that record. */}
      <View style={styles.group}>
        <OptionRow
          label="Keep past games in my calendar"
          selected={!prefs.autoDeletePast}
          onPress={() => apply({ ...prefs, autoDeletePast: false })}
        />
        <OptionRow
          label={`Remove them ${PAST_RETENTION_DAYS} days after they finish`}
          selected={prefs.autoDeletePast}
          onPress={() => apply({ ...prefs, autoDeletePast: true })}
        />
      </View>
      <Text style={[type.caption, { color: t.textSecondary, marginTop: spacing.s }]}>
        Only games KickOffCal added are ever removed, and only ones it still
        has a record of. Switching back stops further removals — it does not
        bring back anything already deleted.
      </Text>

      {__DEV__ ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open theme gallery"
          onPress={() => navigation.navigate('ThemeGallery')}
          style={[styles.option, { borderColor: t.border, marginTop: spacing.xl }]}
        >
          <Text style={[type.body, { color: t.textSecondary, flex: 1 }]}>
            Theme gallery (dev)
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.m,
    marginTop: spacing.m,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  group: {
    marginTop: spacing.m,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.l,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
