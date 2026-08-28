// The three reminder slots (Stage 5, redesigned to the owner's mock):
// ONE row — "Reminders" on the left, three compact dropdown buttons on
// the right under small gray digits 1 2 3. Tapping a dropdown
// highlights it and grows the two-column wheel (value | Off/Minutes/
// Hours) beneath the row, inside the card; the same tap collapses it
// and tapping another dropdown switches the wheel to that slot. The
// wheel internals are unchanged from the first cut — only its housing
// moved. Values are stored as minutes; the grid is the brief's ruling
// (1–59 min, 1–24 h, then 36/48/60/72).
//
// The wheels are our own snapping lists rather than a native picker
// dependency: Expo CNG means a new native module costs a prebuild on
// both platforms, and @react-native-picker/picker renders a dropdown
// on Android — a snapping list with momentum is the same wheel feel on
// both.

import { useRef } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, type, useTheme } from '../../core/tokens';
import {
  OFFSET_HOUR_VALUES,
  OFFSET_MINUTE_VALUES,
  offsetLabel,
  offsetPickerLabel,
} from '../calendar-sync/domain/prefs';

const ITEM_H = 36;
const VISIBLE = 5;
const WHEEL_H = ITEM_H * VISIBLE;
const BAND_TOP = ITEM_H * 2;

function WheelColumn(props: {
  items: readonly string[];
  index: number; // currently settled row
  onSettle: (index: number) => void;
  accessibilityLabel: string;
  flex?: number;
}) {
  const t = useTheme();
  const listRef = useRef<FlatList<string>>(null);
  // ONE settle per gesture. Drag-end and momentum-end both fire on a
  // real fling, and committing on BOTH made the wheel fight itself —
  // the drag-release offset (pre-snap) applied a value, the parent
  // re-rendered, then the snap landed somewhere else: the "jumping"
  // the owner saw. Momentum-end is the authority; drag-end only
  // commits when no momentum follows it (a slow release), via a short
  // timer that momentum-begin cancels.
  const pendingSettle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPending = () => {
    if (pendingSettle.current !== null) {
      clearTimeout(pendingSettle.current);
      pendingSettle.current = null;
    }
  };
  const settle = (offsetY: number) => {
    const i = Math.min(
      props.items.length - 1,
      Math.max(0, Math.round(offsetY / ITEM_H)),
    );
    if (i !== props.index) props.onSettle(i);
  };
  return (
    <View
      style={{ height: WHEEL_H, flex: props.flex ?? 1 }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={props.accessibilityLabel}
      accessibilityValue={{ text: props.items[props.index] ?? '' }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const delta = e.nativeEvent.actionName === 'increment' ? 1 : -1;
        const i = Math.min(
          props.items.length - 1,
          Math.max(0, props.index + delta),
        );
        if (i !== props.index) props.onSettle(i);
        listRef.current?.scrollToOffset({ offset: i * ITEM_H, animated: true });
      }}
    >
      <FlatList
        ref={listRef}
        data={[...props.items]}
        keyExtractor={(label, i) => `${i}-${label}`}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        getItemLayout={(_d, i) => ({
          // Offsets include the header spacer, so initialScrollIndex
          // and scrollToOffset agree about where a row sits.
          length: ITEM_H,
          offset: BAND_TOP + i * ITEM_H,
          index: i,
        })}
        // Lands the settled row in the centre band on mount.
        contentOffset={{ x: 0, y: props.index * ITEM_H }}
        onLayout={() =>
          listRef.current?.scrollToOffset({
            offset: props.index * ITEM_H,
            animated: false,
          })
        }
        onMomentumScrollBegin={cancelPending}
        onMomentumScrollEnd={(e) => {
          cancelPending();
          settle(e.nativeEvent.contentOffset.y);
        }}
        onScrollEndDrag={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          cancelPending();
          pendingSettle.current = setTimeout(() => settle(y), 150);
        }}
        ListHeaderComponent={<View style={{ height: BAND_TOP }} />}
        ListFooterComponent={<View style={{ height: BAND_TOP }} />}
        renderItem={({ item, index: i }) => (
          <Pressable
            accessible={false}
            onPress={() => {
              props.onSettle(i);
              listRef.current?.scrollToOffset({
                offset: i * ITEM_H,
                animated: true,
              });
            }}
            style={styles.wheelItem}
          >
            <Text
              style={[
                type.body,
                i === props.index
                  ? { color: t.textPrimary, fontWeight: '600' }
                  : { color: t.textSecondary },
              ]}
              maxFontSizeMultiplier={1.4}
            >
              {item}
            </Text>
          </Pressable>
        )}
      />
      {/* The centre band: where the chosen row rests. */}
      <View
        pointerEvents="none"
        style={[styles.band, { borderColor: t.border }]}
      />
    </View>
  );
}

