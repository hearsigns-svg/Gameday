// Route params for the root stack.

export type RootStackParamList = {
  Home: undefined;
  SportPicker: undefined;
  LeagueList: { sportKey: string };
  TeamList: {
    sportKey: string;
    leagueId: number | string;
    leagueName: string;
    teamPollPath?: string;
  };
  Preferences: undefined;
};
