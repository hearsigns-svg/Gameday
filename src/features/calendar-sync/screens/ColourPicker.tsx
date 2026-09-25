// The colour dot and its sheet (owner rulings 2026-09-25). Wherever a
// colour is chosen — a sport, a follow, an event, a calendar — the control
// is ONE dot in the colour it has now, and a tap opens the same eleven
// (domain/googleEventColour.ts PICKER_COLOURS). Where the thing can have
// no colour of its own, the sheet's first choice is the one it would
// inherit, named for where it comes from ("Football", "KickOffCal") — the
// state shows what it is, with no sentence to explain it.

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CatalogKey, t as tr } from '../../../core/i18n';
import { radius, spacing, touchTarget, type, useTheme } from '../../../core/tokens';
import { googleColorIdFor, PICKER_COLOURS } from '../domain/googleEventColour';

const sameHex = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

// A colour's name, for reading out: its own in the palette, else the
// nearest of the eleven (a calendar made in a colour of its own).
export function colourName(hex: string): string {
  const own = PICKER_COLOURS.find((c) => sameHex(c.hex, hex));
  const id = own?.id ?? googleColorIdFor(hex);
  const c = PICKER_COLOURS.find((x) => x.id === id);
  return c ? tr(`core.colours.${c.name}` as CatalogKey) : hex;
}

const DOT = 24;
const SWATCH = 34;

export function ColourDot(props: { colour: string; size?: number; ringColour?: string }) {
  const size = props.size ?? DOT;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: props.colour,
        ...(props.ringColour
          ? { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: props.ringColour }
          : {}),
      }}
    />
  );
}

export interface ColourRequest {
  // What is being coloured, as the user knows it.
  title: string;
  // Its own colour, if it has one.
  chosen: string | undefined;
  // What it wears with none of its own — absent where it must have one
  // (a calendar).
  inherit?: { label: string; colour: string };
  onPick: (hex: string | undefined) => void;
}

function Swatch(props: { hex: string; selected: boolean }) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.ring,
        { borderColor: props.selected ? t.textPrimary : 'transparent' },
      ]}
    >
      <View style={[styles.swatch, { backgroundColor: props.hex }]} />
    </View>
  );
}

export function ColourSheet(props: { request: ColourRequest | null; onClose: () => void }) {
  const t = useTheme();
  const req = props.request;
  const pick = (hex: string | undefined) => {
    req?.onPick(hex);
    props.onClose();
  };
  return (
    <Modal
      visible={req !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={props.onClose}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('calendar.colour.closeA11y')}
        onPress={props.onClose}
        style={[StyleSheet.absoluteFill, styles.scrim]}
      />
      {req ? (
        <View style={[styles.sheet, { backgroundColor: t.surfaceRaised }]}>
          <Text
            style={[type.heading, { color: t.textPrimary }]}
            numberOfLines={1}
            accessibilityRole="header"
          >
            {req.title}
          </Text>
          {req.inherit ? (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: req.chosen === undefined }}
              accessibilityLabel={tr('calendar.colour.inheritA11y', { name: req.inherit.label })}
              onPress={() => pick(undefined)}
              style={styles.inherit}
            >
              <Swatch hex={req.inherit.colour} selected={req.chosen === undefined} />
              <Text style={[type.body, { color: t.textPrimary, flex: 1 }]} numberOfLines={1}>
                {req.inherit.label}
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.grid}>
            {PICKER_COLOURS.map((c) => {
              const selected = req.chosen !== undefined && sameHex(req.chosen, c.hex);
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={tr(`core.colours.${c.name}` as CatalogKey)}
                  onPress={() => pick(c.hex)}
                  style={styles.cell}
                >
                  <Swatch hex={c.hex} selected={selected} />
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(8,7,6,0.55)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: spacing.l,
    paddingTop: spacing.l,
    paddingBottom: spacing.xxl + spacing.l,
    gap: spacing.m,
  },
  inherit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    minHeight: touchTarget,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s,
  },
  cell: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    width: SWATCH + 8,
    height: SWATCH + 8,
    borderRadius: (SWATCH + 8) / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: SWATCH / 2,
  },
});
