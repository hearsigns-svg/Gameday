// Route params for the root stack.

export type RootStackParamList = {
  Home: undefined;
  SportPicker: undefined;
  LeagueList: { sportKey: string };
  TeamList: { leagueId: number; leagueName: string };
  Preferences: undefined;
};
