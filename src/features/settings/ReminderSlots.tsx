// The three reminder slots (Stage 5): each row shows its offset and
// expands IN PLACE into a wheel pair — a value wheel and a unit wheel
// (Off / Minutes / Hours), the brief's suggested shape. The wheels are
// our own snapping lists rather than a native picker dependency:
// Expo CNG means a new native module costs a prebuild on both
// platforms, and @react-native-picker/picker renders a dropdown on
// Android — a snapping list with momentum is the same wheel feel on
// both. Values are stored as minutes; the grid is the brief's ruling
// (1–59 min, 1–24 h, then 36/48/60/72).

import { useRef } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { spacing, type, useTheme } from '../../core/tokens';
import {
  OFFSET_HOUR_VALUES,
  OFFSET_MINUTE_VALUES,
  offsetLabel,
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
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => settle(e.nativeEvent.contentOffset.y)}
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

export function ReminderSlotRow(props: {
  label: string;
  minutes: number | null;
  onChange: (minutes: number | null) => void;
  expanded: boolean;
  onToggle: () => void;
  last?: boolean;
}) {
  const t = useTheme();
  const unit = unitOf(props.minutes);
  const grid = unit === 'minutes' ? OFFSET_MINUTE_VALUES : OFFSET_HOUR_VALUES;
  const valueIndex =
    props.minutes === null
      ? 0
      : unit === 'minutes'
        ? nearestIndex(OFFSET_MINUTE_VALUES, props.minutes)
        : nearestIndex(OFFSET_HOUR_VALUES, props.minutes / 60);
  return (
    <View
      style={[
        !props.last && { borderBottomWidth: StyleSheet.hairlineWidth },
        { borderColor: t.border },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: props.expanded }}
        accessibilityLabel={`${props.label}, ${offsetLabel(props.minutes)}`}
        onPress={props.onToggle}
        style={styles.row}
      >
        <Text style={[type.body, { color: t.textPrimary, flex: 1 }]}>
          {props.label}
        </Text>
        <Text
          style={[
            type.body,
            {
              color: props.minutes === null ? t.textSecondary : t.textPrimary,
            },
          ]}
        >
          {offsetLabel(props.minutes)}
        </Text>
      </Pressable>
      {props.expanded ? (
        <View style={styles.wheels}>
          {unit === 'off' ? (
            // Keeps the pair's geometry while there is no value to pick.
            <View style={{ flex: 1 }} />
          ) : (
            <WheelColumn
              // Keyed by unit: a Minutes↔Hours flip swaps the item set,
              // and the list must remount to land on the new index
              // rather than keeping the old offset over new rows.
              key={unit}
              items={grid.map(String)}
              index={valueIndex}
              accessibilityLabel={`${props.label} value`}
              onSettle={(i) =>
                props.onChange(
                  unit === 'minutes' ? OFFSET_MINUTE_VALUES[i] : OFFSET_HOUR_VALUES[i] * 60,
                )
              }
            />
          )}
          <WheelColumn
            items={UNIT_ITEMS}
            index={UNITS.indexOf(unit)}
            accessibilityLabel={`${props.label} unit`}
            onSettle={(i) => {
              const next = UNITS[i];
              if (next === unit) return;
              if (next === 'off') props.onChange(null);
              else if (next === 'minutes') {
                props.onChange(
                  props.minutes !== null && props.minutes < 60 ? props.minutes : 30,
                );
              } else {
                props.onChange(
                  props.minutes !== null &&
                    props.minutes >= 60 &&
                    OFFSET_HOUR_VALUES.includes(props.minutes / 60)
                    ? props.minutes
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
    minHeight: 52,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.s,
    gap: spacing.s,
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
