// Photo credits. CC BY / BY-SA require attribution in the manner
// specified — a credits list is the standard way to honour that for
// images rendered small (row thumbnails), alongside the inline credit
// the hero card already carries.

import { FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { RootScreenProps } from '../../core/navigation';
import { spacing, type, useTheme } from '../../core/tokens';
import { photoCredits } from '../follows/data/photoCache';

export default function CreditsScreen(_props: RootScreenProps<'Credits'>) {
  const t = useTheme();
  const credits = photoCredits();

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Text
        style={[type.body, { color: t.textSecondary, padding: spacing.l }]}
      >
        Photographs come from Wikimedia Commons under licences that permit
        reuse. Each is credited to its photographer below.
      </Text>
      {/* TheSportsDB attribution: their terms require crediting them as
          the data source — a condition of the service, honoured here
          (Prompt 9b). */}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Open TheSportsDB"
        onPress={() => void Linking.openURL('https://www.thesportsdb.com')}
      >
        <Text
          style={[
            type.secondary,
            { color: t.textSecondary, paddingHorizontal: spacing.l, paddingBottom: spacing.m },
          ]}
        >
          Event data for several sports comes from TheSportsDB
          (thesportsdb.com).
        </Text>
      </Pressable>
      {credits.length === 0 ? (
        <Text
          style={[
            type.secondary,
            { color: t.textSecondary, paddingHorizontal: spacing.l },
          ]}
        >
          No photographs loaded yet.
        </Text>
      ) : (
        <FlatList
          data={credits}
          keyExtractor={(c) => c.subject}
          renderItem={({ item }) => (
            <View style={[styles.row, { borderColor: t.border }]}>
              <Text style={[type.body, { color: t.textPrimary }]}>
                {item.subject}
              </Text>
              <Pressable
                accessibilityRole={item.art.sourceUrl ? 'link' : undefined}
                accessibilityLabel={
                  item.art.sourceUrl
                    ? `Open source page for ${item.subject}`
                    : undefined
                }
                onPress={
                  item.art.sourceUrl
                    ? () => void Linking.openURL(item.art.sourceUrl as string)
                    : undefined
                }
              >
                <Text style={[type.caption, { color: t.textSecondary }]}>
                  {item.art.artist || 'Wikimedia Commons'} · {item.art.licence}
                  {item.art.sourceUrl ? ' · source' : ''}
                </Text>
              </Pressable>
            </View>
          )}
          ListFooterComponent={
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Open Wikimedia Commons licence information"
              onPress={() =>
                void Linking.openURL('https://commons.wikimedia.org/wiki/Commons:Licensing')
              }
              style={styles.row}
            >
              <Text style={[type.secondary, { color: t.primary }]}>
                About these licences
              </Text>
            </Pressable>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
});
