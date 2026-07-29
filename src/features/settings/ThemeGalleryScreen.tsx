// Dev-only design QA: the worst-case identities the token system must
// survive, rendered live in the current colour scheme. Not routed in
// production builds.

import { ScrollView, Text, View } from 'react-native';
import { HeroCard, SportPill } from '../../core/components';
import { useColorSchemeMode } from '../../core/useColorSchemeMode';
import { contrastRatio, teamTheme } from '../../core/teamTheme';
import { spacing, type, useTheme } from '../../core/tokens';

const CASES: Array<{ name: string; hex: string | null; glyph: string }> = [
  { name: 'Real Madrid (white)', hex: '#FFFFFF', glyph: '⚽' },
  { name: 'Norwich (yellow)', hex: '#FFF200', glyph: '⚽' },
  { name: 'Man City (sky)', hex: '#6CABDD', glyph: '⚽' },
  { name: 'Lakers (gold)', hex: '#FDB927', glyph: '🏀' },
  { name: 'McLaren (papaya)', hex: '#FF8000', glyph: '🏎️' },
  { name: 'Newcastle (near-black)', hex: '#131313', glyph: '⚽' },
  { name: 'F1 (red)', hex: '#E10600', glyph: '🏎️' },
  { name: 'No colour (athlete)', hex: null, glyph: '🎾' },
];

export default function ThemeGalleryScreen() {
  const t = useTheme();
  const mode = useColorSchemeMode();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ paddingVertical: spacing.l, gap: spacing.l }}
    >
      {CASES.map((c) => {
        const th = teamTheme(c.hex, mode);
        const ratio = contrastRatio(th.accent, t.bg).toFixed(1);
        return (
          <View key={c.name} style={{ gap: spacing.s }}>
            <Text
              style={[
                type.caption,
                { color: t.textSecondary, paddingHorizontal: spacing.l },
              ]}
            >
              {c.name} · raw {c.hex ?? '—'} · accent {th.accent} ({ratio}:1)
            </Text>
            <HeroCard
              title="Home Team v Away Team"
              competition="Worst-case League"
              startUtc={new Date(Date.now() + 3 * 86_400_000).toISOString()}
              status="scheduled"
              glyph={c.glyph}
              theme={th}
            />
            <View
              style={{
                flexDirection: 'row',
                gap: spacing.s,
                paddingHorizontal: spacing.l,
              }}
            >
              <SportPill
                label="Follow"
                glyph={c.glyph}
                theme={th}
                following
                onPress={() => {}}
                accessibilityLabel={`${c.name} filled pill`}
              />
              <SportPill
                label="Browse"
                glyph={c.glyph}
                theme={th}
                onPress={() => {}}
                accessibilityLabel={`${c.name} outline pill`}
              />
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