type Unit = 'off' | 'minutes' | 'hours';

const UNIT_ITEMS: readonly string[] = ['Off', 'Minutes', 'Hours'];
const UNITS: readonly Unit[] = ['off', 'minutes', 'hours'];

function unitOf(minutes: number | null): Unit {
  if (minutes === null) return 'off';
  return minutes < 60 ? 'minutes' : 'hours';
}

// Nearest grid index for a value — a stored offset the grid no longer
// offers still lands somewhere sensible instead of at the top.
function nearestIndex(grid: readonly number[], value: number): number {
  let best = 0;
  for (let i = 1; i < grid.length; i++) {
    if (Math.abs(grid[i] - value) < Math.abs(grid[best] - value)) best = i;
  }
  return best;
}

export function ReminderSlotsRow(props: {
  slots: ReadonlyArray<number | null>; // length 3, minutes
  openSlot: number | null;
  onToggleSlot: (slot: number) => void;
  onChange: (slot: number, minutes: number | null) => void;
}) {
  const t = useTheme();
  const open = props.openSlot;
  const minutes = open === null ? null : (props.slots[open] ?? null);
  const unit = unitOf(minutes);
  const grid = unit === 'minutes' ? OFFSET_MINUTE_VALUES : OFFSET_HOUR_VALUES;
  const valueIndex =
    minutes === null
      ? 0
      : unit === 'minutes'
        ? nearestIndex(OFFSET_MINUTE_VALUES, minutes)
        : nearestIndex(OFFSET_HOUR_VALUES, minutes / 60);
  return (
    <View>
      <View style={styles.row}>
        <Text style={[type.body, { color: t.textPrimary, flex: 1 }]}>
          Reminders
        </Text>
        <View style={styles.slots}>
          {props.slots.map((m, slot) => (
            <View key={slot} style={styles.slotColumn}>
              {/* The slot's digit — the whole of its labelling. */}
              <Text
                style={[type.caption, { color: t.textSecondary }]}
                accessible={false}
              >
                {slot + 1}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Reminder ${slot + 1}, ${offsetLabel(m ?? null)}`}
                accessibilityState={{ expanded: open === slot }}
                onPress={() => props.onToggleSlot(slot)}
                style={({ pressed }) => [
                  styles.dropdown,
                  {
                    backgroundColor: t.surfaceRaised,
                    borderColor: open === slot ? t.primary : t.border,
                  },
                  open === slot && { borderWidth: 1 },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text
                  style={[
                    type.secondary,
                    { color: t.textPrimary, fontWeight: '600' },
                  ]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.4}
                >
                  {offsetPickerLabel(m ?? null)}
                </Text>
                <Ionicons name="chevron-down" size={14} color={t.textSecondary} />
              </Pressable>
            </View>
          ))}
        </View>
      </View>
      {open !== null ? (
        <View style={styles.wheels}>
          {unit === 'off' ? (
            // Keeps the pair's geometry while there is no value to pick.
            <View style={{ flex: 1 }} />
          ) : (
            <WheelColumn
              // Keyed by slot AND unit: switching either swaps the item
              // set, and the list must remount to land on the new index
              // rather than keeping the old offset over new rows.
              key={`${open}-${unit}`}
              items={grid.map(String)}
              index={valueIndex}
              accessibilityLabel={`Reminder ${open + 1} value`}
              onSettle={(i) =>
                props.onChange(
                  open,
                  unit === 'minutes'
                    ? OFFSET_MINUTE_VALUES[i]
                    : OFFSET_HOUR_VALUES[i] * 60,
                )
              }
            />
          )}
          <WheelColumn
            key={`unit-${open}`}
            items={UNIT_ITEMS}
            index={UNITS.indexOf(unit)}
            accessibilityLabel={`Reminder ${open + 1} unit`}
            onSettle={(i) => {
              const next = UNITS[i];
              if (next === unit) return;
              if (next === 'off') props.onChange(open, null);
              else if (next === 'minutes') {
                props.onChange(
                  open,
                  minutes !== null && minutes < 60 ? minutes : 30,
                );
              } else {
                props.onChange(
                  open,
                  minutes !== null &&
                    minutes >= 60 &&
                    OFFSET_HOUR_VALUES.includes(minutes / 60)
                    ? minutes
                    : 60,
                );
              }
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    gap: spacing.m,
  },
  slots: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  slotColumn: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.m,
    borderRadius: radius.button,
    borderWidth: StyleSheet.hairlineWidth,
  },
  wheels: {
    flexDirection: 'row',
    gap: spacing.m,
    paddingHorizontal: spacing.l,
    paddingBottom: spacing.m,
  },
  wheelItem: {
    height: ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  band: {
    position: 'absolute',
    top: BAND_TOP,
    left: 0,
    right: 0,
    height: ITEM_H,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
