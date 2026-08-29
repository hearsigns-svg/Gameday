// First run: one screen, one promise, one action. The CTA leads to the
// CALENDAR step, not straight to browsing — connecting the calendar you
// already use is the product, so it comes before picking teams. It is
// still skippable: refusing a permission must never block the app.

import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import { markWelcomeSeen } from '../calendar-sync/data/calendarChoice';
// Aliased: `t` is this screen's theme handle (useTheme), so the
// catalog function travels as `tr` here.
import { t as tr } from '../../core/i18n';
import { RootScreenProps } from '../../core/navigation';
import { spacing, type, useTheme } from '../../core/tokens';

type Props = RootScreenProps<'Welcome'>;

const PROMISES = [
  ['📅', tr('calendar.welcome.promiseCalendar')],
  ['🔄', tr('calendar.welcome.promiseCorrect')],
  // Owner-ruled wording (Prompt 25 §6). The old line promised "no
  // notifications" — false today (calendar alarms ARE notifications by
  // any reading a user cares about) and falser after the trial, when
  // push becomes the free tier's delivery channel.
  ['🤫', tr('calendar.welcome.promiseNoAccount')],
] as const;

export default function WelcomeScreen({ navigation }: Props) {
  const t = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: t.bg }]}>
      <View style={{ flex: 1 }} />
      <Text style={[type.display, { color: t.textPrimary }]}>KickOffCal</Text>
      <Text
        style={[
          type.title,
          { color: t.textSecondary, marginTop: spacing.s },
        ]}
      >
        {tr('calendar.welcome.tagline')}
      </Text>
      <View style={{ marginTop: spacing.xl, gap: spacing.l }}>
        {PROMISES.map(([glyph, line]) => (
          <View key={line} style={styles.promise}>
            <Text style={{ fontSize: 22 }} accessible={false}>
              {glyph}
            </Text>
            <Text
              style={[type.body, { color: t.textPrimary, flex: 1 }]}
            >
              {line}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ flex: 1 }} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('calendar.welcome.getStarted')}
        onPress={() => {
          markWelcomeSeen();
          navigation.replace('CalendarPriming', { onboarding: true });
        }}
        style={[styles.cta, { backgroundColor: t.primary }]}
      >
        <Text style={[type.body, { color: t.onPrimary, fontWeight: '600' }]}>
          {tr('calendar.welcome.getStarted')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: spacing.xl },
  promise: { flexDirection: 'row', alignItems: 'center', gap: spacing.l },
  cta: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.l,
  },
});
