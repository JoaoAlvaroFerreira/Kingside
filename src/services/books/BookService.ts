/**
 * BookService - imported opening books, each a separate SQLite file.
 *
 * A book is opened on its own connection rather than ATTACHed to kingside.db, because
 * nothing here needs a cross-database join: candidates come from `book_moves` alone and
 * games from `book_games` alone. Keeping the files separate is also what makes a book
 * deletable as one `unlink` and keeps 100MB+ of regenerable data out of every backup.
 *
 * Books are read-only. Nothing in this service writes to a book file.
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import {
  BookRecord,
  BookMoveCandidate,
  BookGame,
  BookImportError,
  BOOK_SCHEMA_VERSION,
  normalizeFen,
  MasterGame,
} from '@types';
import { DatabaseService } from '@services/database/DatabaseService';

let SQLite: any = null;
if (Platform.OS !== 'web') {
  SQLite = require('expo-sqlite');
}

/** Matches the board's arrow cap — see CANDIDATE_MOVE_LIMIT in DatabaseService. */
const CANDIDATE_MOVE_LIMIT = 4;
/** Rows returned for the position's move list, which shows more than the arrows do. */
const MOVE_LIST_LIMIT = 24;
const BOOK_EXTENSION = '.kbook';
const PENDING_BUILD_KEY = 'book_build_pending';

/** An interrupted on-device build, kept so it can be resumed rather than restarted. */
export interface PendingBuild {
  fileName: string;
  displayName: string;
  /** The spec, serialised — dates come back as ISO strings. */
  spec: any;
}
/** Games surfaced for one position. Bounded like POSITION_MATCH_LIMIT, for the same reason. */
const POSITION_SAMPLE_LIMIT = 50;

/**
 * Games from a position, and whether the cap hid any.
 *
 * `hasMore` exists because the count is a sample size, not a total: a bare "50" reads as
 * "there are exactly 50 games here" when the real number is usually far larger.
 */
export interface BookGamesResult {
  games: MasterGame[];
  hasMore: boolean;
}

const EMPTY_GAMES: BookGamesResult = { games: [], hasMore: false };

class BookServiceClass {
  private isWeb = Platform.OS === 'web';
  /** Open connections, keyed by book id. Opened lazily, closed on delete. */
  private connections = new Map<string, any>();
  /** Registry cache so board queries don't hit the main DB on every position change. */
  private records: BookRecord[] | null = null;

  private get sqliteDir(): string {
    return `${FileSystem.documentDirectory}SQLite/`;
  }

  private bookPath(fileName: string): string {
    return `${this.sqliteDir}${fileName}`;
  }

  /**
   * Installed books, newest first.
   *
   * Records are reconciled against the filesystem, because the two can drift: a backup
   * restore swaps kingside.db (and with it this registry) while the book files on disk
   * stay put. A record whose file is missing is dropped rather than left to fail on every
   * board query.
   */
  async listBooks(): Promise<BookRecord[]> {
    if (this.isWeb) return [];
    if (this.records) return this.records;

    const stored = await DatabaseService.getBookRecords();
    const present: BookRecord[] = [];
    for (const record of stored) {
      const info = await FileSystem.getInfoAsync(this.bookPath(record.fileName));
      if (info.exists) {
        present.push(record);
      } else {
        console.warn(`[BookService] Book file missing, forgetting "${record.name}"`);
        await DatabaseService.deleteBookRecord(record.id);
      }
    }
    this.records = present;
    return present;
  }

  /**
   * Book files on disk that no record points at — left behind when a restore rolls the
   * registry back past an import. Returns how many bytes were reclaimed.
   */
  async pruneOrphanFiles(): Promise<number> {
    if (this.isWeb) return 0;
    const known = new Set((await this.listBooks()).map(b => b.fileName));
    // An interrupted build is not an orphan — it is a resume point.
    const pending = await this.getPendingBuild();
    if (pending) known.add(pending.fileName);
    let reclaimed = 0;
    try {
      const entries = await FileSystem.readDirectoryAsync(this.sqliteDir);
      for (const entry of entries) {
        if (!entry.endsWith(BOOK_EXTENSION) || known.has(entry)) continue;
        const path = this.bookPath(entry);
        const info = await FileSystem.getInfoAsync(path);
        reclaimed += (info as any).size ?? 0;
        await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
        console.log(`[BookService] Removed orphaned book file ${entry}`);
      }
    } catch { /* directory unreadable — nothing to prune */ }
    return reclaimed;
  }

