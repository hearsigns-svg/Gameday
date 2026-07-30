// Month view of Gameday's schedule — OUR events on a calendar-shaped
// grid, not an imitation of the user's whole calendar (Schedule shows
// only what Gameday manages, by decision). Monday-start weeks.

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, type, useTheme } from '../../../core/tokens';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

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
  // dayKey → number of active fixtures (excluded ones not counted).
  countsByDay: ReadonlyMap<string, number>;
  selectedDay: string | null;
  onSelectDay: (dayKey: string) => void;
}) {
  const t = useTheme();
  const now = new Date();
  const [offset, setOffset] = useState(0);
  const shown = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const year = shown.getFullYear();
  const month = shown.getMonth();
  const todayKey = keyOf(now.getFullYear(), now.getMonth(), now.getDate());
  const cells = useMemo(() => monthCells(year, month), [year, month]);
  const title = shown.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={() => setOffset((o) => o - 1)}
          style={styles.nav}
        >
          <Text style={[type.heading, { color: t.primary }]}>‹</Text>
        </Pressable>
        <Text
          accessibilityRole="header"
          style={[type.heading, { color: t.textPrimary }]}
        >
          {title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={() => setOffset((o) => o + 1)}
          style={styles.nav}
        >
          <Text style={[type.heading, { color: t.primary }]}>›</Text>
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
            const selected = props.selectedDay === cell.key;
            const isToday = cell.key === todayKey;
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={`${cell.day} ${title}${
                  count > 0 ? `, ${count} fixture${count === 1 ? '' : 's'}` : ''
                }`}
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
                    {
                      backgroundColor:
                        count > 0
                          ? selected
                            ? t.onPrimary
                            : t.primary
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
  dot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 2 },
});
