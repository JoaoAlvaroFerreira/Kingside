jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

const mockFs = {
  documentDirectory: 'file:///mock-documents/',
  getInfoAsync: jest.fn(),
  copyAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
};
jest.mock('expo-file-system', () => mockFs);

const mockSQLite = { openDatabaseAsync: jest.fn() };
jest.mock('expo-sqlite', () => mockSQLite, { virtual: true });

const mockDb = {
  getBookRecords: jest.fn().mockResolvedValue([]),
  addBookRecord: jest.fn().mockResolvedValue(undefined),
  deleteBookRecord: jest.fn().mockResolvedValue(undefined),
  saveSetting: jest.fn().mockResolvedValue(undefined),
  getSetting: jest.fn().mockResolvedValue(null),
};
jest.mock('@services/database/DatabaseService', () => ({ DatabaseService: mockDb }));

import { BookService } from '../BookService';
import { BookImportError, BookRecord } from '@types';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';

/** A stand-in book connection returning fixed rows. */
function fakeBook(options: {
  meta?: Record<string, string>;
  moves?: any[];
  games?: any[];
  positionCount?: number;
}) {
  const meta = options.meta ?? {
    schema_version: '1', name: 'Test Book', player: 'Someone',
    source_file: 'test.pgn', game_count: '1000', max_ply: '30', has_games: '1',
  };
  return {
    getAllAsync: jest.fn(async (sql: string) => {
      if (sql.includes('book_meta')) {
        return Object.entries(meta).map(([key, value]) => ({ key, value }));
      }
      if (sql.includes('book_moves')) return options.moves ?? [];
      if (sql.includes('book_games')) return options.games ?? [];
      return [];
    }),
    getFirstAsync: jest.fn(async () => ({ n: options.positionCount ?? 500 })),
    closeAsync: jest.fn().mockResolvedValue(undefined),
  };
}

function record(over: Partial<BookRecord> = {}): BookRecord {
  return {
    id: 'book_1', kind: 'master', name: 'Test Book', player: 'Someone', sourceFile: 'test.pgn',
    fileName: 'book_1.kbook', gameCount: 1000, positionCount: 500,
    sizeBytes: 1024, maxPly: 30, hasGames: true, importedAt: new Date(0),
    ...over,
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockFs.getInfoAsync.mockResolvedValue({ exists: true, size: 1024 });
  mockFs.readDirectoryAsync.mockResolvedValue([]);
  mockDb.getBookRecords.mockResolvedValue([]);
  mockDb.getSetting.mockResolvedValue(null);
  await BookService.closeAll(); // drops the registry cache between tests
});

describe('importBook', () => {
  it('registers a valid book and reports what it contains', async () => {
    mockSQLite.openDatabaseAsync.mockResolvedValue(fakeBook({ positionCount: 593450 }));
    mockFs.getInfoAsync.mockResolvedValue({ exists: true, size: 127365120 });

    const result = await BookService.importBook('file:///picked/naroditsky.kbook', 'Naroditsky');

    expect(result.name).toBe('Naroditsky');
    expect(result.gameCount).toBe(1000);
    expect(result.positionCount).toBe(593450);
    expect(result.hasGames).toBe(true);
    expect(mockDb.addBookRecord).toHaveBeenCalledWith(
      expect.objectContaining({ positionCount: 593450 })
    );
  });

  it('copies the file rather than reading it', async () => {
    mockSQLite.openDatabaseAsync.mockResolvedValue(fakeBook({}));
    await BookService.importBook('file:///picked/big.kbook');

    // A book can be 100MB+; reading one into a string is the failure this format avoids.
    expect(mockFs.copyAsync).toHaveBeenCalledTimes(1);
    expect((mockFs as any).readAsStringAsync).toBeUndefined();
  });

  it('rejects a database that is not a book, and removes the copy', async () => {
    const notABook = {
      getAllAsync: jest.fn().mockRejectedValue(new Error('no such table: book_meta')),
      closeAsync: jest.fn().mockResolvedValue(undefined),
    };
    mockSQLite.openDatabaseAsync.mockResolvedValue(notABook);

    await expect(BookService.importBook('file:///picked/other.db'))
      .rejects.toMatchObject({ reason: 'not-a-book' });

    // A rejected import must leave nothing behind.
    expect(mockFs.deleteAsync).toHaveBeenCalled();
    expect(mockDb.addBookRecord).not.toHaveBeenCalled();
  });

  it('rejects a book built for a newer schema', async () => {
    mockSQLite.openDatabaseAsync.mockResolvedValue(
      fakeBook({ meta: { schema_version: '99', name: 'Future' } })
    );

    const error = await BookService.importBook('file:///picked/future.kbook').catch(e => e);
    expect(error).toBeInstanceOf(BookImportError);
    expect(error.reason).toBe('unsupported-version');
    expect(mockDb.addBookRecord).not.toHaveBeenCalled();
  });

  it('rejects a file that is not a database at all', async () => {
    mockSQLite.openDatabaseAsync.mockRejectedValue(new Error('file is not a database'));

    await expect(BookService.importBook('file:///picked/photo.jpg'))
      .rejects.toMatchObject({ reason: 'not-a-database' });
    expect(mockFs.deleteAsync).toHaveBeenCalled();
  });
});

