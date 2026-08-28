// The follow celebration (Round 3): one-shot palette bursts.
//
// ONE Animated.Value drives every particle through per-index
// interpolations — transform/opacity on the native driver only, zero
// JS-thread ticking (the item-7 sensitivity stands). Particle spread is
// deterministic (golden-angle fan), so a burst needs no randomness and
// renders identically everywhere. Colours come from the entity's
// generated-treatment palette, which is what makes the burst
// team-specific by construction with no new assets.

import { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { TeamTheme } from './teamTheme';
import { Theme } from './palette';

// DISCRETE team colours, not tonal ramps (Round 3 colour ruling): a
// burst uses at most two flat, full-saturation colours plus the white
// sparkle pieces mixed in below. The pair comes from server-side crest
// extraction where one exists; an entity without one uses its
// treatment colour pushed to full saturation. The client never decodes
// an image.
export function burstPalette(
  opts: { colours?: readonly string[]; theme?: TeamTheme },
  shell: Theme,
): string[] {
  if (opts.colours && opts.colours.length > 0) return [...opts.colours];
  return [saturateHex(opts.theme?.accent ?? shell.primary)];
}

// hex → the flat vocabulary the extracted pairs live in (s 0.9, l 0.5),
// so fallback bursts sit beside extracted ones without reading muddier.
export function saturateHex(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return hex; // no hue to push
  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  const c = (1 - Math.abs(2 * 0.5 - 1)) * 0.9;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mm = 0.5 - c / 2;
  const [rr, gg, bb] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x];
  const to = (v: number) =>
    Math.round((v + mm) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(rr)}${to(gg)}${to(bb)}`.toUpperCase();
}

// Neutral sparkle — every third piece, whatever the team colours.
const SPARKLE = '#FFFFFF';

interface ParticleSpec {
  dx: number;
  dy: number;
  spin: string;
  color: string;
  w: number;
  h: number;
}

// Golden-angle fan with deterministic per-index distance jitter — the
// same burst every time, which is what fire-and-forget wants.
function particles(
  count: number,
  radius: number,
  palette: string[],
  sizeScale = 1,
): ParticleSpec[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i * 137.508 * Math.PI) / 180;
    const dist = radius * (0.7 + ((i * 37) % 30) / 100);
    return {
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist,
      spin: `${(i % 2 === 0 ? 1 : -1) * (180 + ((i * 53) % 180))}deg`,
      color: i % 3 === 2 ? SPARKLE : palette[i % palette.length],
      w: (i % 3 === 0 ? 5 : 7) * sizeScale,
      h: (i % 3 === 0 ? 5 : 4) * sizeScale,
    };
  });
}

function Burst(props: {
  progress: Animated.Value;
  specs: ParticleSpec[];
}) {
  return (
    <View pointerEvents="none" style={styles.centre}>
      {props.specs.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            width: p.w,
            height: p.h,
            borderRadius: 1.5,
            backgroundColor: p.color,
            opacity: props.progress.interpolate({
              inputRange: [0, 0.6, 1],
              outputRange: [1, 1, 0],
            }),
            transform: [
              {
                translateX: props.progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, p.dx],
                }),
              },
              {
                translateY: props.progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, p.dy],
                }),
              },
              {
                rotate: props.progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', p.spin],
                }),
              },
              {
                scale: props.progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0.5],
                }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}

// The LOCAL burst, mounted inside the Follow control. `nonce` fires it:
// each increment restarts the one-shot from zero (rapid re-follows
// restart rather than stack). Mounted only while flying — a list of
// fifty Follow buttons carries no idle particle views.
export function FollowBurst(props: {
  nonce: number;
  palette: string[];
  count?: number;
  radius?: number;
  durationMs?: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const [active, setActive] = useState(false);
  const specs = useRef<ParticleSpec[]>([]);
  useEffect(() => {
    if (props.nonce === 0) return;
    specs.current = particles(props.count ?? 16, props.radius ?? 60, props.palette);
    progress.setValue(0);
    setActive(true);
    Animated.timing(progress, {
      toValue: 1,
      duration: props.durationMs ?? 600,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setActive(false);
    });
    // Palette/count changes never re-fire a flight — only the nonce does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.nonce]);
  if (!active) return null;
  return <Burst progress={progress} specs={specs.current} />;
}

// ─── The grand, once-per-lifetime version ─────────────────────────────
//
// Screen-scale burst for the device's very first follow, hosted at the
// app root (like the toast host) so it can cover everything. The
// Follow control decides WHEN (it owns the stored flag); this module
// only knows HOW.

type GrandListener = (palette: string[]) => void;
let grandListener: GrandListener | null = null;

export function celebrateGrand(palette: string[]): void {
  grandListener?.(palette);
}

export function CelebrationHost(): ReactNode {
  const { width, height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const [specs, setSpecs] = useState<ParticleSpec[] | null>(null);
  useEffect(() => {
    grandListener = (palette) => {
      const radius = Math.hypot(width, height) / 2;
      // ~5x the local burst's count at ~3x the piece size (Round 3):
      // once per lifetime, so the extra particles are cheap.
      setSpecs(particles(80, radius, palette, 3));
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setSpecs(null);
      });
    };
    return () => {
      grandListener = null;
    };
  }, [width, height, progress]);
  if (!specs) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Burst progress={progress} specs={specs} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Particles fan out from this point — the centre of whatever the
  // burst is mounted in.
  centre: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
