// Route params: three tabs with three jobs (Home / Following /
// Schedule); browse and preferences push over the tabs in a root stack.

import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

export type TabParamList = {
  Home: undefined;
  Following: undefined;
  Schedule: undefined;
};

export type RootStackParamList = {
  Welcome: undefined; // first run only
  CalendarPriming: undefined; // primed explainer before the OS dialog
  Tabs: NavigatorScreenParams<TabParamList>;
  SportPicker: undefined;
  LeagueList: { sportKey: string };
  TeamList: {
    sportKey: string;
    leagueId: number | string;
    leagueName: string;
    teamPollPath?: string;
  };
  Preferences: undefined;
  ThemeGallery: undefined; // dev-only design QA screen
};

export type RootScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type TabScreenProps<T extends keyof TabParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<TabParamList, T>,
    NativeStackScreenProps<RootStackParamList>
  >;
