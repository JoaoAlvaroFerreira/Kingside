jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

const mockFs = {
  documentDirectory: 'file:///mock-documents/',
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, size: 2048 }),
  copyAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
};
jest.mock('expo-file-system', () => mockFs);

const mockSQLite = { openDatabaseAsync: jest.fn() };
jest.mock('expo-sqlite', () => mockSQLite, { virtual: true });

jest.mock('@services/database/DatabaseService', () => ({
  DatabaseService: {
    getBookRecords: jest.fn().mockResolvedValue([]),
    addBookRecord: jest.fn().mockResolvedValue(undefined),
    deleteBookRecord: jest.fn().mockResolvedValue(undefined),
    saveSetting: jest.fn().mockResolvedValue(undefined),
    getSetting: jest.fn().mockResolvedValue(null),
  },
}));

const mockSource = {
  id: 'chesscom' as const,
  listPeriods: jest.fn(),
  fetchPeriod: jest.fn(),
};
jest.mock('@services/gameSources', () => ({
  getGameSource: () => mockSource,
}));

import { BookBuilder } from '../BookBuilder';
import { BookRecord } from '@types';

const record: BookRecord = {
  id: 'book_1', name: 'Test', player: 'someone', sourceFile: 'chesscom:someone',
  fileName: 'book_1.kbook', gameCount: 100, positionCount: 500, sizeBytes: 2048,
  maxPly: 30, hasGames: true, importedAt: new Date(0),
};

const SPEC = JSON.stringify({
  accounts: [{ source: 'chesscom', username: 'someone' }],
  speeds: ['blitz'], ratedOnly: false, standardOnly: true,
});

/** A fake book file: records the SQL it is asked to run. */
function fakeBook(options: { meta?: Record<string, string>; donePeriods?: string[] } = {}) {
  const meta = options.meta ?? {
    schema_version: '1', name: 'Test', player: 'someone', game_count: '100',
    max_ply: '30', full_ply: '16', has_games: '1', spec: SPEC,
  };
  const sql: string[] = [];
  return {
    sql,
    execAsync: jest.fn(async (s: string) => { sql.push(s); }),
    runAsync: jest.fn(async (s: string, _args?: any[]) => { sql.push(s); return { changes: 1 }; }),
    getAllAsync: jest.fn(async (s: string) => {
      sql.push(s);
      if (s.includes('book_meta') && s.includes("LIKE 'period:%'")) {
        return (options.donePeriods ?? []).map(id => ({ key: `period:${id}` }));
      }
      if (s.includes('FROM book_meta')) {
        return Object.entries(meta).map(([key, value]) => ({ key, value }));
      }
      return [];
    }),
    getFirstAsync: jest.fn(async (s: string) => {
      sql.push(s);
      if (s.includes('MAX(id)')) return { id: 100 };
      if (s.includes('COUNT(*)')) return { n: 500 };
      return null;
    }),
    withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    closeAsync: jest.fn().mockResolvedValue(undefined),
  };
}

const never = new AbortController().signal;
const noop = () => {};

beforeEach(() => {
  jest.clearAllMocks();
  mockFs.getInfoAsync.mockResolvedValue({ exists: true, size: 2048 });
});

