// Mock react-native Platform and expo-sqlite before module load
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  withTransactionAsync: jest.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
};
const mockOpenDatabaseAsync = jest.fn().mockResolvedValue(mockDb);

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: (...args: any[]) => mockOpenDatabaseAsync(...args),
}));

// Also mock WebDatabaseService (not needed for native path)
jest.mock('../WebDatabaseService', () => ({
  WebDatabaseService: {
    initialize: jest.fn(),
    addUserGames: jest.fn(),
    getUserGames: jest.fn(),
    getAllUserGames: jest.fn(),
    getUserGameById: jest.fn(),
    deleteUserGame: jest.fn(),
    deleteAllUserGames: jest.fn(),
    getUserGamesCount: jest.fn(),
    addMasterGames: jest.fn(),
    getMasterGames: jest.fn(),
    getAllMasterGames: jest.fn(),
    getMasterGameById: jest.fn(),
    deleteMasterGame: jest.fn(),
    deleteAllMasterGames: jest.fn(),
    getMasterGamesCount: jest.fn(),
    searchUserGames: jest.fn(),
    searchMasterGames: jest.fn(),
    addRepertoire: jest.fn(),
    updateRepertoire: jest.fn(),
    deleteRepertoire: jest.fn(),
    getAllRepertoires: jest.fn(),
    getRepertoireById: jest.fn(),
    getRepertoiresCount: jest.fn(),
    saveSetting: jest.fn(),
    getSetting: jest.fn(),
  },
}));

import { UserGame, Repertoire } from '@types';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseService } = require('../DatabaseService');

function makeRepertoire(overrides: Partial<Repertoire> = {}): Repertoire {
  return {
    id: `rep-${Math.random().toString(36).slice(2)}`,
    name: 'Sicilian Defense',
    color: 'black',
    openingType: 'e4',
    eco: 'B20',
    chapters: [
      {
        id: `ch-${Math.random().toString(36).slice(2)}`,
        name: 'Main Line',
        pgn: '1. e4 c5 *',
        moveTree: { root: { san: null, children: [] } },
        order: 0,
        createdAt: new Date('2025-06-01T10:00:00.000Z'),
        updatedAt: new Date('2025-06-01T10:00:00.000Z'),
      },
    ],
    createdAt: new Date('2025-06-01T10:00:00.000Z'),
    updatedAt: new Date('2025-06-01T10:00:00.000Z'),
    ...overrides,
  };
}

