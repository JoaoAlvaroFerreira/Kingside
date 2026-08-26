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

import { UserGame, Repertoire, LineStats } from '@types';
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
  // Default: return schema version 1 for PRAGMA user_version (no migration needed)
  mockDb.getFirstAsync.mockResolvedValue({ user_version: 1 });
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

  describe('backfillRepertoirePositionsIfNeeded', () => {
    beforeEach(() => DatabaseService.initialize());

    const repRow = (id: string) => ({
      id,
      data: JSON.stringify({
        id,
        name: id,
        color: 'white',
        openingType: 'other',
        eco: '',
        chapters: [{
          id: `${id}-ch`,
          name: 'Ch',
          pgn: '',
          moveTree: { rootMoves: [{ id: 'n1', san: 'e4', children: [] }] },
          order: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }],
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    });

    it('skips repertoires already marked as indexed', async () => {
      // Regression guard: progress must be tracked per repertoire. A prior implementation
      // used one end-of-loop completion flag, so an interrupted backfill re-indexed every
      // repertoire on every subsequent launch — indefinitely.
      mockDb.getAllAsync
        .mockResolvedValueOnce([{ key: 'rep_pos_indexed:rep-a' }])
        .mockResolvedValueOnce([repRow('rep-a'), repRow('rep-b')]);

      await DatabaseService.backfillRepertoirePositionsIfNeeded();

      const deleted = mockDb.runAsync.mock.calls
        .filter(([sql]: [string]) => /DELETE FROM repertoire_moves/.test(sql))
        .map(([, args]: [string, string[]]) => args[0]);
      expect(deleted).toEqual(['rep-b']);
    });

    it('does no work when every repertoire is already indexed', async () => {
      mockDb.getAllAsync
        .mockResolvedValueOnce([{ key: 'rep_pos_indexed:rep-a' }])
        .mockResolvedValueOnce([repRow('rep-a')]);

      await DatabaseService.backfillRepertoirePositionsIfNeeded();

      expect(mockDb.withTransactionAsync).not.toHaveBeenCalled();
    });

    it('clears the marker before indexing and sets it only after rows are committed', async () => {
      // An interrupted index leaves partial rows across several transactions, so the
      // marker must not be readable as "done" until every batch has landed.
      mockDb.getAllAsync
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([repRow('rep-b')]);

      await DatabaseService.backfillRepertoirePositionsIfNeeded();

      const markerOps = mockDb.runAsync.mock.calls
        .filter(([, args]: [string, any[]]) => args?.[0] === 'rep_pos_indexed:rep-b')
        .map(([sql]: [string]) => (/DELETE/.test(sql) ? 'clear' : 'set'));
      expect(markerOps[0]).toBe('clear');
      expect(markerOps).toContain('set');
    });
  });

  describe('findChaptersByFen', () => {
    beforeEach(() => DatabaseService.initialize());

    it('returns the (repertoire, chapter) pairs containing a position', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        { repertoire_id: 'rep-a', chapter_id: 'ch-1' },
        { repertoire_id: 'rep-b', chapter_id: 'ch-9' },
      ]);

      const hits = await DatabaseService.findChaptersByFen('some-fen');

      expect(hits).toEqual([
        { repertoireId: 'rep-a', chapterId: 'ch-1' },
        { repertoireId: 'rep-b', chapterId: 'ch-9' },
      ]);
      const calls = mockDb.getAllAsync.mock.calls;
      const [sql, args] = calls[calls.length - 1];
      expect(sql).toMatch(/FROM repertoire_moves/);
      expect(sql).toMatch(/normalized_fen = \?/);
      // Bounded: an early position matches most of the index.
      expect(sql).toMatch(/LIMIT \?/);
      expect(args).toEqual(['some-fen', 100]);
    });

    it('returns empty rather than throwing when the index is unavailable', async () => {
      mockDb.getAllAsync.mockRejectedValueOnce(new Error('no such column: chapter_id'));
      await expect(DatabaseService.findChaptersByFen('some-fen')).resolves.toEqual([]);
    });
  });

  describe('getAllRepertoires', () => {
    beforeEach(() => DatabaseService.initialize());

    it('revives Date fields on the repertoire and its chapters', async () => {
      const created = new Date('2025-01-04T10:00:00.000Z');
      const studied = new Date('2025-06-01T08:30:00.000Z');
      mockDb.getAllAsync.mockResolvedValueOnce([{
        data: JSON.stringify({
          id: 'r1', name: 'R', color: 'white', openingType: 'other', eco: '',
          chapters: [{
            id: 'c1', name: 'C', pgn: '', moveTree: { rootMoves: [] }, order: 0,
            createdAt: created, updatedAt: created, lastStudiedAt: studied,
          }],
          createdAt: created, updatedAt: created,
        }),
      }]);

      const [rep] = await DatabaseService.getAllRepertoires();

      expect(rep.createdAt).toBeInstanceOf(Date);
      expect(rep.createdAt.getTime()).toBe(created.getTime());
      expect(rep.chapters[0].updatedAt).toBeInstanceOf(Date);
      expect(rep.chapters[0].lastStudiedAt).toBeInstanceOf(Date);
      expect(rep.chapters[0].lastStudiedAt!.getTime()).toBe(studied.getTime());
    });

    it('leaves move-tree contents untouched', async () => {
      // The date revival must not walk the move tree — it is the bulk of the blob and
      // holds no dates, so touching every node is what made startup take minutes.
      mockDb.getAllAsync.mockResolvedValueOnce([{
        data: JSON.stringify({
          id: 'r1', name: 'R', color: 'white', openingType: 'other', eco: '',
          chapters: [{
            id: 'c1', name: 'C', pgn: '', order: 0,
            moveTree: { rootMoves: [{ id: 'n1', san: 'e4', comment: '2025-01-04T10:00:00Z', children: [] }] },
            createdAt: new Date(), updatedAt: new Date(),
          }],
          createdAt: new Date(), updatedAt: new Date(),
        }),
      }]);

      const [rep] = await DatabaseService.getAllRepertoires();

      expect(rep.chapters[0].moveTree.rootMoves[0].comment).toBe('2025-01-04T10:00:00Z');
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
      // Each game: 1 INSERT user_games + 1 DELETE game_positions + N INSERT game_positions
      const insertCalls = mockDb.runAsync.mock.calls.filter(
        ([sql]: [string]) => sql.includes('INSERT OR REPLACE INTO user_games')
      );
      expect(insertCalls).toHaveLength(games.length);
    });

    it('addUserGames stores moves as JSON string', async () => {
      const game = makeGame({ moves: ['e4', 'e5', 'Nf3'] });
      await DatabaseService.addUserGames([game]);
      const insert = mockDb.runAsync.mock.calls.find(
        ([sql]: [string]) => sql.includes('INSERT OR REPLACE INTO user_games')
      );
      const args = insert[1];
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
      // Also cleans up FEN index
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'DELETE FROM game_positions WHERE game_id = ? AND game_type = ?',
        ['game-123', 'user']
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
      // Find the call that uses LIKE (not the PRAGMA call from init)
      const likeCall = mockDb.getFirstAsync.mock.calls.find(
        ([sql]: [string]) => sql.includes('LIKE')
      );
      expect(likeCall).toBeDefined();
      expect(likeCall![1]).toContain('%Alice%');
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

    it('creates the training tables', async () => {
      await DatabaseService.initialize();
      const sql = mockDb.execAsync.mock.calls.map(([s]: [string]) => s).join('\n');
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS line_stats/);
      expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_line_stats_due/);
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS game_review_statuses/);
    });
  });

  describe('line stats', () => {
    const stat: LineStats = {
      lineId: 'line-1',
      repertoireId: 'rep-1',
      chapterId: 'ch-1',
      easeFactor: 2.5,
      interval: 6,
      repetitions: 2,
      nextReviewDate: new Date('2026-09-01T12:00:00.000Z'),
      lastReviewDate: new Date('2026-08-26T12:00:00.000Z'),
      totalDrills: 10,
      correctCount: 8,
      mistakeCount: 2,
    };

    it('upsertLineStats writes one row with dates as epoch ms', async () => {
      await DatabaseService.initialize();
      await DatabaseService.upsertLineStats(stat);

      const call = mockDb.runAsync.mock.calls.find(([sql]: [string]) =>
        /INSERT OR REPLACE INTO line_stats/.test(sql)
      );
      expect(call).toBeDefined();
      const params = call![1];
      expect(params[0]).toBe('line-1');
      expect(params[6]).toBe(stat.nextReviewDate.getTime());
      expect(params[7]).toBe(stat.lastReviewDate!.getTime());
    });

    it('getAllLineStats revives epoch ms back into Dates', async () => {
      await DatabaseService.initialize();
      mockDb.getAllAsync.mockResolvedValueOnce([{
        line_id: stat.lineId,
        repertoire_id: stat.repertoireId,
        chapter_id: stat.chapterId,
        ease_factor: stat.easeFactor,
        interval: stat.interval,
        repetitions: stat.repetitions,
        next_review_date: stat.nextReviewDate.getTime(),
        last_review_date: stat.lastReviewDate!.getTime(),
        total_drills: stat.totalDrills,
        correct_count: stat.correctCount,
        mistake_count: stat.mistakeCount,
      }]);

      const [loaded] = await DatabaseService.getAllLineStats();
      expect(loaded).toEqual(stat);
      expect(loaded.nextReviewDate).toBeInstanceOf(Date);
    });

    it('getAllLineStats leaves lastReviewDate undefined when null', async () => {
      await DatabaseService.initialize();
      mockDb.getAllAsync.mockResolvedValueOnce([{
        line_id: 'line-2',
        repertoire_id: 'rep-1',
        chapter_id: 'ch-1',
        ease_factor: 2.5,
        interval: 0,
        repetitions: 0,
        next_review_date: 0,
        last_review_date: null,
        total_drills: 0,
        correct_count: 0,
        mistake_count: 0,
      }]);

      const [loaded] = await DatabaseService.getAllLineStats();
      expect(loaded.lastReviewDate).toBeUndefined();
    });
  });

  describe('deleteRepertoire cascade', () => {
    it('deletes repertoire, marker, line stats and positions in one transaction', async () => {
      await DatabaseService.initialize();
      await DatabaseService.deleteRepertoire('rep-1');

      expect(mockDb.withTransactionAsync).toHaveBeenCalled();
      const statements = mockDb.runAsync.mock.calls.map(([sql]: [string]) => sql);
      expect(statements).toEqual(expect.arrayContaining([
        expect.stringMatching(/DELETE FROM repertoires WHERE id = \?/),
        expect.stringMatching(/DELETE FROM settings WHERE key = \?/),
        expect.stringMatching(/DELETE FROM line_stats WHERE repertoire_id = \?/),
        expect.stringMatching(/DELETE FROM repertoire_moves WHERE repertoire_id = \?/),
      ]));
    });
  });

  describe('game review statuses', () => {
    it('round-trips booleans as 0/1 and dates as epoch ms', async () => {
      await DatabaseService.initialize();
      await DatabaseService.upsertGameReviewStatus({
        gameId: 'game-1',
        reviewed: true,
        lastReviewDate: new Date('2026-08-26T12:00:00.000Z'),
        keyMovesCount: 3,
        followedRepertoire: false,
      });

      const call = mockDb.runAsync.mock.calls.find(([sql]: [string]) =>
        /INSERT OR REPLACE INTO game_review_statuses/.test(sql)
      );
      expect(call![1]).toEqual([
        'game-1', 1, new Date('2026-08-26T12:00:00.000Z').getTime(), 3, 0,
      ]);

      mockDb.getAllAsync.mockResolvedValueOnce([{
        game_id: 'game-1',
        reviewed: 1,
        last_review_date: new Date('2026-08-26T12:00:00.000Z').getTime(),
        key_moves_count: 3,
        followed_repertoire: 0,
      }]);
      const [loaded] = await DatabaseService.getAllGameReviewStatuses();
      expect(loaded.reviewed).toBe(true);
      expect(loaded.followedRepertoire).toBe(false);
      expect(loaded.lastReviewDate).toBeInstanceOf(Date);
    });
  });

  describe('candidate moves', () => {
    beforeEach(() => DatabaseService.initialize());

    it('getRepertoireMoveCandidates aggregates in SQL, ranked main-line first', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        { move: 'Nf3', n: 12, d: 0 },
        { move: 'Nc3', n: 40, d: 1 },
      ]);

      const result = await DatabaseService.getRepertoireMoveCandidates('some-fen');

      expect(result).toEqual([
        { move: 'Nf3', count: 12, varDepth: 0 },
        { move: 'Nc3', count: 40, varDepth: 1 },
      ]);

      const calls = mockDb.getAllAsync.mock.calls;
      const [sql, args] = calls[calls.length - 1];
      expect(sql).toMatch(/FROM repertoire_moves/);
      expect(sql).toMatch(/COUNT\(DISTINCT chapter_id\)/);
      expect(sql).toMatch(/MIN\(var_depth\)/);
      expect(sql).toMatch(/GROUP BY move/);
      // Main-line-ness first, popularity as tiebreak — the ordering the arrows depend on.
      expect(sql).toMatch(/ORDER BY d ASC, n DESC/);
      expect(sql).toMatch(/move IS NOT NULL/);
      // No color predicate by default — same rule as Find Position
      expect(sql).not.toMatch(/color = \?/);
      // Cap applies after aggregation, so the counts themselves stay correct
      expect(sql.indexOf('LIMIT')).toBeGreaterThan(sql.indexOf('GROUP BY'));
      expect(args[1]).toBe(4);
    });

    it('getGameMoveCandidates ranks purely by how often the move was played', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        { move: 'e5', n: 210 },
        { move: 'c5', n: 90 },
      ]);

      const result = await DatabaseService.getGameMoveCandidates('master', 'some-fen');

      expect(result).toEqual([
        { move: 'e5', count: 210 },
        { move: 'c5', count: 90 },
      ]);

      const calls = mockDb.getAllAsync.mock.calls;
      const [sql, args] = calls[calls.length - 1];
      expect(sql).toMatch(/FROM game_positions/);
      expect(sql).toMatch(/GROUP BY next_move/);
      expect(sql).toMatch(/ORDER BY n DESC/);
      expect(sql).toMatch(/next_move IS NOT NULL/);
      expect(args[0]).toBe('master');
      expect(sql.indexOf('LIMIT')).toBeGreaterThan(sql.indexOf('GROUP BY'));
    });

    it('scopes by repertoire color only when asked', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);
      await DatabaseService.getRepertoireMoveCandidates('some-fen', 4, 'black');
      const calls = mockDb.getAllAsync.mock.calls;
      const [sql, args] = calls[calls.length - 1];
      expect(sql).toMatch(/color = \?/);
      expect(args).toEqual([expect.any(String), 'black', 4]);
    });

    it('returns empty rather than throwing when the index is unavailable', async () => {
      mockDb.getAllAsync.mockRejectedValueOnce(new Error('no such table'));
      await expect(DatabaseService.getRepertoireMoveCandidates('f')).resolves.toEqual([]);

      mockDb.getAllAsync.mockRejectedValueOnce(new Error('no such column'));
      await expect(DatabaseService.getGameMoveCandidates('user', 'f')).resolves.toEqual([]);
    });
  });

  describe('game position indexing records the move played', () => {
    beforeEach(() => DatabaseService.initialize());

    it('stores each position with the SAN played from it, and the final position with null', async () => {
      await DatabaseService.addUserGames([makeGame({ pgn: '1. e4 e5 2. Nf3 *' })]);

      const inserts = mockDb.runAsync.mock.calls
        .filter(([sql]: [string]) => /INSERT INTO game_positions/.test(sql))
        .map(([, args]: [string, any[]]) => args);

      expect(inserts.length).toBeGreaterThan(0);
      for (const args of inserts) {
        expect(args).toHaveLength(4);
      }
      const moves = inserts.map((args: any[]) => args[3]);
      expect(moves).toEqual(['e4', 'e5', 'Nf3', null]);
    });
  });
});