describe('book refresh', () => {
  it('fetches only the months the book does not already have', async () => {
    const db = fakeBook({ donePeriods: ['2025-01', '2025-02'] });
    mockSQLite.openDatabaseAsync.mockResolvedValue(db);
    mockSource.listPeriods.mockResolvedValue([
      { id: '2025-01', year: 2025, month: 1 },
      { id: '2025-02', year: 2025, month: 2 },
      { id: '2025-03', year: 2025, month: 3 },
    ]);
    mockSource.fetchPeriod.mockResolvedValue(['1. e4 e5 2. Nf3 *']);

    const result = await BookBuilder.refresh(record, noop, never);

    // Skipping finished months is the entire reason a top-up costs minutes, not an hour.
    expect(mockSource.fetchPeriod).toHaveBeenCalledTimes(1);
    expect(mockSource.fetchPeriod.mock.calls[0][2].id).toBe('2025-03');
    expect(result.months).toBe(1);
    expect(result.upToDate).toBe(false);
  });

  it('does no work and says so when every month is already present', async () => {
    const db = fakeBook({ donePeriods: ['2025-01'] });
    mockSQLite.openDatabaseAsync.mockResolvedValue(db);
    mockSource.listPeriods.mockResolvedValue([{ id: '2025-01', year: 2025, month: 1 }]);

    const result = await BookBuilder.refresh(record, noop, never);

    expect(result.upToDate).toBe(true);
    expect(result.newGames).toBe(0);
    expect(mockSource.fetchPeriod).not.toHaveBeenCalled();
    expect(db.sql.join(' ')).not.toContain('CREATE TABLE staging');
  });

  it('merges counts into existing rows instead of replacing them', async () => {
    const db = fakeBook({ donePeriods: [] });
    mockSQLite.openDatabaseAsync.mockResolvedValue(db);
    mockSource.listPeriods.mockResolvedValue([{ id: '2025-03', year: 2025, month: 3 }]);
    mockSource.fetchPeriod.mockResolvedValue(['1. e4 e5 *']);

    await BookBuilder.refresh(record, noop, never);

    const merge = db.sql.find(s => s.includes('ON CONFLICT (fen, move)'));
    expect(merge).toBeDefined();
    // A move already in the book must accumulate, not be overwritten by the new batch.
    expect(merge).toMatch(/n\s*=\s*n\s*\+\s*excluded\.n/);
    expect(merge).toMatch(/hero_n\s*=\s*hero_n\s*\+\s*excluded\.hero_n/);
  });

  it('keeps a new deep pair only if it repeats or the book already knows it', async () => {
    const db = fakeBook({ donePeriods: [] });
    mockSQLite.openDatabaseAsync.mockResolvedValue(db);
    mockSource.listPeriods.mockResolvedValue([{ id: '2025-03', year: 2025, month: 3 }]);
    mockSource.fetchPeriod.mockResolvedValue(['1. e4 e5 *']);

    await BookBuilder.refresh(record, noop, never);

    const merge = db.sql.find(s => s.includes('ON CONFLICT (fen, move)'))!;
    // The original build pruned rare deep pairs and dropped staging, so one cannot be
    // resurrected — but an existing row must still accumulate, hence the EXISTS arm.
    expect(merge).toContain('MIN(s.ply) <= ?');
    expect(merge).toContain('COUNT(*) >= ?');
    expect(merge).toContain('EXISTS (SELECT 1 FROM book_moves');
  });

  it('refuses a book built before the spec was recorded, rather than guessing filters', async () => {
    const db = fakeBook({ meta: { schema_version: '1', game_count: '100', full_ply: '16' } });
    mockSQLite.openDatabaseAsync.mockResolvedValue(db);

    await expect(BookBuilder.refresh(record, noop, never))
      .rejects.toMatchObject({ reason: 'unsupported' });
    expect(mockSource.listPeriods).not.toHaveBeenCalled();
  });

  it('continues game ids from where the book left off', async () => {
    const db = fakeBook({ donePeriods: [] });
    mockSQLite.openDatabaseAsync.mockResolvedValue(db);
    mockSource.listPeriods.mockResolvedValue([{ id: '2025-03', year: 2025, month: 3 }]);
    mockSource.fetchPeriod.mockResolvedValue(['1. e4 e5 *']);

    await BookBuilder.refresh(record, noop, never);

    // Reusing ids would silently overwrite existing games and corrupt every sample list
    // pointing at them.
    const insert = db.runAsync.mock.calls
      .find((call: any[]) => String(call[0]).includes('INSERT INTO book_games'));
    expect(insert?.[1]?.[0]).toBe(101);
  });

  it('fetches the newest missing month first', async () => {
    // A budgeted run must leave behind the months a player actually prepares against.
    // Oldest-first would spend the whole budget on games from a decade ago.
    const db = fakeBook({ donePeriods: [] });
    mockSQLite.openDatabaseAsync.mockResolvedValue(db);
    mockSource.listPeriods.mockResolvedValue([
      { id: '2024-01', year: 2024, month: 1 },
      { id: '2025-06', year: 2025, month: 6 },
    ]);
    mockSource.fetchPeriod.mockResolvedValue([]);

    await BookBuilder.refresh(record, noop, never);

    expect(mockSource.fetchPeriod.mock.calls[0][2].id).toBe('2025-06');
  });

  it('keeps the months of each account separate', async () => {
    // Two accounts have different archives, so a bare month marker would let one account's
    // finished month mark the other's as done and silently skip those games.
    const db = fakeBook({
      meta: {
        schema_version: '1', game_count: '100', full_ply: '16',
        spec: JSON.stringify({
          accounts: [
            { source: 'chesscom', username: 'alice' },
            { source: 'chesscom', username: 'bob' },
          ],
          speeds: ['blitz'], ratedOnly: false, standardOnly: true,
        }),
      },
      donePeriods: ['chesscom:alice:2025-03'],
    });
    mockSQLite.openDatabaseAsync.mockResolvedValue(db);
    mockSource.listPeriods.mockResolvedValue([{ id: '2025-03', year: 2025, month: 3 }]);
    mockSource.fetchPeriod.mockResolvedValue([]);

    const result = await BookBuilder.refresh(record, noop, never);

    // alice's March is done; bob's is not.
    expect(mockSource.fetchPeriod).toHaveBeenCalledTimes(1);
    expect(mockSource.fetchPeriod.mock.calls[0][1].username).toBe('bob');
    expect(result.upToDate).toBe(false);
  });

  it('honours the bare month markers written before books had several accounts', async () => {
    // Those markers can only have meant the book's single account. Ignoring them would
    // make every existing book re-fetch its entire history on the next refresh.
    const db = fakeBook({ donePeriods: ['2025-03'] });
    mockSQLite.openDatabaseAsync.mockResolvedValue(db);
    mockSource.listPeriods.mockResolvedValue([{ id: '2025-03', year: 2025, month: 3 }]);

    const result = await BookBuilder.refresh(record, noop, never);

    expect(result.upToDate).toBe(true);
    expect(mockSource.fetchPeriod).not.toHaveBeenCalled();
  });

  it('drops its scratch table and leaves the book usable when a fetch fails', async () => {
    const db = fakeBook({ donePeriods: [] });
    mockSQLite.openDatabaseAsync.mockResolvedValue(db);
    mockSource.listPeriods.mockResolvedValue([{ id: '2025-03', year: 2025, month: 3 }]);
    mockSource.fetchPeriod.mockRejectedValue(new Error('network died'));

    await expect(BookBuilder.refresh(record, noop, never)).rejects.toThrow('network died');

    expect(db.sql.some(s => s.includes('DROP TABLE IF EXISTS staging'))).toBe(true);
    expect(db.closeAsync).toHaveBeenCalled();
  });
});
