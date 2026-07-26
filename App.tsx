import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, Pressable, Text, useColorScheme } from 'react-native';
// Side effect: defines background tasks at module scope (headless launches).
import { registerBackgroundSync } from './src/features/calendar-sync/backgroundSync';
import {
  runSync,
  shouldAutoSync,
} from './src/features/calendar-sync/syncEngine';
import { RootStackParamList } from './src/core/navigation';
import { palette } from './src/core/tokens';
import HomeScreen from './src/features/follows/screens/HomeScreen';
import LeagueListScreen from './src/features/follows/screens/LeagueListScreen';
import SportPickerScreen from './src/features/follows/screens/SportPickerScreen';
import TeamListScreen from './src/features/follows/screens/TeamListScreen';
import PreferencesScreen from './src/features/settings/PreferencesScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const scheme = useColorScheme();
  const t = scheme === 'dark' ? palette.dark : palette.light;

  useEffect(() => {
    void registerBackgroundSync();
    // Propagation layer 3: always sync on foreground (never on a cold
    // first open — shouldAutoSync gates the permission prompt).
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && shouldAutoSync()) void runSync();
    });
    if (shouldAutoSync()) void runSync();
    return () => sub.remove();
  }, []);

  const navTheme = {
    ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(scheme === 'dark' ? DarkTheme : DefaultTheme).colors,
      background: t.bg,
      card: t.bg,
      text: t.textPrimary,
      primary: t.primary,
      border: t.border,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator>
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={({ navigation }) => ({
            title: 'Gameday',
            headerRight: () => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Calendar preferences"
                onPress={() => navigation.navigate('Preferences')}
                hitSlop={12}
              >
                <Text style={{ fontSize: 20 }}>⚙️</Text>
              </Pressable>
            ),
          })}
        />
        <Stack.Screen
          name="SportPicker"
          component={SportPickerScreen}
          options={{ title: 'Sports' }}
        />
        <Stack.Screen
          name="LeagueList"
          component={LeagueListScreen}
          options={{ title: 'Competitions' }}
        />
        <Stack.Screen
          name="TeamList"
          component={TeamListScreen}
          options={({ route }) => ({ title: route.params.leagueName })}
        />
        <Stack.Screen
          name="Preferences"
          component={PreferencesScreen}
          options={{ title: 'Preferences' }}
        />
      </Stack.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}
