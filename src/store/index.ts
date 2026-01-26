/**
 * Root Zustand Store
 */

import { create } from 'zustand';
import {
  Repertoire,
  UserGame,
  MasterGame,
  ReviewCard,
  LineStats,
  TrainingSession,
  ReviewSettings,
  GameReviewStatus,
  GameReviewSession,
  RepertoireColor,
  AllScreenSettings,
  ScreenKey,
  ScreenSettings,
} from '@types';
import { StorageService } from '@services/storage/StorageService';
import { SettingsService } from '@services/settings/SettingsService';
import { ScreenSettingsService } from '@services/settings/ScreenSettingsService';
import { GameReviewService } from '@services/gameReview/GameReviewService';
import { EngineService } from '@services/engine/EngineService';
import { DatabaseService } from '@services/database/DatabaseService';
import { MigrationService } from '@services/database/MigrationService';

interface AppState {
  // Data
  repertoires: Repertoire[];
  userGamesCount: number;       // Count of user games (stored in SQLite)
  masterGamesCount: number;     // Count of master games (stored in SQLite)
  reviewCards: ReviewCard[];
  lineStats: LineStats[];      // Training line statistics
  currentTrainingSession: TrainingSession | null;
  reviewSettings: ReviewSettings;
  screenSettings: AllScreenSettings;
  gameReviewStatuses: GameReviewStatus[];
  currentReviewSession: GameReviewSession | null;
  isLoading: boolean;

  // Actions
  initialize: () => Promise<void>;

  // Repertoire actions
  addRepertoire: (r: Repertoire) => Promise<void>;
  updateRepertoire: (r: Repertoire) => Promise<void>;
  deleteRepertoire: (id: string) => Promise<void>;

  // Game actions (use database, not in-memory arrays)
  addUserGames: (games: UserGame[]) => Promise<void>;
  deleteUserGame: (id: string) => Promise<void>;
  deleteAllUserGames: () => Promise<void>;
  getUserGameById: (id: string) => Promise<UserGame | null>;
  refreshUserGamesCount: () => Promise<void>;
  addMasterGames: (games: MasterGame[]) => Promise<void>;
  deleteMasterGame: (id: string) => Promise<void>;
  deleteAllMasterGames: () => Promise<void>;
  getMasterGameById: (id: string) => Promise<MasterGame | null>;
  refreshMasterGamesCount: () => Promise<void>;

  // Review card actions
  addCards: (cards: ReviewCard[]) => Promise<void>;
  updateCard: (card: ReviewCard) => Promise<void>;
  getDueCards: () => ReviewCard[];

  // Training actions
  loadLineStats: () => Promise<void>;
  saveLineStats: (stats: LineStats[]) => Promise<void>;
  updateLineStats: (stat: LineStats) => Promise<void>;
  setTrainingSession: (session: TrainingSession | null) => void;
  getDueLineStats: (repertoireId: string, chapterId?: string) => LineStats[];

  // Game Review actions
  loadReviewSettings: () => Promise<void>;
  saveReviewSettings: (settings: Partial<ReviewSettings>) => Promise<void>;
  startGameReview: (gameId: string, userColor: RepertoireColor) => Promise<void>;
  advanceReviewMove: (direction: 'next' | 'prev' | 'nextKey' | 'prevKey') => void;
  completeGameReview: () => Promise<void>;
  setReviewSession: (session: GameReviewSession | null) => void;
  getUnreviewedGames: () => Promise<UserGame[]>;

  // Screen Settings actions
  loadScreenSettings: () => Promise<void>;
  updateScreenSettings: (screenKey: ScreenKey, settings: Partial<ScreenSettings>) => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  repertoires: [],
  userGamesCount: 0,
  masterGamesCount: 0,
  reviewCards: [],
  lineStats: [],
  currentTrainingSession: null,
  reviewSettings: SettingsService.getDefaults(),
  screenSettings: ScreenSettingsService.getDefaults(),
  gameReviewStatuses: [],
  currentReviewSession: null,
  isLoading: true,

