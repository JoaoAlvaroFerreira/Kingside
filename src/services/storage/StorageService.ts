import AsyncStorage from '@react-native-async-storage/async-storage';
import { Repertoire, UserGame, MasterGame, ReviewCard, LineStats, GameReviewStatus } from '@types';

const KEYS = {
  REPERTOIRES: '@kingside/repertoires',
  USER_GAMES: '@kingside/user-games',
  MASTER_GAMES: '@kingside/master-games',
  REVIEW_CARDS: '@kingside/cards',
  LINE_STATS: '@kingside/line-stats',
  SETTINGS: '@kingside/settings',
  REVIEW_SETTINGS: '@kingside/review-settings',
  GAME_REVIEW_STATUSES: '@kingside/game-review-statuses',
};

// Helper to revive Date objects when parsing JSON
function dateReviver(_key: string, value: any): any {
  if (typeof value === 'string') {
    const datePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    if (datePattern.test(value)) {
      return new Date(value);
    }
  }
  return value;
}

export const StorageService = {
  // Repertoires
  async saveRepertoires(repertoires: Repertoire[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.REPERTOIRES, JSON.stringify(repertoires));
  },

  async loadRepertoires(): Promise<Repertoire[]> {
    const data = await AsyncStorage.getItem(KEYS.REPERTOIRES);
    if (!data) return [];
    return JSON.parse(data, dateReviver);
  },

  // User Games (player's own games)
  async saveUserGames(games: UserGame[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.USER_GAMES, JSON.stringify(games));
  },

  async loadUserGames(): Promise<UserGame[]> {
    const data = await AsyncStorage.getItem(KEYS.USER_GAMES);
    if (!data) return [];
    return JSON.parse(data, dateReviver);
  },

  // Master Games (separate library)
  async saveMasterGames(games: MasterGame[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.MASTER_GAMES, JSON.stringify(games));
  },

  async loadMasterGames(): Promise<MasterGame[]> {
    const data = await AsyncStorage.getItem(KEYS.MASTER_GAMES);
    if (!data) return [];
    return JSON.parse(data, dateReviver);
  },

  // Review Cards
  async saveCards(cards: ReviewCard[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.REVIEW_CARDS, JSON.stringify(cards));
  },

  async loadCards(): Promise<ReviewCard[]> {
    const data = await AsyncStorage.getItem(KEYS.REVIEW_CARDS);
    if (!data) return [];
    return JSON.parse(data, dateReviver);
  },

  // Line Stats (for training)
  async saveLineStats(stats: LineStats[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.LINE_STATS, JSON.stringify(stats));
  },

  async loadLineStats(): Promise<LineStats[]> {
    const data = await AsyncStorage.getItem(KEYS.LINE_STATS);
    if (!data) return [];
    return JSON.parse(data, dateReviver);
  },

  // Settings
  async saveSettings(settings: Record<string, any>): Promise<void> {
    await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
  },

  async loadSettings(): Promise<Record<string, any>> {
    const data = await AsyncStorage.getItem(KEYS.SETTINGS);
    if (!data) return {};
    return JSON.parse(data);
  },

  // Game Review Statuses
  async saveGameReviewStatuses(statuses: GameReviewStatus[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.GAME_REVIEW_STATUSES, JSON.stringify(statuses));
  },

  async loadGameReviewStatuses(): Promise<GameReviewStatus[]> {
    const data = await AsyncStorage.getItem(KEYS.GAME_REVIEW_STATUSES);
    if (!data) return [];
    return JSON.parse(data, dateReviver);
  },

  // Generic methods for arbitrary keys
  async save<T>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },

  async load<T>(key: string): Promise<T | null> {
    const data = await AsyncStorage.getItem(key);
    if (!data) return null;
    return JSON.parse(data, dateReviver);
  },

  // Clear all data (use with caution!)
  async clearAll(): Promise<void> {
    await AsyncStorage.multiRemove(Object.values(KEYS));
  },
};