function makeGame(overrides: Partial<UserGame> = {}): UserGame {
  return {
    id: `game-${Math.random().toString(36).slice(2)}`,
    pgn: '1. e4 e5 *',
    white: 'Alice',
    black: 'Bob',
    result: '1-0',
    date: '2025.01.01',
    event: 'Test Event',
    eco: 'C20',
    moves: ['e4', 'e5'],
    importedAt: new Date('2025-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeGameRow(game: UserGame) {
  return {
    id: game.id,
    white: game.white,
    black: game.black,
    result: game.result,
    date: game.date,
    event: game.event,
    site: undefined,
    eco: game.eco,
    pgn: game.pgn,
    moves: JSON.stringify(game.moves),
    imported_at: game.importedAt.getTime(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.execAsync.mockResolvedValue(undefined);
  mockDb.runAsync.mockResolvedValue({ changes: 1 });
  mockDb.getAllAsync.mockResolvedValue([]);
  mockDb.getFirstAsync.mockResolvedValue(null);
  mockDb.withTransactionAsync.mockImplementation(async (fn: () => Promise<void>) => fn());
  mockOpenDatabaseAsync.mockResolvedValue(mockDb);
});

describe('DatabaseService', () => {
  describe('initialize', () => {
    it('opens database and creates tables', async () => {
      await DatabaseService.initialize();
      expect(mockOpenDatabaseAsync).toHaveBeenCalled();
      expect(mockDb.execAsync).toHaveBeenCalled();
      const sql = mockDb.execAsync.mock.calls.map(([s]: [string]) => s).join('\n');
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS user_games/);
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS master_games/);
    });

    it('creates indices on date, eco, imported_at', async () => {
      await DatabaseService.initialize();
      const sql = mockDb.execAsync.mock.calls.map(([s]: [string]) => s).join('\n');
      expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_user_games_date/);
      expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_master_games_eco/);
    });
  });

  describe('user games CRUD', () => {
    beforeEach(() => DatabaseService.initialize());

    it('addUserGames uses a transaction', async () => {
      const games = [makeGame(), makeGame()];
      await DatabaseService.addUserGames(games);
      expect(mockDb.withTransactionAsync).toHaveBeenCalled();
    });

    it('addUserGames inserts all games with runAsync', async () => {
      const games = [makeGame(), makeGame()];
      await DatabaseService.addUserGames(games);
      expect(mockDb.runAsync).toHaveBeenCalledTimes(games.length);
    });

    it('addUserGames stores moves as JSON string', async () => {
      const game = makeGame({ moves: ['e4', 'e5', 'Nf3'] });
      await DatabaseService.addUserGames([game]);
      const args = mockDb.runAsync.mock.calls[0][1];
      const movesArg = args.find((a: any) => {
        try { return Array.isArray(JSON.parse(a)); } catch { return false; }
      });
      expect(JSON.parse(movesArg)).toEqual(['e4', 'e5', 'Nf3']);
    });

    it('getUserGameById returns null for missing ID', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce(null);
      const result = await DatabaseService.getUserGameById('nonexistent');
      expect(result).toBeNull();
    });

    it('getUserGameById returns game when found', async () => {
      const game = makeGame();
      mockDb.getFirstAsync.mockResolvedValueOnce(makeGameRow(game));
      const result = await DatabaseService.getUserGameById(game.id);
      expect(result?.id).toBe(game.id);
      expect(result?.moves).toEqual(game.moves);
    });

    it('deleteUserGame calls runAsync with DELETE', async () => {
      await DatabaseService.deleteUserGame('game-123');
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'DELETE FROM user_games WHERE id = ?',
        ['game-123']
      );
    });

    it('getUserGamesCount returns count from db', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({ count: 42 });
      const count = await DatabaseService.getUserGamesCount();
      expect(count).toBe(42);
    });

    it('getUserGamesCount returns 0 when null result', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce(null);
      const count = await DatabaseService.getUserGamesCount();
      expect(count).toBe(0);
    });
  });

  describe('pagination', () => {
    beforeEach(() => DatabaseService.initialize());

    it('getUserGames returns items with correct structure', async () => {
      const game = makeGame();
      mockDb.getFirstAsync.mockResolvedValueOnce({ count: 1 });
      mockDb.getAllAsync.mockResolvedValueOnce([makeGameRow(game)]);

      const result = await DatabaseService.getUserGames(0, 50);
      expect(result.items).toHaveLength(1);
      expect(result.totalCount).toBe(1);
      expect(result.hasMore).toBe(false);
      expect(result.page).toBe(0);
    });

    it('hasMore is true when more items exist', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({ count: 100 });
      mockDb.getAllAsync.mockResolvedValueOnce([]);
      const result = await DatabaseService.getUserGames(0, 50);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('search', () => {
    beforeEach(() => DatabaseService.initialize());

    it('searchUserGames uses LIKE pattern', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({ count: 0 });
      mockDb.getAllAsync.mockResolvedValueOnce([]);
      await DatabaseService.searchUserGames('Alice');
      const countCall = mockDb.getFirstAsync.mock.calls[0];
      expect(countCall[1]).toContain('%Alice%');
    });
  });

  describe('master games', () => {
    beforeEach(() => DatabaseService.initialize());

    it('addMasterGames uses a transaction', async () => {
      const games = [makeGame()];
      await DatabaseService.addMasterGames(games);
      expect(mockDb.withTransactionAsync).toHaveBeenCalled();
    });

    it('getMasterGamesCount returns count', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({ count: 7 });
      expect(await DatabaseService.getMasterGamesCount()).toBe(7);
    });
  });

  describe('repertoires', () => {
    beforeEach(() => DatabaseService.initialize());

    it('addRepertoire then getAllRepertoires returns the repertoire', async () => {
      const rep = makeRepertoire();
      await DatabaseService.addRepertoire(rep);

      // Verify INSERT OR IGNORE was called with correct params
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR IGNORE INTO repertoires'),
        expect.arrayContaining([rep.id, rep.name, rep.color])
      );

      // Simulate getAllRepertoires returning the stored data
      mockDb.getAllAsync.mockResolvedValueOnce([{ data: JSON.stringify(rep) }]);
      const all = await DatabaseService.getAllRepertoires();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe(rep.id);
      expect(all[0].name).toBe(rep.name);
    });

    it('updateRepertoire changes the data', async () => {
      const rep = makeRepertoire();
      const updated = { ...rep, name: 'Updated Name' };
      await DatabaseService.updateRepertoire(updated);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE repertoires SET'),
        expect.arrayContaining([updated.name, updated.color, expect.any(String), expect.any(Number), updated.id])
      );
    });

    it('deleteRepertoire removes it', async () => {
      await DatabaseService.deleteRepertoire('rep-123');
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'DELETE FROM repertoires WHERE id = ?',
        ['rep-123']
      );
    });

    it('getRepertoireById finds by ID', async () => {
      const rep = makeRepertoire();
      mockDb.getFirstAsync.mockResolvedValueOnce({ data: JSON.stringify(rep) });
      const result = await DatabaseService.getRepertoireById(rep.id);
      expect(result?.id).toBe(rep.id);
    });

    it('getRepertoireById returns null for missing ID', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce(null);
      const result = await DatabaseService.getRepertoireById('nonexistent');
      expect(result).toBeNull();
    });

    it('repertoire with chapters survives JSON round-trip', async () => {
      const rep = makeRepertoire({
        chapters: [
          {
            id: 'ch-1',
            name: 'Chapter 1',
            pgn: '1. e4 c5 2. Nf3 *',
            moveTree: { root: { san: null, children: [{ san: 'e4', children: [{ san: 'c5', children: [] }] }] } },
            order: 0,
            createdAt: new Date('2025-06-01T10:00:00.000Z'),
            updatedAt: new Date('2025-06-15T12:00:00.000Z'),
          },
        ],
      });

      mockDb.getAllAsync.mockResolvedValueOnce([{ data: JSON.stringify(rep) }]);
      const all = await DatabaseService.getAllRepertoires();
      expect(all[0].chapters[0].moveTree.root.children).toHaveLength(1);
      expect(all[0].chapters[0].moveTree.root.children[0].san).toBe('e4');
    });

    it('Date fields in repertoire survive serialization', async () => {
      const rep = makeRepertoire({
        chapters: [
          {
            id: 'ch-dates',
            name: 'Date Test',
            pgn: '1. e4 *',
            moveTree: {},
            order: 0,
            createdAt: new Date('2025-06-01T10:00:00.000Z'),
            updatedAt: new Date('2025-06-15T12:00:00.000Z'),
            lastStudiedAt: new Date('2025-07-01T08:30:00.000Z'),
          },
        ],
      });

      mockDb.getAllAsync.mockResolvedValueOnce([{ data: JSON.stringify(rep) }]);
      const all = await DatabaseService.getAllRepertoires();
      const chapter = all[0].chapters[0];
      expect(chapter.createdAt).toBeInstanceOf(Date);
      expect(chapter.updatedAt).toBeInstanceOf(Date);
      expect(chapter.lastStudiedAt).toBeInstanceOf(Date);
      expect((chapter.lastStudiedAt as Date).toISOString()).toBe('2025-07-01T08:30:00.000Z');
    });

    it('getRepertoiresCount returns count', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({ count: 3 });
      expect(await DatabaseService.getRepertoiresCount()).toBe(3);
    });

    it('getRepertoiresCount returns 0 when null', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce(null);
      expect(await DatabaseService.getRepertoiresCount()).toBe(0);
    });
  });

  describe('settings', () => {
    beforeEach(() => DatabaseService.initialize());

    it('saveSetting then getSetting returns the same value', async () => {
      const settings = { engine: { depth: 20 }, thresholds: { blunder: 200 } };
      await DatabaseService.saveSetting('reviewSettings', settings);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO settings'),
        ['reviewSettings', JSON.stringify(settings)]
      );

      mockDb.getFirstAsync.mockResolvedValueOnce({ value: JSON.stringify(settings) });
      const result = await DatabaseService.getSetting('reviewSettings');
      expect(result).toEqual(settings);
    });

    it('getSetting returns null for missing key', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce(null);
      const result = await DatabaseService.getSetting('nonexistent');
      expect(result).toBeNull();
    });

    it('getSetting revives Date objects', async () => {
      const data = { lastUpdated: new Date('2025-08-01T00:00:00.000Z') };
      mockDb.getFirstAsync.mockResolvedValueOnce({ value: JSON.stringify(data) });
      const result = await DatabaseService.getSetting('dateKey') as typeof data | null;
      expect(result?.lastUpdated).toBeInstanceOf(Date);
    });
  });

  describe('initialize creates repertoires and settings tables', () => {
    it('creates repertoires table and settings table', async () => {
      await DatabaseService.initialize();
      const sql = mockDb.execAsync.mock.calls.map(([s]: [string]) => s).join('\n');
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS repertoires/);
      expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_repertoires_color/);
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS settings/);
    });
  });
});
