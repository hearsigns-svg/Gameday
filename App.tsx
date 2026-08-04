import { Ionicons } from '@expo/vector-icons';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  useNavigation,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  createNativeStackNavigator,
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Pressable, useColorScheme, View } from 'react-native';
// Side effect: defines background tasks at module scope (headless launches).
import { registerBackgroundSync } from './src/features/calendar-sync/backgroundSync';
import {
  runSync,
  shouldAutoSync,
} from './src/features/calendar-sync/syncEngine';
import { hasSeenWelcome } from './src/features/calendar-sync/data/calendarChoice';
import { loadFollowables } from './src/features/follows/data/followStore';
import { RootStackParamList, TabParamList } from './src/core/navigation';
import { ToastHost } from './src/core/toast';
import { palette } from './src/core/tokens';
import SearchScreen from './src/features/follows/screens/SearchScreen';
import WelcomeScreen from './src/features/onboarding/WelcomeScreen';
import CalendarPrimingScreen from './src/features/calendar-sync/screens/CalendarPrimingScreen';
import HomeScreen from './src/features/follows/screens/HomeScreen';
import FollowingScreen from './src/features/follows/screens/FollowingScreen';
import ScheduleScreen from './src/features/calendar-sync/screens/ScheduleScreen';
import FixtureScreen from './src/features/calendar-sync/screens/FixtureScreen';
import AthleteListScreen from './src/features/follows/screens/AthleteListScreen';
import LeagueListScreen from './src/features/follows/screens/LeagueListScreen';
import SportPickerScreen from './src/features/follows/screens/SportPickerScreen';
import TeamListScreen from './src/features/follows/screens/TeamListScreen';
import TeamScreen from './src/features/follows/screens/TeamScreen';
import PreferencesScreen from './src/features/settings/PreferencesScreen';
import CalendarTargetScreen from './src/features/settings/CalendarTargetScreen';
import CreditsScreen from './src/features/settings/CreditsScreen';
import ThemeGalleryScreen from './src/features/settings/ThemeGalleryScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TAB_ICONS: Record<
  keyof TabParamList,
  { active: keyof typeof Ionicons.glyphMap; idle: keyof typeof Ionicons.glyphMap }
> = {
  Home: { active: 'home', idle: 'home-outline' },
  Following: { active: 'heart', idle: 'heart-outline' },
  Schedule: { active: 'calendar', idle: 'calendar-outline' },
};

function SettingsButton() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const scheme = useColorScheme();
  const t = scheme === 'dark' ? palette.dark : palette.light;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Calendar preferences"
      onPress={() => navigation.navigate('Preferences')}
      hitSlop={12}
      style={{ paddingHorizontal: 8 }}
    >
      {({ pressed }) => (
        <Ionicons
          name="settings-outline"
          size={22}
          color={t.textPrimary}
          style={{ opacity: pressed ? 0.6 : 1 }}
        />
      )}
    </Pressable>
  );
}

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons
            name={TAB_ICONS[route.name][focused ? 'active' : 'idle']}
            size={size}
            color={color}
          />
        ),
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'KickOffCal',
          tabBarLabel: 'Home',
          headerRight: () => <SettingsButton />,
        }}
      />
      <Tab.Screen name="Following" component={FollowingScreen} />
      <Tab.Screen name="Schedule" component={ScheduleScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const scheme = useColorScheme();
  const t = scheme === 'dark' ? palette.dark : palette.light;
  // Evaluated once at launch: first run (never welcomed, nothing
  // followed) opens on the welcome screen; everyone else on the tabs.
  const [initialRoute] = useState<keyof RootStackParamList>(() =>
    !hasSeenWelcome() && loadFollowables().length === 0 ? 'Welcome' : 'Tabs',
  );

  useEffect(() => {
    void registerBackgroundSync();
    void import('./src/features/calendar-sync/data/deviceRegistry').then(
      (m) => m.registerDevice(),
    );
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
    <View style={{ flex: 1 }}>
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}
        >
        <Stack.Screen
          name="Welcome"
          component={WelcomeScreen}
          options={{ headerShown: false, gestureEnabled: false }}
        />
        {/* Two lives: a first-run STEP (pushed, not modal — Welcome
            REPLACES itself, so there is no back button and the screen's
            own "Not now" is the only exit), and the in-context modal
            reached later from a banner or a follow. The header stays on
            in both: nothing in this app carries its own safe-area
            inset, so removing it puts the title under the status bar. */}
        <Stack.Screen
          name="CalendarPriming"
          component={CalendarPrimingScreen}
          options={({ route }) =>
            route.params?.onboarding
              ? { title: 'Your calendar', gestureEnabled: false }
              : { presentation: 'modal', title: 'Your calendar' }
          }
        />
        <Stack.Screen
          name="Tabs"
          component={Tabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Search"
          component={SearchScreen}
          options={{ title: 'Search' }}
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
          name="AthleteList"
          component={AthleteListScreen}
          options={{ title: 'Athletes' }}
        />
        <Stack.Screen
          name="TeamList"
          component={TeamListScreen}
          options={({ route }) => ({ title: route.params.leagueName })}
        />
        <Stack.Screen
          name="Team"
          component={TeamScreen}
          options={({ route }) => ({ title: route.params.name })}
        />
        <Stack.Screen
          name="Fixture"
          component={FixtureScreen}
          options={({ route }) => ({ title: route.params.title })}
        />
        <Stack.Screen
          name="Preferences"
          component={PreferencesScreen}
          options={{ title: 'Preferences' }}
        />
        <Stack.Screen
          name="CalendarTarget"
          component={CalendarTargetScreen}
          options={{ title: 'Calendar' }}
        />
        <Stack.Screen
          name="Credits"
          component={CreditsScreen}
          options={{ title: 'Photo credits' }}
        />
        {__DEV__ ? (
          <Stack.Screen
            name="ThemeGallery"
            component={ThemeGalleryScreen}
            options={{ title: 'Theme gallery (dev)' }}
          />
        ) : null}
        </Stack.Navigator>
        <StatusBar style="auto" />
      </NavigationContainer>
      <ToastHost />
    </View>
  );
}
