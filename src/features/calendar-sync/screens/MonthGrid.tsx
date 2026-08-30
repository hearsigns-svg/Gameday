// Month view of Gameday's schedule — OUR events on a calendar-shaped
// grid, not an imitation of the user's whole calendar (Schedule shows
// only what Gameday manages, by decision). Monday-start weeks.
//
// CONTROLLED since the unified Schedule (Stage 3): the screen owns the
// shown month, because the list drives it too — scrolling the list
// pages this grid, and restoring the split state must land on whatever
// month the list is sitting in. The grid only reports taps.

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
// Aliased: `t` is this screen's theme handle (useTheme), so the
// catalog functions travel as `tr`/`tn` here.
import { t as tr, tn } from '../../../core/i18n';
import { radius, spacing, type, useTheme } from '../../../core/tokens';

// Monday-start initials, from the catalog (several languages do not
// share English's duplicated T/S letters).
const WEEKDAYS = [
  tr('calendar.month.mon'),
  tr('calendar.month.tue'),
  tr('calendar.month.wed'),
  tr('calendar.month.thu'),
  tr('calendar.month.fri'),
  tr('calendar.month.sat'),
  tr('calendar.month.sun'),
];

const keyOf = (y: number, m: number, d: number): string =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

interface Cell {
  day: number;
  key: string;
}

function monthCells(year: number, month: number): (Cell | null)[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday-start
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Cell | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, key: keyOf(year, month, d) });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function MonthGrid(props: {
  year: number;
  month: number; // 0-based, like Date
  onChangeMonth: (delta: 1 | -1) => void;
  // dayKey → number of fixtures still in the calendar that day.
  countsByDay: ReadonlyMap<string, number>;
  // Days where EVERYTHING has been opted out: they keep a mark — dimmed,
  // the same distinction the list rows carry — rather than going blank.
  removedOnlyDays: ReadonlySet<string>;
  selectedDay: string | null;
  onSelectDay: (dayKey: string) => void;
}) {
  const t = useTheme();
  const now = new Date();
  const { year, month } = props;
  const todayKey = keyOf(now.getFullYear(), now.getMonth(), now.getDate());
  const cells = useMemo(() => monthCells(year, month), [year, month]);
  const title = new Date(year, month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('calendar.month.previous')}
          onPress={() => props.onChangeMonth(-1)}
          style={styles.nav}
        >
          <Ionicons name="chevron-back" size={20} color={t.primary} />
        </Pressable>
        <Text
          accessibilityRole="header"
          style={[type.heading, { color: t.textPrimary }]}
        >
          {title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('calendar.month.next')}
          onPress={() => props.onChangeMonth(1)}
          style={styles.nav}
        >
          <Ionicons name="chevron-forward" size={20} color={t.primary} />
        </Pressable>
      </View>
      <View style={styles.week}>
        {WEEKDAYS.map((w, i) => (
          <Text
            key={i}
            style={[type.caption, styles.cell, { color: t.textSecondary }]}
            accessible={false}
          >
            {w}
          </Text>
        ))}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, row) => (
        <View key={row} style={styles.week}>
          {cells.slice(row * 7, row * 7 + 7).map((cell, i) => {
            if (!cell) return <View key={i} style={styles.cell} />;
            const count = props.countsByDay.get(cell.key) ?? 0;
            const removedOnly = count === 0 && props.removedOnlyDays.has(cell.key);
            const selected = props.selectedDay === cell.key;
            const isToday = cell.key === todayKey;
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={
                  count > 0
                    ? tn('calendar.month.dayFixtures', count, {
                        day: cell.day,
                        month: title,
                      })
                    : removedOnly
                      ? tr('calendar.month.dayRemovedOnly', {
                          day: cell.day,
                          month: title,
                        })
                      : tr('calendar.month.day', {
                          day: cell.day,
                          month: title,
                        })
                }
                onPress={() => props.onSelectDay(cell.key)}
                style={[
                  styles.cell,
                  styles.day,
                  selected && { backgroundColor: t.primary },
                  !selected && isToday && { borderWidth: 1, borderColor: t.primary },
                ]}
              >
                <Text
                  style={[
                    type.secondary,
                    {
                      color: selected
                        ? t.onPrimary
                        : count > 0
                          ? t.textPrimary
                          : t.textSecondary,
                      fontWeight: count > 0 ? '600' : '400',
                    },
                  ]}
                >
                  {cell.day}
                </Text>
                <View
                  style={[
                    styles.dot,
                    removedOnly && { opacity: 0.4 },
                    {
                      backgroundColor:
                        count > 0
                          ? selected
                            ? t.onPrimary
                            : t.primary
                          : removedOnly
                            ? selected
                              ? t.onPrimary
                              : t.textSecondary
                            : 'transparent',
                    },
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.l },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.s,
  },
  nav: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  week: { flexDirection: 'row' },
  cell: { flex: 1, textAlign: 'center' },
  day: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderRadius: radius.chip,
    minHeight: 44,
    justifyContent: 'center',
  },
  // 7pt, up from 5 (Round 4): the synced-day mark has to read at a
  // glance, and at 5 it disappeared next to the bold date.
  dot: { width: 7, height: 7, borderRadius: 3.5, marginTop: 2 },
});
