// Calendar preferences. Changes apply from the next sync; the event-
// style switch flips every scheduled event's kind on that sync.

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RootScreenProps } from '../../core/navigation';
import { radius, spacing, type, useTheme } from '../../core/tokens';
import { CalendarPrefs, REMINDER_OPTIONS } from '../calendar-sync/domain/prefs';
import { loadPrefs, savePrefs } from '../calendar-sync/data/prefsStore';
import { runSync } from '../calendar-sync/syncEngine';

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
  const t = useTheme();
  const [prefs, setPrefs] = useState<CalendarPrefs>(loadPrefs);

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
      <Text style={[type.heading, { color: t.textPrimary }]}>Reminders</Text>
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

      <Text
        style={[type.heading, { color: t.textPrimary, marginTop: spacing.xl }]}
      >
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

      <Text
        style={[type.heading, { color: t.textPrimary, marginTop: spacing.xl }]}
      >
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