  initialize: async () => {
    console.log('Store: Initializing...');

    // Initialize database first
    await DatabaseService.initialize();

    // Migrate existing AsyncStorage data to SQLite if needed
    await MigrationService.migrateIfNeeded();

    const [repertoires, userGamesCount, masterGamesCount, reviewCards, lineStats, reviewSettings, screenSettings, gameReviewStatuses] = await Promise.all([
      StorageService.loadRepertoires(),
      DatabaseService.getUserGamesCount(),
      DatabaseService.getMasterGamesCount(),
      StorageService.loadCards(),
      StorageService.loadLineStats(),
      SettingsService.loadSettings(),
      ScreenSettingsService.loadSettings(),
      StorageService.loadGameReviewStatuses(),
    ]);

    // Configure engine with loaded settings
    EngineService.setEndpoint(reviewSettings.engine.apiEndpoint);
    const { StockfishService } = await import('@services/engine/StockfishService');
    StockfishService.setEngineType(reviewSettings.engine.engineType);
    StockfishService.setExternalEndpoint(reviewSettings.engine.apiEndpoint);

    console.log('Store: Loaded data:', {
      repertoires: repertoires.length,
      userGamesCount,
      masterGamesCount,
      reviewCards: reviewCards.length,
      lineStats: lineStats.length,
      gameReviewStatuses: gameReviewStatuses.length,
    });
    set({ repertoires, userGamesCount, masterGamesCount, reviewCards, lineStats, reviewSettings, screenSettings, gameReviewStatuses, isLoading: false });
  },

  addRepertoire: async (repertoire) => {
    console.log('Store: Adding repertoire:', repertoire.name);
    const repertoires = [...get().repertoires, repertoire];
    console.log('Store: Total repertoires:', repertoires.length);
    await StorageService.saveRepertoires(repertoires);
    set({ repertoires });
    console.log('Store: Repertoire added and saved');
  },

  updateRepertoire: async (updatedRepertoire) => {
    console.log('Store: Updating repertoire:', updatedRepertoire.name);
    const repertoires = get().repertoires.map(r =>
      r.id === updatedRepertoire.id ? updatedRepertoire : r
    );
    await StorageService.saveRepertoires(repertoires);
    set({ repertoires });
    console.log('Store: Repertoire updated and saved');
  },

  deleteRepertoire: async (id) => {
    console.log('Store: Deleting repertoire:', id);
    const currentRepertoires = get().repertoires;
    const repertoireToDelete = currentRepertoires.find(r => r.id === id);

    if (!repertoireToDelete) {
      console.log('Store: Repertoire not found:', id);
      return;
    }

    console.log('Store: Found repertoire to delete:', repertoireToDelete.name);
    const repertoires = currentRepertoires.filter(r => r.id !== id);
    console.log('Store: Repertoires after filter:', repertoires.length, 'was:', currentRepertoires.length);

    // Delete associated review cards
    const currentReviewCards = get().reviewCards;
    const reviewCards = currentReviewCards.filter(card => {
      // Keep cards that don't belong to any chapter in this repertoire
      return !repertoireToDelete.chapters.some(ch => ch.id === card.chapterId);
    });
    console.log('Store: Review cards after filter:', reviewCards.length, 'was:', currentReviewCards.length);

    // Delete associated line stats
    const currentLineStats = get().lineStats;
    const lineStats = currentLineStats.filter(stat => stat.repertoireId !== id);
    console.log('Store: Line stats after filter:', lineStats.length, 'was:', currentLineStats.length);

    await Promise.all([
      StorageService.saveRepertoires(repertoires),
      StorageService.saveCards(reviewCards),
      StorageService.saveLineStats(lineStats),
    ]);
    set({ repertoires, reviewCards, lineStats });
    console.log('Store: Repertoire deleted successfully');
  },

  addUserGames: async (newGames) => {
    console.log('Store: Adding user games:', newGames.length);
    await DatabaseService.addUserGames(newGames);
    const userGamesCount = await DatabaseService.getUserGamesCount();
    set({ userGamesCount });
    console.log('Store: User games added, total:', userGamesCount);
  },

