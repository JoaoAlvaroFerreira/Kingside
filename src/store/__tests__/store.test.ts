// Mock all services before importing the store
jest.mock('@services/storage/StorageService', () => ({
  StorageService: {
    loadRepertoires: jest.fn().mockResolvedValue([]),
    saveRepertoires: jest.fn().mockResolvedValue(undefined),
    loadCards: jest.fn().mockResolvedValue([]),
    saveCards: jest.fn().mockResolvedValue(undefined),
    loadLineStats: jest.fn().mockResolvedValue([]),
    saveLineStats: jest.fn().mockResolvedValue(undefined),
    loadGameReviewStatuses: jest.fn().mockResolvedValue([]),
    saveGameReviewStatuses: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@services/settings/SettingsService', () => ({
  SettingsService: {
    getDefaults: jest.fn().mockReturnValue({ thresholds: { blunder: 300, mistake: 100, inaccuracy: 50 } }),
    loadSettings: jest.fn().mockResolvedValue({ thresholds: { blunder: 300, mistake: 100, inaccuracy: 50 } }),
    updateSettings: jest.fn().mockImplementation(async (updates) => ({ ...updates })),
  },
}));

jest.mock('@services/settings/ScreenSettingsService', () => ({
  ScreenSettingsService: {
    getDefaults: jest.fn().mockReturnValue({}),
    loadSettings: jest.fn().mockResolvedValue({}),
    updateScreenSettings: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('@services/gameReview/GameReviewService', () => ({
  GameReviewService: {
    startReview: jest.fn(),
    createReviewStatus: jest.fn(),
  },
}));

jest.mock('@services/database/DatabaseService', () => ({
  DatabaseService: {
    initialize: jest.fn().mockResolvedValue(undefined),
    getUserGamesCount: jest.fn().mockResolvedValue(0),
    getMasterGamesCount: jest.fn().mockResolvedValue(0),
    addUserGames: jest.fn().mockResolvedValue(undefined),
    deleteUserGame: jest.fn().mockResolvedValue(undefined),
    deleteAllUserGames: jest.fn().mockResolvedValue(undefined),
    getUserGameById: jest.fn().mockResolvedValue(null),
    addMasterGames: jest.fn().mockResolvedValue(undefined),
    deleteMasterGame: jest.fn().mockResolvedValue(undefined),
    deleteAllMasterGames: jest.fn().mockResolvedValue(undefined),
    getMasterGameById: jest.fn().mockResolvedValue(null),
    getAllMasterGames: jest.fn().mockResolvedValue([]),
    getAllUserGames: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@services/database/MigrationService', () => ({
  MigrationService: {
    migrateIfNeeded: jest.fn().mockResolvedValue(undefined),
  },
}));

import { useStore } from '../index';
import { StorageService } from '@services/storage/StorageService';
import { DatabaseService } from '@services/database/DatabaseService';
import { Repertoire, ReviewCard, UserGame } from '@types';
import { MoveTree } from '@utils/MoveTree';

// Helpers
function makeRepertoire(overrides: Partial<Repertoire> = {}): Repertoire {
  return {
    id: `rep-${Math.random().toString(36).slice(2)}`,
    name: 'Test Rep',
    color: 'white',
    openingType: 'e4',
    eco: 'C20',
    chapters: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCard(chapterId = 'ch1'): ReviewCard {
  return {
    id: `card-${Math.random().toString(36).slice(2)}`,
    color: 'white',
    openingId: 'opening-1',
    subVariationId: 'sub-1',
    chapterId,
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    correctMove: 'e4',
    contextMoves: [],
    isUserMove: true,
    isCritical: false,
    easeFactor: 2.5,
    interval: 1,
    repetitions: 0,
    nextReviewDate: new Date(),
    totalReviews: 0,
    correctCount: 0,
  };
}

function makeUserGame(overrides: Partial<UserGame> = {}): UserGame {
  return {
    id: `game-${Math.random().toString(36).slice(2)}`,
    pgn: '1. e4 e5 *',
    white: 'Alice',
    black: 'Bob',
    result: '1-0',
    date: '2025.01.01',
    event: 'Test',
    eco: 'C20',
    moves: ['e4', 'e5'],
    importedAt: new Date(),
    ...overrides,
  };
}

// Capture the initial state so we can reset between tests
let initialState: ReturnType<typeof useStore.getState>;

beforeAll(() => {
  initialState = useStore.getState();
});

beforeEach(() => {
  jest.clearAllMocks();
  useStore.setState(initialState);
  // Reset mocks to defaults
  (DatabaseService.getUserGamesCount as jest.Mock).mockResolvedValue(0);
  (DatabaseService.getMasterGamesCount as jest.Mock).mockResolvedValue(0);
  (StorageService.loadRepertoires as jest.Mock).mockResolvedValue([]);
  (StorageService.loadCards as jest.Mock).mockResolvedValue([]);
  (StorageService.loadLineStats as jest.Mock).mockResolvedValue([]);
  (StorageService.loadGameReviewStatuses as jest.Mock).mockResolvedValue([]);
});

describe('useStore', () => {
  describe('initialization', () => {
    it('sets isLoading=false after initialize', async () => {
      await useStore.getState().initialize();
      expect(useStore.getState().isLoading).toBe(false);
    });

    it('calls DatabaseService.initialize', async () => {
      await useStore.getState().initialize();
      expect(DatabaseService.initialize).toHaveBeenCalled();
    });

    it('loads repertoires from storage', async () => {
      const rep = makeRepertoire();
      (StorageService.loadRepertoires as jest.Mock).mockResolvedValue([rep]);
      await useStore.getState().initialize();
      expect(useStore.getState().repertoires).toHaveLength(1);
      expect(useStore.getState().repertoires[0].id).toBe(rep.id);
    });

    it('loads userGamesCount from database', async () => {
      (DatabaseService.getUserGamesCount as jest.Mock).mockResolvedValue(7);
      await useStore.getState().initialize();
      expect(useStore.getState().userGamesCount).toBe(7);
    });

    it('handles database init failure gracefully', async () => {
      (DatabaseService.initialize as jest.Mock).mockRejectedValueOnce(new Error('DB fail'));
      await expect(useStore.getState().initialize()).rejects.toThrow('DB fail');
    });
  });

  describe('repertoire actions', () => {
    it('addRepertoire adds to array and persists', async () => {
      const rep = makeRepertoire({ name: 'My Rep' });
      await useStore.getState().addRepertoire(rep);
      expect(useStore.getState().repertoires).toHaveLength(1);
      expect(useStore.getState().repertoires[0].name).toBe('My Rep');
      expect(StorageService.saveRepertoires).toHaveBeenCalledWith([rep]);
    });

    it('addRepertoire appends to existing repertoires', async () => {
      const rep1 = makeRepertoire();
      const rep2 = makeRepertoire();
      await useStore.getState().addRepertoire(rep1);
      await useStore.getState().addRepertoire(rep2);
      expect(useStore.getState().repertoires).toHaveLength(2);
    });

    it('updateRepertoire modifies existing and persists', async () => {
      const rep = makeRepertoire({ name: 'Old Name' });
      await useStore.getState().addRepertoire(rep);

      const updated = { ...rep, name: 'New Name' };
      await useStore.getState().updateRepertoire(updated);

      expect(useStore.getState().repertoires[0].name).toBe('New Name');
      expect(StorageService.saveRepertoires).toHaveBeenLastCalledWith([updated]);
    });

    it('deleteRepertoire removes from array and persists', async () => {
      const rep = makeRepertoire();
      await useStore.getState().addRepertoire(rep);
      expect(useStore.getState().repertoires).toHaveLength(1);

      await useStore.getState().deleteRepertoire(rep.id);
      expect(useStore.getState().repertoires).toHaveLength(0);
      expect(StorageService.saveRepertoires).toHaveBeenLastCalledWith([]);
    });

    it('deleteRepertoire removes associated review cards', async () => {
      const tree = new MoveTree();
      const rep = makeRepertoire({
        chapters: [{
          id: 'ch-x',
          name: 'Chapter',
          pgn: '',
          moveTree: tree.toJSON(),
          order: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }],
      });
      await useStore.getState().addRepertoire(rep);

      const cardToDelete = makeCard('ch-x');
      const cardToKeep = makeCard('other-ch');
      await useStore.getState().addCards([cardToDelete, cardToKeep]);
      expect(useStore.getState().reviewCards).toHaveLength(2);

      await useStore.getState().deleteRepertoire(rep.id);
      const remaining = useStore.getState().reviewCards;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(cardToKeep.id);
    });

    it('deleteRepertoire is no-op for unknown id', async () => {
      const rep = makeRepertoire();
      await useStore.getState().addRepertoire(rep);
      await useStore.getState().deleteRepertoire('nonexistent');
      expect(useStore.getState().repertoires).toHaveLength(1);
    });
  });

  describe('game actions', () => {
    it('addUserGames calls DatabaseService and refreshes count', async () => {
      (DatabaseService.getUserGamesCount as jest.Mock).mockResolvedValue(2);
      const games = [makeUserGame(), makeUserGame()];
      await useStore.getState().addUserGames(games);
      expect(DatabaseService.addUserGames).toHaveBeenCalledWith(games);
      expect(useStore.getState().userGamesCount).toBe(2);
    });

    it('deleteUserGame calls DatabaseService and refreshes count', async () => {
      (DatabaseService.getUserGamesCount as jest.Mock).mockResolvedValue(0);
      await useStore.getState().deleteUserGame('game-1');
      expect(DatabaseService.deleteUserGame).toHaveBeenCalledWith('game-1');
      expect(useStore.getState().userGamesCount).toBe(0);
    });

    it('deleteAllUserGames resets count to 0', async () => {
      useStore.setState({ userGamesCount: 5 });
      await useStore.getState().deleteAllUserGames();
      expect(DatabaseService.deleteAllUserGames).toHaveBeenCalled();
      expect(useStore.getState().userGamesCount).toBe(0);
    });

    it('getUserGameById delegates to DatabaseService', async () => {
      const game = makeUserGame();
      (DatabaseService.getUserGameById as jest.Mock).mockResolvedValueOnce(game);
      const result = await useStore.getState().getUserGameById(game.id);
      expect(result?.id).toBe(game.id);
    });
  });

  describe('settings actions', () => {
    it('updateScreenSettings persists and updates state', async () => {
      const { ScreenSettingsService } = jest.requireMock('@services/settings/ScreenSettingsService');
      (ScreenSettingsService.updateScreenSettings as jest.Mock).mockResolvedValue({ analysis: { engineEnabled: false } });

      await useStore.getState().updateScreenSettings('analysis', { engineEnabled: false });
      expect(ScreenSettingsService.updateScreenSettings).toHaveBeenCalled();
    });
  });

  describe('review card actions', () => {
    it('addCards appends to store and persists', async () => {
      const cards = [makeCard(), makeCard()];
      await useStore.getState().addCards(cards);
      expect(useStore.getState().reviewCards).toHaveLength(2);
      expect(StorageService.saveCards).toHaveBeenCalled();
    });

    it('updateCard modifies in place', async () => {
      const card = makeCard();
      await useStore.getState().addCards([card]);
      const updated = { ...card, easeFactor: 1.8 };
      await useStore.getState().updateCard(updated);
      expect(useStore.getState().reviewCards[0].easeFactor).toBe(1.8);
    });

    it('getDueCards returns cards with nextReviewDate in past', () => {
      const pastCard = makeCard();
      pastCard.nextReviewDate = new Date('2020-01-01');
      const futureCard = makeCard();
      futureCard.nextReviewDate = new Date('2099-01-01');
      useStore.setState({ reviewCards: [pastCard, futureCard] });
      const due = useStore.getState().getDueCards();
      expect(due).toHaveLength(1);
      expect(due[0].id).toBe(pastCard.id);
    });
  });
});
