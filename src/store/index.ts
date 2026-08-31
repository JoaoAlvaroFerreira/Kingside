/**
 * Root Zustand Store
 */

import { create } from 'zustand';
import {
  Repertoire,
  UserGame,
  MasterGame,
  LineStats,
  TrainingSession,
  ReviewSettings,
  GameReviewStatus,
  GameReviewSession,
  RepertoireColor,
  AllScreenSettings,
  ScreenKey,
  ScreenSettings,
  AnalysisProgress,
} from '@types';
import { SettingsService } from '@services/settings/SettingsService';
import { ScreenSettingsService } from '@services/settings/ScreenSettingsService';
import { GameReviewService } from '@services/gameReview/GameReviewService';
import { EngineAnalyzer } from '@services/engine/EngineAnalyzer';
import { stockfishBridge } from '@services/engine/StockfishBridge';
import { DatabaseService, DatabaseOpenError } from '@services/database/DatabaseService';
import { MigrationService } from '@services/database/MigrationService';

interface AppState {
  // Data
  repertoires: Repertoire[];
  userGamesCount: number;       // Count of user games (stored in SQLite)
  masterGamesCount: number;     // Count of master games (stored in SQLite)
  lineStats: LineStats[];      // Training line statistics
  currentTrainingSession: TrainingSession | null;
  reviewSettings: ReviewSettings;
  screenSettings: AllScreenSettings;
  gameReviewStatuses: GameReviewStatus[];
  currentReviewSession: GameReviewSession | null;
  isLoading: boolean;
  initStatus: string | null;   // Human-readable progress text shown on the startup loading screen
  dbError: boolean;
  isAnalyzing: boolean;
  analysisProgress: AnalysisProgress | null;

  // Actions
  initialize: () => Promise<void>;
  resetDatabase: () => Promise<void>;
  reloadDatabase: () => Promise<void>;

  // Repertoire actions
  addRepertoire: (r: Repertoire) => Promise<void>;
  updateRepertoire: (r: Repertoire) => Promise<void>;
  updateRepertoireMetadata: (r: Repertoire) => Promise<void>;  // renames etc. — skips re-indexing
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

  // Training actions
  loadLineStats: () => Promise<void>;
  saveLineStats: (stats: LineStats[]) => Promise<void>;
  updateLineStats: (stat: LineStats) => Promise<void>;
  removeLineStats: (lineId: string) => Promise<void>;
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
  lineStats: [],
  currentTrainingSession: null,
  reviewSettings: SettingsService.getDefaults(),
  screenSettings: ScreenSettingsService.getDefaults(),
  gameReviewStatuses: [],
  currentReviewSession: null,
  isLoading: true,
  initStatus: null,
  dbError: false,
  isAnalyzing: false,
  analysisProgress: null,

  initialize: async () => {
    console.log('Store: Initializing...');
    const onProgress = (msg: string) => set({ initStatus: msg });

    try {
      // Initialize database first
      await DatabaseService.initialize(onProgress);

      // Migrate existing AsyncStorage data to SQLite if needed
      await MigrationService.migrateIfNeeded(onProgress);

      onProgress('Loading your data…');
      const [repertoires, userGamesCount, masterGamesCount, lineStats, storedReviewSettings, screenSettings, gameReviewStatuses] = await Promise.all([
        DatabaseService.getAllRepertoires(),
        DatabaseService.getUserGamesCount(),
        DatabaseService.getMasterGamesCount(),
        DatabaseService.getAllLineStats(),
        DatabaseService.getSetting<ReviewSettings>('reviewSettings'),
        ScreenSettingsService.loadSettings(),
        DatabaseService.getAllGameReviewStatuses(),
      ]);

      const defaults = SettingsService.getDefaults();
      const reviewSettings: ReviewSettings = storedReviewSettings
        ? {
            ...defaults,
            ...storedReviewSettings,
            engine: { ...defaults.engine, ...storedReviewSettings.engine },
            training: { ...defaults.training, ...storedReviewSettings.training },
          }
        : defaults;

      console.log('Store: Loaded data:', {
        repertoires: repertoires.length,
        userGamesCount,
        masterGamesCount,
        lineStats: lineStats.length,
        gameReviewStatuses: gameReviewStatuses.length,
      });
      set({ repertoires, userGamesCount, masterGamesCount, lineStats, reviewSettings, screenSettings, gameReviewStatuses, isLoading: false, initStatus: null });

      // Index any repertoires missing position rows — only after the app is usable, since
      // it shares the SQLite connection with the load above and would otherwise stall startup.
      void DatabaseService.backfillRepertoirePositionsIfNeeded();
    } catch (error) {
      console.error('Store: Initialization failed:', error);
      if (error instanceof DatabaseOpenError) {
        set({ isLoading: false, dbError: true, initStatus: null });
      } else {
        // Non-fatal schema/migration error — still let the app start
        set({ isLoading: false, initStatus: null });
      }
    }
  },

  resetDatabase: async () => {
    await DatabaseService.deleteDatabase();
    set({ dbError: false, isLoading: true });
    // Re-run full initialization against the now-empty database
    const { initialize } = get();
    await initialize();
  },

  // Re-read everything from a database file that changed underneath us, as
  // happens after a backup is restored. initialize() is safe to re-run.
  reloadDatabase: async () => {
    set({ dbError: false, isLoading: true });
    const { initialize } = get();
    await initialize();
  },