  deleteUserGame: async (id) => {
    await DatabaseService.deleteUserGame(id);
    const userGamesCount = await DatabaseService.getUserGamesCount();
    set({ userGamesCount });
  },

  deleteAllUserGames: async () => {
    console.log('Store: Deleting all user games');
    await DatabaseService.deleteAllUserGames();
    set({ userGamesCount: 0 });
    console.log('Store: All user games deleted');
  },

  getUserGameById: async (id) => {
    return await DatabaseService.getUserGameById(id);
  },

  refreshUserGamesCount: async () => {
    const userGamesCount = await DatabaseService.getUserGamesCount();
    set({ userGamesCount });
  },

  addMasterGames: async (newGames) => {
    console.log('Store: Adding master games:', newGames.length);
    await DatabaseService.addMasterGames(newGames);
    const masterGamesCount = await DatabaseService.getMasterGamesCount();
    set({ masterGamesCount });
    console.log('Store: Master games added, total:', masterGamesCount);
  },

  deleteMasterGame: async (id) => {
    await DatabaseService.deleteMasterGame(id);
    const masterGamesCount = await DatabaseService.getMasterGamesCount();
    set({ masterGamesCount });
  },

  deleteAllMasterGames: async () => {
    console.log('Store: Deleting all master games');
    await DatabaseService.deleteAllMasterGames();
    set({ masterGamesCount: 0 });
    console.log('Store: All master games deleted');
  },

  getMasterGameById: async (id) => {
    return await DatabaseService.getMasterGameById(id);
  },

  refreshMasterGamesCount: async () => {
    const masterGamesCount = await DatabaseService.getMasterGamesCount();
    set({ masterGamesCount });
  },

  addCards: async (newCards) => {
    const reviewCards = [...get().reviewCards, ...newCards];
    await StorageService.saveCards(reviewCards);
    set({ reviewCards });
  },

  updateCard: async (updatedCard) => {
    const reviewCards = get().reviewCards.map(c =>
      c.id === updatedCard.id ? updatedCard : c
    );
    await StorageService.saveCards(reviewCards);
    set({ reviewCards });
  },

  getDueCards: () => {
    const now = new Date();
    return get().reviewCards.filter(c => new Date(c.nextReviewDate) <= now);
  },

  // Training actions
  loadLineStats: async () => {
    const lineStats = await StorageService.loadLineStats();
    set({ lineStats });
  },

  saveLineStats: async (lineStats) => {
    await StorageService.saveLineStats(lineStats);
    set({ lineStats });
  },

  updateLineStats: async (updatedStat) => {
    const lineStats = get().lineStats;
    const index = lineStats.findIndex(s => s.lineId === updatedStat.lineId);

    let newLineStats: LineStats[];
    if (index >= 0) {
      // Update existing stat
      newLineStats = lineStats.map(s => s.lineId === updatedStat.lineId ? updatedStat : s);
    } else {
      // Add new stat
      newLineStats = [...lineStats, updatedStat];
    }

    await StorageService.saveLineStats(newLineStats);
    set({ lineStats: newLineStats });
  },

  setTrainingSession: (session) => {
    set({ currentTrainingSession: session });
  },

  getDueLineStats: (repertoireId: string, chapterId?: string) => {
    const now = new Date();
    return get().lineStats.filter(stat => {
      const isRepertoireMatch = stat.repertoireId === repertoireId;
      const isChapterMatch = !chapterId || stat.chapterId === chapterId;
      const isDue = new Date(stat.nextReviewDate) <= now;
      return isRepertoireMatch && isChapterMatch && isDue;
    });
  },

  // Game Review actions
  loadReviewSettings: async () => {
    const reviewSettings = await SettingsService.loadSettings();
    EngineService.setEndpoint(reviewSettings.engine.apiEndpoint);
    const { StockfishService } = await import('@services/engine/StockfishService');
    StockfishService.setEngineType(reviewSettings.engine.engineType);
    StockfishService.setExternalEndpoint(reviewSettings.engine.apiEndpoint);
    set({ reviewSettings });
  },

