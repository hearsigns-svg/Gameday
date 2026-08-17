// Region, one level down (Prompt 27 D): the one genuinely long list on
// the settings page, made once and rarely revisited — so the settings
// row shows the value and this screen holds the choices.

import { useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { RootScreenProps } from '../../core/navigation';
import { spacing, type, useTheme } from '../../core/tokens';
import { REGIONS, RegionKey, regionLabel } from '../../core/region';
import {
  detectedRegion,
  regionOverride,
  setRegionOverride,
} from '../../core/regionStore';
import { refreshPriorities } from '../follows/data/browsePriority';

function Row(props: { label: string; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: props.selected }}
      accessibilityLabel={props.label}
      onPress={props.onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 48,
        paddingHorizontal: spacing.l,
        borderBottomWidth: 0.5,
        borderColor: t.border,
      }}
    >
      <Text style={[type.body, { color: t.textPrimary, flex: 1 }]}>
        {props.label}
      </Text>
      {props.selected ? (
        <Text style={[type.body, { color: t.primary, fontWeight: '700' }]}>✓</Text>
      ) : null}
    </Pressable>
  );
}

export default function RegionScreen({ navigation }: RootScreenProps<'Region'>) {
  const t = useTheme();
  const [region, setRegion] = useState<RegionKey | null>(regionOverride());

  const choose = (key: RegionKey | null) => {
    setRegionOverride(key);
    setRegion(key);
    void refreshPriorities();
    navigation.goBack();
  };

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: spacing.l }}
    >
      <Row
        label={`Match my device (${regionLabel(detectedRegion())})`}
        selected={region === null}
        onPress={() => choose(null)}
      />
      {REGIONS.map((r) => (
        <Row
          key={r.key}
          label={r.label}
          selected={region === r.key}
          onPress={() => choose(r.key)}
        />
      ))}
      <Row
        label="Default"
        selected={region === 'default'}
        onPress={() => choose('default')}
      />
      <Text style={[type.caption, { color: t.textSecondary, marginTop: spacing.l }]}>
        Region changes the order sports and competitions appear in, and what
        a few of them are called — never what you can follow. No location is
        used.
      </Text>
    </ScrollView>
  );
}