describe('listBooks', () => {
  it('forgets records whose file has gone missing', async () => {
    // A backup restore swaps kingside.db without touching the book files on disk.
    mockDb.getBookRecords.mockResolvedValue([
      record({ id: 'gone', fileName: 'gone.kbook' }),
      record({ id: 'here', fileName: 'here.kbook' }),
    ]);
    mockFs.getInfoAsync.mockImplementation(async (path: string) =>
      ({ exists: !path.includes('gone.kbook'), size: 10 })
    );

    const books = await BookService.listBooks();

    expect(books.map(b => b.id)).toEqual(['here']);
    expect(mockDb.deleteBookRecord).toHaveBeenCalledWith('gone');
  });
});

describe('getMoveCandidates', () => {
  it('sums counts for the same move across books and ranks by total', async () => {
    mockDb.getBookRecords.mockResolvedValue([
      record({ id: 'a', fileName: 'a.kbook' }),
      record({ id: 'b', fileName: 'b.kbook' }),
    ]);
    const bookA = fakeBook({ moves: [
      { move: 'e4', n: 100, hero_n: 60, white_n: 50, draw_n: 20, black_n: 30, sample_games: '1,2' },
      { move: 'd4', n: 80, hero_n: 40, white_n: 40, draw_n: 20, black_n: 20, sample_games: '3' },
    ]});
    const bookB = fakeBook({ moves: [
      { move: 'd4', n: 90, hero_n: 45, white_n: 45, draw_n: 25, black_n: 20, sample_games: '7' },
    ]});
    mockSQLite.openDatabaseAsync.mockImplementation(async (name: string) =>
      name.startsWith('a') ? bookA : bookB
    );

    const candidates = await BookService.getMoveCandidates(START);

    // d4 totals 170 across both books and so outranks e4's 100, even though e4 leads in A.
    expect(candidates.map(c => [c.move, c.count])).toEqual([['d4', 170], ['e4', 100]]);
    expect(candidates[0].heroCount).toBe(85);
  });

  it('applies the display cap after merging, not per book', async () => {
    mockDb.getBookRecords.mockResolvedValue([record({ id: 'a', fileName: 'a.kbook' })]);
    mockSQLite.openDatabaseAsync.mockResolvedValue(fakeBook({ moves: [
      { move: 'e4', n: 5, hero_n: 0, white_n: 0, draw_n: 0, black_n: 0, sample_games: null },
      { move: 'd4', n: 4, hero_n: 0, white_n: 0, draw_n: 0, black_n: 0, sample_games: null },
      { move: 'c4', n: 3, hero_n: 0, white_n: 0, draw_n: 0, black_n: 0, sample_games: null },
      { move: 'Nf3', n: 2, hero_n: 0, white_n: 0, draw_n: 0, black_n: 0, sample_games: null },
      { move: 'b3', n: 1, hero_n: 0, white_n: 0, draw_n: 0, black_n: 0, sample_games: null },
    ]}));

    const candidates = await BookService.getMoveCandidates(START, 4);
    expect(candidates).toHaveLength(4);
    expect(candidates[3].move).toBe('Nf3');
  });

  it('parses sample game ids and tolerates a null', async () => {
    mockDb.getBookRecords.mockResolvedValue([record({ id: 'a', fileName: 'a.kbook' })]);
    mockSQLite.openDatabaseAsync.mockResolvedValue(fakeBook({ moves: [
      { move: 'e4', n: 2, hero_n: 1, white_n: 1, draw_n: 0, black_n: 1, sample_games: '9,8,7' },
      { move: 'd4', n: 1, hero_n: 0, white_n: 0, draw_n: 0, black_n: 1, sample_games: null },
    ]}));

    const candidates = await BookService.getMoveCandidates(START);
    expect(candidates[0].sampleGameIds).toEqual([9, 8, 7]);
    expect(candidates[1].sampleGameIds).toEqual([]);
  });

  it('normalizes the FEN before querying, so counters never split a position', async () => {
    mockDb.getBookRecords.mockResolvedValue([record({ id: 'a', fileName: 'a.kbook' })]);
    const book = fakeBook({ moves: [] });
    mockSQLite.openDatabaseAsync.mockResolvedValue(book);

    await BookService.getMoveCandidates(`${START} 0 1`);

    expect(book.getAllAsync).toHaveBeenCalledWith(expect.any(String), [START, expect.any(Number)]);
  });

  it('returns nothing when no book is installed', async () => {
    mockDb.getBookRecords.mockResolvedValue([]);
    expect(await BookService.getMoveCandidates(START)).toEqual([]);
    expect(mockSQLite.openDatabaseAsync).not.toHaveBeenCalled();
  });
});