  saveReviewSettings: async (updates) => {
    const current = get().reviewSettings;
    const updated = await SettingsService.updateSettings(updates);

    // Update engine configuration if changed
    if (updates.engine?.apiEndpoint) {
      EngineService.setEndpoint(updates.engine.apiEndpoint);
    }
    const { StockfishService } = await import('@services/engine/StockfishService');
    if (updates.engine?.engineType) {
      StockfishService.setEngineType(updates.engine.engineType);
    }
    if (updates.engine?.apiEndpoint) {
      StockfishService.setExternalEndpoint(updates.engine.apiEndpoint);
    }

    set({ reviewSettings: updated });
  },

  startGameReview: async (gameId, userColor) => {
    const state = get();
    const game = await DatabaseService.getUserGameById(gameId);

    if (!game) {
      throw new Error(`Game not found: ${gameId}`);
    }

    console.log('Store: Starting game review for:', game.id, 'userColor:', userColor);

    // Get all master games for reference (consider optimization later)
    const masterGames = await DatabaseService.getAllMasterGames();

    const session = await GameReviewService.startReview(
      game,
      userColor,
      state.repertoires,
      masterGames,
      state.reviewSettings.thresholds,
      state.reviewSettings.engine.depth,
      state.reviewSettings.engine.timeout
    );

    set({ currentReviewSession: session });
    console.log('Store: Game review session started, key moves:', session.keyMoveIndices.length);
  },

  advanceReviewMove: (direction) => {
    const session = get().currentReviewSession;
    if (!session) return;

    let newIndex = session.currentMoveIndex;

    switch (direction) {
      case 'next':
        newIndex = Math.min(session.moves.length - 1, newIndex + 1);
        break;
      case 'prev':
        newIndex = Math.max(0, newIndex - 1);
        break;
      case 'nextKey':
        const nextKey = session.keyMoveIndices.find(i => i > newIndex);
        if (nextKey !== undefined) newIndex = nextKey;
        break;
      case 'prevKey':
        const prevKey = session.keyMoveIndices
          .slice()
          .reverse()
          .find(i => i < newIndex);
        if (prevKey !== undefined) newIndex = prevKey;
        break;
    }

    set({
      currentReviewSession: {
        ...session,
        currentMoveIndex: newIndex,
      },
    });
  },

  completeGameReview: async () => {
    const session = get().currentReviewSession;
    if (!session) return;

    // Mark session as complete
    const completedSession: GameReviewSession = {
      ...session,
      isComplete: true,
      completedAt: new Date(),
    };

    // Create or update review status
    const status = GameReviewService.createReviewStatus(completedSession);
    const statuses = get().gameReviewStatuses;
    const index = statuses.findIndex(s => s.gameId === session.gameId);

    let newStatuses: GameReviewStatus[];
    if (index >= 0) {
      newStatuses = statuses.map(s => (s.gameId === session.gameId ? status : s));
    } else {
      newStatuses = [...statuses, status];
    }

    await StorageService.saveGameReviewStatuses(newStatuses);
    set({ gameReviewStatuses: newStatuses, currentReviewSession: null });
    console.log('Store: Game review completed');
  },

  setReviewSession: (session) => {
    set({ currentReviewSession: session });
  },

  getUnreviewedGames: async () => {
    const state = get();
    const reviewedGameIds = new Set(
      state.gameReviewStatuses.filter(s => s.reviewed).map(s => s.gameId)
    );
    const allUserGames = await DatabaseService.getAllUserGames();
    return allUserGames.filter(g => !reviewedGameIds.has(g.id));
  },

  // Screen Settings actions
  loadScreenSettings: async () => {
    const screenSettings = await ScreenSettingsService.loadSettings();
    set({ screenSettings });
  },

  updateScreenSettings: async (screenKey, settings) => {
    const updated = await ScreenSettingsService.updateScreenSettings(screenKey, settings);
    set({ screenSettings: updated });
  },
}));
