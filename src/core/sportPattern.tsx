// Sport-keyed abstract geometry — the generated identity layer
// (Prompt 9b, owner ruling). App-owned drawing only: plain Views with
// borders, no third-party IP, no image assets, works for every fixture
// including the sports where no safe photo source exists. Rendered as
// a low-opacity overlay above the theme gradient and below the type,
// so it can never cost contrast (teamTheme already guarantees the
// gradient carries white).
//
// Five families, deliberately minimal — the point is a quiet textural
// signature per sport, not an illustration:
//   court   — playing-box outline + centre line + service boxes
//   pitch   — centre circle + halfway line
//   ring    — concentric rounded squares (ropes)
//   track   — offset diagonal lanes
//   diamond — rotated square (infield)
// Unknown sports get no pattern at all: the palette and type carry it.

import { DimensionValue, View } from 'react-native';

type Family = 'court' | 'pitch' | 'ring' | 'track' | 'diamond';

const FAMILY: Record<string, Family> = {
  tennis: 'court',
  basketball: 'court',
  soccer: 'pitch',
  rugby: 'pitch',
  nfl: 'pitch',
  cricket: 'pitch',
  'ice-hockey': 'pitch',
  boxing: 'ring',
  ufc: 'ring',
  athletics: 'track',
  motorsport: 'track',
  f1: 'track',
  golf: 'track',
  baseball: 'diamond',
};

export function sportPatternFamily(sportKey: string): Family | null {
  return FAMILY[sportKey] ?? null;
}

// All primitives draw with `color` at the given opacity; callers pass
// the theme's onGradient so the pattern is guaranteed visible-but-quiet
// on any generated poster.
export function SportPattern(props: {
  sportKey: string;
  color: string;
  opacity?: number;
}) {
  const family = sportPatternFamily(props.sportKey);
  if (!family) return null;
  const o = props.opacity ?? 0.12;
  const line = { borderColor: props.color, opacity: o } as const;
  switch (family) {
    case 'court':
      return (
        <View pointerEvents="none" style={abs} accessible={false}>
          <View
            style={[
              line,
              {
                position: 'absolute',
                left: '6%',
                right: '6%',
                top: '14%',
                bottom: '14%',
                borderWidth: 1.5,
                borderRadius: 2,
              },
            ]}
          />
          <View
            style={[
              line,
              {
                position: 'absolute',
                left: '6%',
                right: '6%',
                top: '49%',
                borderTopWidth: 1.5,
              },
            ]}
          />
          <View
            style={[
              line,
              {
                position: 'absolute',
                left: '28%',
                right: '28%',
                top: '26%',
                bottom: '26%',
                borderWidth: 1.5,
              },
            ]}
          />
        </View>
      );
    case 'pitch':
      return (
        <View pointerEvents="none" style={abs} accessible={false}>
          <View
            style={[
              line,
              {
                position: 'absolute',
                left: '58%',
                top: '-20%',
                bottom: '-20%',
                borderLeftWidth: 1.5,
              },
            ]}
          />
          <View
            style={[
              line,
              {
                position: 'absolute',
                left: '38%',
                top: '10%',
                width: 160,
                height: 160,
                borderWidth: 1.5,
                borderRadius: 80,
              },
            ]}
          />
        </View>
      );
    case 'ring':
      return (
        <View pointerEvents="none" style={abs} accessible={false}>
          {(['4%', '10%', '16%'] as DimensionValue[]).map((inset) => (
            <View
              key={String(inset)}
              style={[
                line,
                {
                  position: 'absolute',
                  left: inset,
                  right: inset,
                  top: inset,
                  bottom: inset,
                  borderWidth: 1.5,
                  borderRadius: 14,
                },
              ]}
            />
          ))}
        </View>
      );
    case 'track':
      return (
        <View pointerEvents="none" style={abs} accessible={false}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[
                line,
                {
                  position: 'absolute',
                  left: `${30 + i * 14}%` as DimensionValue,
                  top: '-30%',
                  bottom: '-30%',
                  borderLeftWidth: 1.5,
                  transform: [{ rotate: '24deg' }],
                },
              ]}
            />
          ))}
        </View>
      );
    case 'diamond':
      return (
        <View pointerEvents="none" style={abs} accessible={false}>
          <View
            style={[
              line,
              {
                position: 'absolute',
                right: '8%',
                top: '18%',
                width: 120,
                height: 120,
                borderWidth: 1.5,
                transform: [{ rotate: '45deg' }],
              },
            ]}
          />
        </View>
      );
  }
}

const abs = {
  position: 'absolute' as const,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  overflow: 'hidden' as const,
  borderRadius: 20,
};