  /**
   * Bumped whenever the installed set changes. Position lookups memoize on the FEN, so
   * without this an import or delete leaves the board showing the previous answer for
   * whatever position it is already sitting on.
   */
  revision = 0;
  private listeners = new Set<() => void>();

  /** Subscribe to import/delete. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Drop the cached registry so the next read reflects an import or delete. */
  private invalidate(): void {
    this.records = null;
    this.revision++;
    this.listeners.forEach(listener => listener());
  }

  private async connect(book: BookRecord): Promise<any | null> {
    const existing = this.connections.get(book.id);
    if (existing) return existing;
    try {
      // Opened by bare name: expo-sqlite resolves it inside the SQLite directory, which
      // is where importBook put the file.
      const db = await SQLite.openDatabaseAsync(book.fileName);
      this.connections.set(book.id, db);
      return db;
    } catch (e) {
      console.warn(`[BookService] Could not open book ${book.name}:`, e);
      return null;
    }
  }

  private async disconnect(id: string): Promise<void> {
    const db = this.connections.get(id);
    if (!db) return;
    try {
      await db.closeAsync();
    } catch { /* already closed */ }
    this.connections.delete(id);
  }

  /** Close every open book. Call before replacing the database files (restore). */
  async closeAll(): Promise<void> {
    for (const id of Array.from(this.connections.keys())) {
      await this.disconnect(id);
    }
    this.invalidate();
  }

  // ==================== IMPORT / DELETE ====================

