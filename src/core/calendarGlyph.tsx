// The per-follow calendar glyph (owner brief "Per-follow calendar
// control", 2026-09-23) — the ONE glyph-only control in the app, a
// deliberate and recorded exception to "follow controls are text"
// (DECISIONS 2026-09-23; Follow ⇄ Following stays text).
//
// Two states, one outline family, differing in SHAPE as well as colour
// so the state never rides on colour alone (DESIGN_SYSTEM accessibility):
//   + calendar-plus-outline, neutral  — not in your calendar; a tap adds
//   ✓ calendar-check-outline, accent  — in your calendar; a tap removes
// The glyph always shows what a tap will do. It is drawn small but its
// press target is the platform minimum — 44pt on iOS, 48dp on Android —
// and it is always a SIBLING of the surface's own tap target (the
// no-chevron standard): pressing it never lights or opens the card or
// row it sits on.
//
// Two variants:
//   poster — on a hero's painted surface: ✓ on a filled disc in the
//            poster's on-colour carrying the brand accent, + on an
//            outlined disc in the on-colour, so both read over any
//            photograph or gradient.
//   row    — on the neutral shell: bare glyph, textSecondary for +,
//            the brand accent for ✓.

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { TeamTheme } from './teamTheme';
import { touchTarget, useTheme } from './tokens';

export type CalendarGlyphState = 'in' | 'out';


const DISC = 32;
const POSTER_ICON = 18;
const ROW_ICON = 24;

export function CalendarGlyph(props: {
  state: CalendarGlyphState;
  variant: 'poster' | 'row';
  // The poster variant paints against the hero's own theme.
  theme?: TeamTheme;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const t = useTheme();
  const isIn = props.state === 'in';
  const name = isIn ? 'calendar-check-outline' : 'calendar-plus-outline';
  const icon =
    props.variant === 'poster' ? (
      <View
        style={[
          styles.disc,
          isIn
            ? { backgroundColor: props.theme?.onGradient ?? t.surfaceRaised }
            : {
                borderWidth: 1.5,
                borderColor: props.theme?.onGradient ?? t.textPrimary,
                // A breath of shade under the outline, so the + keeps its
                // edge over a bright photograph.
                backgroundColor: 'rgba(0,0,0,0.18)',
              },
        ]}
      >
        <MaterialCommunityIcons
          name={name}
          size={POSTER_ICON}
          color={isIn ? t.primary : (props.theme?.onGradient ?? t.textPrimary)}
        />
      </View>
    ) : (
      <MaterialCommunityIcons
        name={name}
        size={ROW_ICON}
        color={isIn ? t.primary : t.textSecondary}
      />
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      // No `checked` state: the label already says which state it is in
      // ("… is in your calendar"), and a checked button reads as a
      // second, contradicting announcement of the same fact.
      accessibilityState={{ disabled: props.disabled === true }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [styles.hit, pressed ? { opacity: 0.55 } : null]}
    >
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    // The press target: the platform minimum, never the drawn size.
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