  addRepertoire: async (repertoire) => {
    console.log('Store: Adding repertoire:', repertoire.name);
    const repertoires = [...get().repertoires, repertoire];
    console.log('Store: Total repertoires:', repertoires.length);
    await DatabaseService.addRepertoire(repertoire);
    set({ repertoires });
    console.log('Store: Repertoire added and saved');
  },

  updateRepertoire: async (updatedRepertoire) => {
    console.log('Store: Updating repertoire:', updatedRepertoire.name);
    const repertoires = get().repertoires.map(r =>
      r.id === updatedRepertoire.id ? updatedRepertoire : r
    );
    await DatabaseService.updateRepertoire(updatedRepertoire);
    set({ repertoires });
    console.log('Store: Repertoire updated and saved');
  },

  updateRepertoireMetadata: async (updatedRepertoire) => {
    const repertoires = get().repertoires.map(r =>
      r.id === updatedRepertoire.id ? updatedRepertoire : r
    );
    await DatabaseService.updateRepertoireMetadata(updatedRepertoire);
    set({ repertoires });
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

    // The repertoire, its position index and its line stats all go in one transaction.
    await DatabaseService.deleteRepertoire(id);

    const lineStats = get().lineStats.filter(stat => stat.repertoireId !== id);
    set({ repertoires, lineStats });
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

  // Training actions
  loadLineStats: async () => {
    const lineStats = await DatabaseService.getAllLineStats();
    set({ lineStats });
  },

  saveLineStats: async (lineStats) => {
    await DatabaseService.replaceAllLineStats(lineStats);
    set({ lineStats });
  },

  removeLineStats: async (lineId: string) => {
    await DatabaseService.deleteLineStats(lineId);
    set({ lineStats: get().lineStats.filter(s => s.lineId !== lineId) });
  },

  updateLineStats: async (updatedStat) => {
    // One row per answer. The in-memory array stays the read model so getDueLineStats
    // and every consumer remain synchronous.
    await DatabaseService.upsertLineStats(updatedStat);

    const lineStats = get().lineStats;
    const index = lineStats.findIndex(s => s.lineId === updatedStat.lineId);
    const newLineStats: LineStats[] = index >= 0
      ? lineStats.map(s => s.lineId === updatedStat.lineId ? updatedStat : s)
      : [...lineStats, updatedStat];

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
    const stored = await DatabaseService.getSetting<ReviewSettings>('reviewSettings');
    const defaults = SettingsService.getDefaults();
    const reviewSettings: ReviewSettings = stored
      ? {
          ...defaults,
          ...stored,
          engine: { ...defaults.engine, ...stored.engine },
        }
      : defaults;
    set({ reviewSettings });
  },

  saveReviewSettings: async (updates) => {
    const current = get().reviewSettings;
    const updated: ReviewSettings = {
      ...current,
      ...updates,
      engine: updates.engine ? { ...current.engine, ...updates.engine } : current.engine,
      training: updates.training ? { ...current.training, ...updates.training } : current.training,
    };
    await DatabaseService.saveSetting('reviewSettings', updated);
    set({ reviewSettings: updated });
  },

  startGameReview: async (gameId, userColor) => {
    const state = get();
    const game = await DatabaseService.getUserGameById(gameId);

    if (!game) {
      throw new Error(`Game not found: ${gameId}`);
    }

    console.log('Store: Starting game review for:', game.id, 'userColor:', userColor);

    set({
      isAnalyzing: true,
      analysisProgress: { current: 0, total: 0, phase: 'Starting analysis...' },
    });

    try {
      const masterGames = await DatabaseService.getAllMasterGames();

      // Create analyzer using the native Stockfish bridge
      const analyzer = new EngineAnalyzer((cmd) => stockfishBridge.sendCommand(cmd));
      analyzer.configure(state.reviewSettings.engine.threads);

      // Wire up bridge output to analyzer
      stockfishBridge.setOutputHandler((line: string) => analyzer.handleLine(line));

      const analysisOptions = {
        depth: state.reviewSettings.engine.depth,
        moveTime: state.reviewSettings.engine.moveTime,
        multiPV: state.reviewSettings.engine.multiPV,
      };

      try {
        const session = await GameReviewService.startReview(
          game,
          userColor,
          masterGames,
          analyzer,
          analysisOptions,
          (current, total) => {
            set({
              analysisProgress: {
                current,
                total,
                phase: `Analyzing position ${current} of ${total}...`,
              },
            });
          },
        );

        set({ currentReviewSession: session });
        console.log('Store: Game review session started, key moves:', session.keyMoveIndices.length);
      } finally {
        // Clean up: remove our output handler
        stockfishBridge.setOutputHandler(null);
      }
    } finally {
      set({ isAnalyzing: false, analysisProgress: null });
    }
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
      case 'nextKey': {
        const nextKey = session.keyMoveIndices.find(i => i > newIndex);
        if (nextKey !== undefined) newIndex = nextKey;
        break;
      }
      case 'prevKey': {
        const prevKey = session.keyMoveIndices
          .slice()
          .reverse()
          .find(i => i < newIndex);
        if (prevKey !== undefined) newIndex = prevKey;
        break;
      }
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

    const completedSession: GameReviewSession = {
      ...session,
      isComplete: true,
      completedAt: new Date(),
    };

    const status = GameReviewService.createReviewStatus(completedSession);
    await DatabaseService.upsertGameReviewStatus(status);

    const statuses = get().gameReviewStatuses;
    const index = statuses.findIndex(s => s.gameId === session.gameId);
    const newStatuses: GameReviewStatus[] = index >= 0
      ? statuses.map(s => (s.gameId === session.gameId ? status : s))
      : [...statuses, status];

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