  /**
   * Copy a picked .kbook into place and register it.
   *
   * The file is copied, never read into memory: a book can be 100MB+, and reading one as
   * a string is exactly the failure that made importing the source PGN impossible.
   */
  async importBook(uri: string, displayName?: string): Promise<BookRecord> {
    if (this.isWeb) {
      throw new BookImportError('copy-failed', 'Opening books are not supported on web.');
    }

    const id = `book_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fileName = `${id}${BOOK_EXTENSION}`;
    const destination = this.bookPath(fileName);

    // expo-sqlite will not create the directory for us on a fresh install.
    await FileSystem.makeDirectoryAsync(this.sqliteDir, { intermediates: true }).catch(() => {});

    try {
      await FileSystem.copyAsync({ from: uri, to: destination });
    } catch (e) {
      throw new BookImportError('copy-failed', `Could not copy the book file: ${e}`);
    }

    let db: any = null;
    try {
      db = await SQLite.openDatabaseAsync(fileName);
      const meta = await this.readMeta(db);
      const info = await FileSystem.getInfoAsync(destination);

      const record: BookRecord = {
        id,
        name: displayName || meta.name || 'Opening book',
        player: meta.player || '',
        sourceFile: meta.source_file || '',
        fileName,
        gameCount: Number(meta.game_count) || 0,
        positionCount: await this.countPositions(db),
        sizeBytes: (info as any).size ?? 0,
        maxPly: Number(meta.max_ply) || 0,
        hasGames: meta.has_games === '1',
        importedAt: new Date(),
      };

      await DatabaseService.addBookRecord(record);
      this.connections.set(id, db);
      this.invalidate();
      return record;
    } catch (e) {
      // Roll the copy back so a rejected file leaves nothing behind.
      if (db) {
        try { await db.closeAsync(); } catch { /* ignore */ }
      }
      await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => {});
      throw e instanceof BookImportError
        ? e
        : new BookImportError('not-a-database', `The file could not be opened as a book: ${e}`);
    }
  }

  /** Read and validate book_meta, rejecting anything this build cannot read. */
  private async readMeta(db: any): Promise<Record<string, string>> {
    let rows: Array<{ key: string; value: string }>;
    try {
      rows = await db.getAllAsync('SELECT key, value FROM book_meta') as any;
    } catch {
      throw new BookImportError(
        'not-a-book',
        'This SQLite file has no book_meta table, so it is not an opening book.'
      );
    }

    const meta: Record<string, string> = {};
    for (const row of rows) meta[row.key] = row.value;

    const version = Number(meta.schema_version);
    if (!version) {
      throw new BookImportError('not-a-book', 'The file is missing its book schema version.');
    }
    if (version > BOOK_SCHEMA_VERSION) {
      throw new BookImportError(
        'unsupported-version',
        `This book was built for a newer version of Kingside (book v${version}, this build reads v${BOOK_SCHEMA_VERSION}).`
      );
    }
    return meta;
  }

  private async countPositions(db: any): Promise<number> {
    try {
      const row = await db.getFirstAsync('SELECT COUNT(*) AS n FROM book_moves') as any;
      return row?.n ?? 0;
    } catch {
      throw new BookImportError('not-a-book', 'The file has no book_moves table.');
    }
  }

  /**
   * Register a book this app just built, reading its own metadata back.
   *
   * Shares readMeta/countPositions with importBook so a built book is validated exactly
   * like an imported one — if the builder ever writes something the reader cannot handle,
   * it fails here rather than on the board.
   */
  async registerBuiltBook(fileName: string, displayName: string): Promise<BookRecord> {
    const destination = this.bookPath(fileName);
    const db = await SQLite.openDatabaseAsync(fileName);
    try {
      const meta = await this.readMeta(db);
      const info = await FileSystem.getInfoAsync(destination);
      const record: BookRecord = {
        id: fileName.replace(BOOK_EXTENSION, ''),
        name: displayName || meta.name || 'Opening book',
        player: meta.player || '',
        sourceFile: meta.source_file || '',
        fileName,
        gameCount: Number(meta.game_count) || 0,
        positionCount: await this.countPositions(db),
        sizeBytes: (info as any).size ?? 0,
        maxPly: Number(meta.max_ply) || 0,
        hasGames: meta.has_games === '1',
        importedAt: new Date(),
      };
      await DatabaseService.addBookRecord(record);
      this.connections.set(record.id, db);
      await this.clearPendingBuild();
      this.invalidate();
      return record;
    } catch (e) {
      try { await db.closeAsync(); } catch { /* ignore */ }
      throw e;
    }
  }

  /**
   * Re-read a book's stats after its file changed underneath us (a refresh added months).
   * The id and display name are kept: the user's library entry is the same book.
   */
  async reregisterBook(record: BookRecord): Promise<BookRecord> {
    await this.disconnect(record.id);
    const db = await SQLite.openDatabaseAsync(record.fileName);
    try {
      const meta = await this.readMeta(db);
      const info = await FileSystem.getInfoAsync(this.bookPath(record.fileName));
      const updated: BookRecord = {
        ...record,
        gameCount: Number(meta.game_count) || record.gameCount,
        positionCount: await this.countPositions(db),
        sizeBytes: (info as any).size ?? record.sizeBytes,
      };
      await DatabaseService.addBookRecord(updated);
      this.connections.set(record.id, db);
      this.invalidate();
      return updated;
    } catch (e) {
      try { await db.closeAsync(); } catch { /* ignore */ }
      throw e;
    }
  }

  /**
   * An interrupted build keeps its file, because the finished-month markers inside it are
   * what make resuming cheap. Recording it here stops pruneOrphanFiles from deleting the
   * very thing a resume needs.
   */
  async setPendingBuild(state: PendingBuild): Promise<void> {
    await DatabaseService.saveSetting(PENDING_BUILD_KEY, state);
  }

  async getPendingBuild(): Promise<PendingBuild | null> {
    const stored = await DatabaseService.getSetting<PendingBuild | null>(PENDING_BUILD_KEY);
    return stored && stored.fileName ? stored : null;
  }

  async clearPendingBuild(): Promise<void> {
    await DatabaseService.saveSetting(PENDING_BUILD_KEY, null);
  }

  /** Discard an interrupted build and its file. */
  async discardPendingBuild(): Promise<void> {
    const pending = await this.getPendingBuild();
    if (pending) {
      for (const suffix of ['', '-wal', '-shm']) {
        await FileSystem
          .deleteAsync(`${this.bookPath(pending.fileName)}${suffix}`, { idempotent: true })
          .catch(() => {});
      }
    }
    await this.clearPendingBuild();
  }

  /** Remove a book: close it, delete its file, forget it. */
  async deleteBook(id: string): Promise<void> {
    if (this.isWeb) return;
    const books = await this.listBooks();
    const book = books.find(b => b.id === id);

    await this.disconnect(id);
    if (book) {
      for (const suffix of ['', '-wal', '-shm']) {
        await FileSystem
          .deleteAsync(`${this.bookPath(book.fileName)}${suffix}`, { idempotent: true })
          .catch(() => {});
      }
    }
    await DatabaseService.deleteBookRecord(id);
    this.invalidate();
  }

  // ==================== QUERIES ====================

  /**
   * Which moves the books play from this position, most frequent first.
   *
   * Counts are summed across books, so two corpora covering the same opening reinforce
   * rather than compete for arrow slots. `sampleGameIds` stays with the book that owns
   * those ids — they are only meaningful there.
   */
  async getMoveCandidates(
    fen: string,
    limit: number = CANDIDATE_MOVE_LIMIT,
    playerMovesOnly = false
  ): Promise<BookMoveCandidate[]> {
    if (this.isWeb) return [];
    const books = await this.listBooks();
    if (books.length === 0) return [];

    const normalized = normalizeFen(fen);
    const merged = new Map<string, BookMoveCandidate>();

    for (const book of books) {
      const db = await this.connect(book);
      if (!db) continue;
      try {
        // With playerMovesOnly the ranking is by hero_n, not n: a move the player answered
        // once but their opponents chose hundreds of times is rare *for them*, and ordering
        // by the blended count would put it on top.
        const countColumn = playerMovesOnly ? 'hero_n' : 'n';
        // The cap is applied per book after ranking, never to the rows scanned — capping
        // the scan would corrupt the counts at exactly the early positions where the
        // ranking matters most.
        const rows = await db.getAllAsync(
          `SELECT move, n, hero_n, white_n, draw_n, black_n, sample_games
           FROM book_moves
           WHERE fen = ?${playerMovesOnly ? ' AND hero_n > 0' : ''}
           ORDER BY ${countColumn} DESC
           LIMIT ?`,
          [normalized, MOVE_LIST_LIMIT]
        ) as Array<{
          move: string; n: number; hero_n: number;
          white_n: number; draw_n: number; black_n: number; sample_games: string | null;
        }>;

        for (const row of rows) {
          const existing = merged.get(row.move);
          if (existing) {
            existing.count += row.n;
            existing.heroCount += row.hero_n;
            existing.whiteWins += row.white_n;
            existing.draws += row.draw_n;
            existing.blackWins += row.black_n;
          } else {
            merged.set(row.move, {
              move: row.move,
              count: row.n,
              heroCount: row.hero_n,
              whiteWins: row.white_n,
              draws: row.draw_n,
              blackWins: row.black_n,
              sampleGameIds: parseGameIds(row.sample_games),
              bookId: book.id,
            });
          }
        }
      } catch (e) {
        console.warn(`[BookService] Query failed for book ${book.name}:`, e);
      }
    }

    const rank = playerMovesOnly
      ? (a: BookMoveCandidate, b: BookMoveCandidate) => b.heroCount - a.heroCount
      : (a: BookMoveCandidate, b: BookMoveCandidate) => b.count - a.count;

    return Array.from(merged.values()).sort(rank).slice(0, limit);
  }

  /** Full move list for the position panel — same data, less truncation. */
  async getPositionMoves(fen: string, playerMovesOnly = false): Promise<BookMoveCandidate[]> {
    return this.getMoveCandidates(fen, MOVE_LIST_LIMIT, playerMovesOnly);
  }

  /** Fetch specific games out of one book, for drill-down from a move. */
  async getGames(bookId: string, ids: number[]): Promise<BookGame[]> {
    if (this.isWeb || ids.length === 0) return [];
    const books = await this.listBooks();
    const book = books.find(b => b.id === bookId);
    if (!book || !book.hasGames) return [];

    const db = await this.connect(book);
    if (!db) return [];

    try {
      const placeholders = ids.map(() => '?').join(',');
      const rows = await db.getAllAsync(
        `SELECT * FROM book_games WHERE id IN (${placeholders})`,
        ids
      ) as any[];
      // Preserve the order the ids arrived in — they are ranked, not arbitrary.
      const byId = new Map(rows.map(r => [r.id, r]));
      return ids
        .map(id => byId.get(id))
        .filter(Boolean)
        .map(row => toBookGame(row, bookId));
    } catch (e) {
      console.warn(`[BookService] Could not read games from ${book.name}:`, e);
      return [];
    }
  }

  /**
   * Games from the books that reach this position, as MasterGames the existing list can render.
   *
   * This is a *sample*, not an exhaustive answer, and it cannot be otherwise: knowing every
   * game that reached a position needs a row per game per ply, the 13M-row index the book
   * format exists to avoid. What each move carries instead is a bounded set of recent games
   * that continued with it, so the union across this position's moves is what can be shown.
   */
  async getGamesAtPosition(
    fen: string,
    playerMovesOnly = false,
    limit: number = POSITION_SAMPLE_LIMIT
  ): Promise<BookGamesResult> {
    if (this.isWeb) return EMPTY_GAMES;

    const candidates = await this.getPositionMoves(fen, playerMovesOnly);
    if (candidates.length === 0) return EMPTY_GAMES;

    // Walk the moves in rank order so the most-played continuations contribute their games
    // first, and the cap trims the rarest rather than an arbitrary slice.
    const byBook = new Map<string, number[]>();
    const seen = new Set<string>();
    let available = 0;
    let taken = 0;
    for (const candidate of candidates) {
      for (const gameId of candidate.sampleGameIds) {
        const key = `${candidate.bookId}:${gameId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        available++;
        if (taken >= limit) continue; // keep counting, so hasMore is accurate
        const ids = byBook.get(candidate.bookId) ?? [];
        ids.push(gameId);
        byBook.set(candidate.bookId, ids);
        taken++;
      }
    }

