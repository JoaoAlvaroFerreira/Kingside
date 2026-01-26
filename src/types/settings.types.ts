/**
 * Screen Settings Types - Per-screen UI preferences
 */

export interface ScreenSettings {
  orientation: 'white' | 'black';
  engineEnabled: boolean;
  evalBarVisible: boolean;
  coordinatesVisible: boolean;
  moveHistoryVisible: boolean;
}

export interface AllScreenSettings {
  analysis: ScreenSettings;
  repertoire: ScreenSettings;
  gameReview: ScreenSettings;
  training: ScreenSettings;
}

export type ScreenKey = keyof AllScreenSettings;