describe('book isolation', () => {
  it('keeps opponent books out of the Master arrows', async () => {
    // An opponent book is one player's blitz history. Letting it join the unscoped query
    // would quietly redefine what "master games" means on the board.
    mockDb.getBookRecords.mockResolvedValue([
      record({ id: 'm', fileName: 'm.kbook', kind: 'master' }),
      record({ id: 'o', fileName: 'o.kbook', kind: 'opponent' }),
    ]);
    const master = fakeBook({ moves: [
      { move: 'e4', n: 10, hero_n: 5, white_n: 5, draw_n: 0, black_n: 5, sample_games: null },
    ]});
    const opponent = fakeBook({ moves: [
      { move: 'd4', n: 99, hero_n: 99, white_n: 99, draw_n: 0, black_n: 0, sample_games: null },
    ]});
    mockSQLite.openDatabaseAsync.mockImplementation(async (name: string) =>
      name.startsWith('m') ? master : opponent
    );

    const candidates = await BookService.getMoveCandidates(START);

    expect(candidates.map(c => c.move)).toEqual(['e4']);
  });

  it('reads only the named book when one is given', async () => {
    mockDb.getBookRecords.mockResolvedValue([
      record({ id: 'm', fileName: 'm.kbook', kind: 'master' }),
      record({ id: 'o', fileName: 'o.kbook', kind: 'opponent' }),
    ]);
    const master = fakeBook({ moves: [
      { move: 'e4', n: 10, hero_n: 5, white_n: 5, draw_n: 0, black_n: 5, sample_games: null },
    ]});
    const opponent = fakeBook({ moves: [
      { move: 'd4', n: 99, hero_n: 99, white_n: 99, draw_n: 0, black_n: 0, sample_games: null },
    ]});
    mockSQLite.openDatabaseAsync.mockImplementation(async (name: string) =>
      name.startsWith('m') ? master : opponent
    );

    // Preparing against someone shows their moves and nobody else's.
    const candidates = await BookService.getMoveCandidates(START, 4, true, 'o');
    expect(candidates.map(c => c.move)).toEqual(['d4']);
  });

  it('lists books of one kind', async () => {
    mockDb.getBookRecords.mockResolvedValue([
      record({ id: 'm', fileName: 'm.kbook', kind: 'master' }),
      record({ id: 'o', fileName: 'o.kbook', kind: 'opponent' }),
    ]);
    expect((await BookService.listBooks('opponent')).map(b => b.id)).toEqual(['o']);
    expect((await BookService.listBooks('master')).map(b => b.id)).toEqual(['m']);
    expect((await BookService.listBooks()).map(b => b.id)).toEqual(['m', 'o']);
  });
});

describe('getGames', () => {
  it('returns games in the order the ids were ranked, not the order SQLite returned them', async () => {
    mockDb.getBookRecords.mockResolvedValue([record({ id: 'a', fileName: 'a.kbook' })]);
    mockSQLite.openDatabaseAsync.mockResolvedValue(fakeBook({ games: [
      { id: 7, white: 'W7', black: 'B7', result: '1-0', moves: 'e4' },
      { id: 9, white: 'W9', black: 'B9', result: '0-1', moves: 'd4' },
    ]}));

    const games = await BookService.getGames('a', [9, 7]);
    expect(games.map(g => g.id)).toEqual([9, 7]);
    expect(games[0].white).toBe('W9');
  });

  it('returns nothing for a counts-only book', async () => {
    mockDb.getBookRecords.mockResolvedValue([
      record({ id: 'a', fileName: 'a.kbook', hasGames: false }),
    ]);
    expect(await BookService.getGames('a', [1, 2])).toEqual([]);
  });
});