    const games: MasterGame[] = [];
    for (const [bookId, ids] of byBook) {
      const found = await this.getGames(bookId, ids);
      games.push(...found.map(toMasterGame));
    }

    // Each book returned its own games in rank order; sort across books so the combined
    // list still reads newest-first.
    games.sort(byDateDescending);
    return { games, hasMore: available > taken };
  }

  /** True when at least one book is installed — cheap enough to call from render paths. */
  async hasBooks(): Promise<boolean> {
    return (await this.listBooks()).length > 0;
  }
}

/**
 * A book game in the shape the game lists already render.
 *
 * The id is namespaced with the book it came from: book ids restart at 1 in every book, so
 * a bare number would collide across books and inside React's list keys.
 */
function toMasterGame(game: BookGame): MasterGame {
  const moves = game.moves ? game.moves.split(' ').filter(Boolean) : [];
  return {
    id: `book:${game.bookId}:${game.id}`,
    pgn: buildPgn(game, moves),
    white: game.white,
    black: game.black,
    result: game.result,
    date: game.date,
    event: game.timeControl ? `Book · ${game.timeControl}` : 'Book',
    site: game.url,
    eco: game.eco,
    moves,
    importedAt: new Date(0),
  };
}

/** Books store movetext, not PGN — rebuild enough of one for the viewer to open. */
function buildPgn(game: BookGame, moves: string[]): string {
  const headers = [
    `[Event "Book"]`,
    `[Site "${game.url}"]`,
    `[Date "${game.date}"]`,
    `[White "${game.white}"]`,
    `[Black "${game.black}"]`,
    `[Result "${game.result}"]`,
    ...(game.eco ? [`[ECO "${game.eco}"]`] : []),
    ...(game.whiteElo ? [`[WhiteElo "${game.whiteElo}"]`] : []),
    ...(game.blackElo ? [`[BlackElo "${game.blackElo}"]`] : []),
  ].join('\n');

  const body: string[] = [];
  for (let i = 0; i < moves.length; i++) {
    if (i % 2 === 0) body.push(`${i / 2 + 1}.`);
    body.push(moves[i]);
  }
  if (game.result) body.push(game.result);

  return `${headers}\n\n${body.join(' ')}`;
}

/** Newest first. PGN dates are "YYYY.MM.DD", so a string compare orders them correctly. */
function byDateDescending(a: MasterGame, b: MasterGame): number {
  return (b.date || '').localeCompare(a.date || '');
}

function parseGameIds(raw: string | null): number[] {
  if (!raw) return [];
  return raw.split(',').map(s => Number(s)).filter(n => Number.isFinite(n));
}

function toBookGame(row: any, bookId: string): BookGame {
  return {
    id: row.id,
    bookId,
    white: row.white ?? '',
    black: row.black ?? '',
    result: row.result ?? '',
    date: row.date ?? '',
    eco: row.eco ?? '',
    whiteElo: row.white_elo ?? null,
    blackElo: row.black_elo ?? null,
    timeControl: row.time_control ?? '',
    url: row.url ?? '',
    moves: row.moves ?? '',
  };
}

export const BookService = new BookServiceClass();
