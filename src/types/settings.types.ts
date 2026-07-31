/**
 * Screen Settings Types - Per-screen UI preferences
 */

export interface ScreenSettings {
  orientation: 'white' | 'black';
  engineEnabled: boolean;
  coordinatesVisible: boolean;
  moveHistoryVisible: boolean;
  boardSize: 'tiny' | 'small' | 'medium' | 'large' | 'xlarge';
  visibleTabs: {
    yourGames: boolean;
    masterGames: boolean;
    findPosition: boolean;
  };
}

export interface AllScreenSettings {
  analysis: ScreenSettings;
  repertoire: ScreenSettings;
  gameReview: ScreenSettings;
  training: ScreenSettings;
}

export type ScreenKey = keyof AllScreenSettings;