describe('player moves only', () => {
  const heroRows = [
    { move: 'e4', n: 100, hero_n: 60, white_n: 50, draw_n: 20, black_n: 30, sample_games: '1,2' },
    { move: 'd4', n: 900, hero_n: 5, white_n: 400, draw_n: 200, black_n: 300, sample_games: '3' },
  ];

  it('filters to the player and ranks by their count, not the blended one', async () => {
    mockDb.getBookRecords.mockResolvedValue([record({ id: 'a', fileName: 'a.kbook' })]);
    const book = fakeBook({ moves: heroRows });
    mockSQLite.openDatabaseAsync.mockResolvedValue(book);

    const candidates = await BookService.getMoveCandidates(START, 4, true);

    // d4 leads on raw count (900 vs 100) but the player almost never chose it, so under
    // this filter e4 has to come first — otherwise the toggle changes nothing visible.
    expect(candidates.map(c => c.move)).toEqual(['e4', 'd4']);
    const [sql] = book.getAllAsync.mock.calls[0];
    expect(sql).toContain('hero_n > 0');
    expect(sql).toContain('ORDER BY hero_n DESC');
  });

  it('leaves the query unfiltered when the toggle is off', async () => {
    mockDb.getBookRecords.mockResolvedValue([record({ id: 'a', fileName: 'a.kbook' })]);
    const book = fakeBook({ moves: heroRows });
    mockSQLite.openDatabaseAsync.mockResolvedValue(book);

    const candidates = await BookService.getMoveCandidates(START, 4, false);

    expect(candidates.map(c => c.move)).toEqual(['d4', 'e4']);
    const [sql] = book.getAllAsync.mock.calls[0];
    expect(sql).not.toContain('hero_n > 0');
  });
});

describe('getGamesAtPosition', () => {
  const manyMoves = Array.from({ length: 20 }, (_, i) => ({
    move: `m${i}`, n: 20 - i, hero_n: 1, white_n: 1, draw_n: 0, black_n: 0,
    sample_games: Array.from({ length: 8 }, (_, j) => i * 8 + j + 1).join(','),
  }));

  it('reports hasMore when the cap hides games, and caps at 50', async () => {
    mockDb.getBookRecords.mockResolvedValue([record({ id: 'a', fileName: 'a.kbook' })]);
    // 20 moves x 8 samples = 160 distinct games available, far past the cap.
    mockSQLite.openDatabaseAsync.mockResolvedValue(fakeBook({
      moves: manyMoves,
      games: Array.from({ length: 200 }, (_, i) => ({
        id: i + 1, white: 'W', black: 'B', result: '1-0', date: '2025.01.01', moves: 'e4',
      })),
    }));

    const result = await BookService.getGamesAtPosition(START);

    expect(result.games).toHaveLength(50);
    expect(result.hasMore).toBe(true);
  });

  it('reports how many games really reached the position, not how many it kept', async () => {
    // The two differ by orders of magnitude at shallow positions: each move keeps a
    // bounded sample, so "how many can I open" is not "how often have they been here".
    // Showing only the sample size reads as "that is all they played".
    mockDb.getBookRecords.mockResolvedValue([record({ id: 'a', fileName: 'a.kbook' })]);
    mockSQLite.openDatabaseAsync.mockResolvedValue(fakeBook({
      moves: [
        { move: 'e4', n: 500, hero_n: 300, white_n: 250, draw_n: 100, black_n: 150, sample_games: '1,2' },
        { move: 'd4', n: 221, hero_n: 100, white_n: 100, draw_n: 50, black_n: 71, sample_games: '3' },
      ],
      games: [
        { id: 1, white: 'W', black: 'B', result: '1-0', date: '2025.01.01', moves: 'e4' },
        { id: 2, white: 'W', black: 'B', result: '1-0', date: '2025.01.02', moves: 'e4' },
        { id: 3, white: 'W', black: 'B', result: '0-1', date: '2025.01.03', moves: 'd4' },
      ],
    }));

    const result = await BookService.getGamesAtPosition(START);

    expect(result.games).toHaveLength(3);
    expect(result.totalGames).toBe(721);
  });

  it('counts only the player when reading their own book', async () => {
    mockDb.getBookRecords.mockResolvedValue([record({ id: 'a', fileName: 'a.kbook' })]);
    mockSQLite.openDatabaseAsync.mockResolvedValue(fakeBook({
      moves: [
        { move: 'e4', n: 500, hero_n: 300, white_n: 250, draw_n: 100, black_n: 150, sample_games: '1' },
      ],
      games: [{ id: 1, white: 'W', black: 'B', result: '1-0', date: '2025.01.01', moves: 'e4' }],
    }));

    // Preparation asks how often *they* have been here, so their own count is the total.
    const result = await BookService.getGamesAtPosition(START, true);
    expect(result.totalGames).toBe(300);
  });

  it('does not claim more when everything fits', async () => {
    mockDb.getBookRecords.mockResolvedValue([record({ id: 'a', fileName: 'a.kbook' })]);
    mockSQLite.openDatabaseAsync.mockResolvedValue(fakeBook({
      moves: [{ move: 'e4', n: 2, hero_n: 1, white_n: 1, draw_n: 0, black_n: 1, sample_games: '1,2' }],
      games: [
        { id: 1, white: 'W1', black: 'B1', result: '1-0', date: '2020.05.05', moves: 'e4' },
        { id: 2, white: 'W2', black: 'B2', result: '0-1', date: '2025.05.05', moves: 'd4' },
      ],
    }));

    const result = await BookService.getGamesAtPosition(START);

    expect(result.hasMore).toBe(false);
    // Newest first, regardless of the order the ids were ranked in.
    expect(result.games.map(g => g.date)).toEqual(['2025.05.05', '2020.05.05']);
  });
});

