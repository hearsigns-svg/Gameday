// Sport picker: the 11 launch sports; disabled ones say why.

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlatList, Text, View } from 'react-native';
import { ListRow } from '../../../core/components';
import { RootStackParamList } from '../../../core/navigation';
import { type, useTheme } from '../../../core/tokens';
import { SPORTS } from '../domain/sportsConfig';

type Props = NativeStackScreenProps<RootStackParamList, 'SportPicker'>;

export default function SportPickerScreen({ navigation }: Props) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <FlatList
        data={SPORTS}
        keyExtractor={(s) => s.key}
        renderItem={({ item }) => (
          <ListRow
            title={item.label}
            caption={item.enabled ? undefined : 'Coming soon'}
            glyph={item.glyph}
            disabled={!item.enabled}
            accessibilityLabel={
              item.enabled ? item.label : `${item.label}, coming soon`
            }
            onPress={
              item.enabled
                ? () => navigation.navigate('LeagueList', { sportKey: item.key })
                : undefined
            }
            right={
              item.enabled ? (
                <Text style={[type.body, { color: t.textSecondary }]}>›</Text>
              ) : undefined
            }
          />
        )}
      />
    </View>
  );
}