describe('deleteBook', () => {
  it('removes the file with its sidecars and forgets the record', async () => {
    mockDb.getBookRecords.mockResolvedValue([record({ id: 'a', fileName: 'a.kbook' })]);

    await BookService.deleteBook('a');

    const deleted = mockFs.deleteAsync.mock.calls.map(c => c[0]);
    expect(deleted).toEqual(expect.arrayContaining([
      'file:///mock-documents/SQLite/a.kbook',
      'file:///mock-documents/SQLite/a.kbook-wal',
      'file:///mock-documents/SQLite/a.kbook-shm',
    ]));
    expect(mockDb.deleteBookRecord).toHaveBeenCalledWith('a');
  });
});

describe('change notification', () => {
  it('bumps the revision and notifies on import and on delete', async () => {
    // Position lookups memoize on the FEN, so without this an import leaves the board
    // showing the pre-import answer for whatever position it is already sitting on.
    const seen: number[] = [];
    const unsubscribe = BookService.subscribe(() => seen.push(BookService.revision));

    mockSQLite.openDatabaseAsync.mockResolvedValue(fakeBook({}));
    const before = BookService.revision;
    await BookService.importBook('file:///picked/a.kbook');
    expect(BookService.revision).toBeGreaterThan(before);

    mockDb.getBookRecords.mockResolvedValue([record({ id: 'a', fileName: 'a.kbook' })]);
    await BookService.deleteBook('a');

    expect(seen).toHaveLength(2);
    unsubscribe();

    await BookService.importBook('file:///picked/b.kbook');
    expect(seen).toHaveLength(2); // unsubscribed listeners stop hearing about it
  });
});

describe('pruneOrphanFiles', () => {
  it('deletes book files no record points at, and leaves registered ones alone', async () => {
    mockDb.getBookRecords.mockResolvedValue([record({ id: 'a', fileName: 'keep.kbook' })]);
    mockFs.readDirectoryAsync.mockResolvedValue([
      'kingside.db', 'keep.kbook', 'orphan.kbook',
    ]);
    mockFs.getInfoAsync.mockResolvedValue({ exists: true, size: 2048 });

    const reclaimed = await BookService.pruneOrphanFiles();

    const deleted = mockFs.deleteAsync.mock.calls.map(c => c[0]);
    expect(deleted).toContain('file:///mock-documents/SQLite/orphan.kbook');
    expect(deleted).not.toContain('file:///mock-documents/SQLite/keep.kbook');
    expect(deleted).not.toContain('file:///mock-documents/SQLite/kingside.db');
    expect(reclaimed).toBe(2048);
  });

  it('spares the file of an interrupted build', async () => {
    // Its finished-month markers live inside that file — deleting it as an orphan would
    // turn a resumable pause into a full restart.
    mockDb.getBookRecords.mockResolvedValue([]);
    mockDb.getSetting.mockResolvedValue({
      fileName: 'half-built.kbook', displayName: 'Partial', spec: {},
    });
    mockFs.readDirectoryAsync.mockResolvedValue(['half-built.kbook', 'orphan.kbook']);
    mockFs.getInfoAsync.mockResolvedValue({ exists: true, size: 1024 });

    await BookService.pruneOrphanFiles();

    const deleted = mockFs.deleteAsync.mock.calls.map(c => c[0]);
    expect(deleted).toContain('file:///mock-documents/SQLite/orphan.kbook');
    expect(deleted).not.toContain('file:///mock-documents/SQLite/half-built.kbook');
  });
});
