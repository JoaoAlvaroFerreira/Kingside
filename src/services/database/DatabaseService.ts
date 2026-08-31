/**
 * DatabaseService - Platform-aware database storage
 * Uses SQLite on native, IndexedDB on web
 */

import { Platform } from 'react-native';
import { UserGame, MasterGame, Repertoire, normalizeFen, EngineEvaluation, LineStats, GameReviewStatus, BookRecord } from '@types';
import { Chess } from 'chess.js';
import { WebDatabaseService } from './WebDatabaseService';
import { extractChapterMoves, extractChapterPositions, mergePositionMaps, PositionMap, PositionMove } from '@utils/extractRepertoirePositions';
import * as FileSystem from 'expo-file-system';
import {
  encodeMoves, decodeMoves, encodeEvals, decodeEvals, extractEvalsFromPgn, buildPgn,
} from './gameStorage';

/** Thrown when the database cannot be opened even after WAL recovery. */
export class DatabaseOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseOpenError';
  }
}

const DB_NAME = 'kingside.db';
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const REP_INDEXED_KEY_PREFIX = 'rep_pos_indexed:';
const PAGE_SIZE = 25; // Games per page
// Position lookups are unbounded by nature - an early position matches most of
// the database. Cap what we hand back so the board's tabs stay responsive.
const POSITION_MATCH_LIMIT = 100;
// How many candidate moves an arrow overlay may show. Applied *after* aggregation — capping
// the rows scanned instead would make the frequencies themselves wrong at early positions,
// which is exactly where the ranking has to be trusted.
const CANDIDATE_MOVE_LIMIT = 4;
/**
 * How deep a game is indexed into `game_positions`.
 *
 * A game averages ~94 plies and every one of them used to be indexed, which made this
 * table and its FEN index ~81% of what a stored game costs — 18.5KB per game, so 0.42GB
 * for a 24k-game master database. Position lookup is an opening tool: past this depth
 * positions are almost always unique, so a match returns the one game you already know
 * about while the rows cost the same as the useful ones.
 *
 * This is a real trade-off, not a free win — a position deeper than this is no longer
 * findable. Raise it if middlegame search matters more than the space.
 */
const POSITION_INDEX_MAX_PLY = 40;
const SCHEMA_VERSION = 8; // Bump when schema changes
const INDEX_BATCH_SIZE = 10; // Games per batch during background indexing

/**
 * Games reaching a position, and whether the cap hid any.
 *
 * Position matches are capped because an early position matches most of the database, so
 * the count is a ceiling rather than a total and a bare number would misreport it.
 */
export interface PositionGames<T> {
  games: T[];
  hasMore: boolean;
}

interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  hasMore: boolean;
  page: number;
}

/** A move playable from some position, with how often the source plays it. */
export interface MoveCandidate {
  move: string;
  /** Chapters for the repertoire source, games for the game sources. */
  count: number;
  /** Repertoire only: 0 means the move is on some chapter's main line. */
  varDepth?: number;
}

/** Registry row -> BookRecord. Dates are epoch ms, so no reviver is needed. */
function toBookRecord(row: any): BookRecord {
  return {
    id: row.id,
    name: row.name,
    player: row.player,
    sourceFile: row.source_file,
    fileName: row.file_name,
    gameCount: row.game_count,
    positionCount: row.position_count,
    sizeBytes: row.size_bytes,
    maxPly: row.max_ply,
    hasGames: row.has_games === 1,
    importedAt: new Date(row.imported_at),
  };
}

// Conditionally import SQLite only on native platforms
let SQLite: any = null;
if (Platform.OS !== 'web') {
  SQLite = require('expo-sqlite');
}

class DatabaseServiceClass {
  private db: any | null = null;
  private isWeb = Platform.OS === 'web';

  /** True while the background FEN index is being built for existing games */
  isIndexing: boolean = false;
  /** Called when background indexing completes */
  onIndexingComplete?: () => void;

  /** Path to the SQLite directory used by expo-sqlite on native. */
  private get sqliteDir(): string {
    return `${FileSystem.documentDirectory}SQLite/`;
  }

  /**
   * Open the database with a timeout. Rejects with DatabaseOpenError on failure.
   */
  private async openWithTimeout(timeoutMs: number): Promise<any> {
    return Promise.race([
      SQLite.openDatabaseAsync(DB_NAME),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new DatabaseOpenError(`openDatabaseAsync timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * Delete WAL and SHM sidecar files so a subsequent open can start fresh.
   * Safe to call even if the files don't exist.
   */
  async deleteWalFiles(): Promise<void> {
    for (const suffix of ['-wal', '-shm']) {
      try {
        await FileSystem.deleteAsync(`${this.sqliteDir}${DB_NAME}${suffix}`, { idempotent: true });
      } catch { /* ignore */ }
    }
    console.log('[DatabaseService] WAL/SHM files deleted');
  }

  /** Absolute path of the SQLite file, for backup and restore. */
  get databaseFilePath(): string {
    return `${this.sqliteDir}${DB_NAME}`;
  }

  /**
   * Fold the write-ahead log back into the main database file.
   *
   * Required before copying kingside.db for a backup: with WAL enabled the most
   * recent commits can still be sitting in the -wal sidecar, so a copy of the
   * .db on its own would silently omit them.
   */
  async checkpoint(): Promise<void> {
    if (this.isWeb || !this.db) return;
    await this.db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');
  }

  /** Close the connection so the underlying file can be replaced on disk. */
  async close(): Promise<void> {
    if (this.isWeb || !this.db) return;
    try {
      await this.db.closeAsync();
    } catch { /* already closed */ }
    this.db = null;
  }

  /**
   * Delete the entire database file (and its sidecars).
   * All data will be lost. Call only as a last-resort recovery step.
   */
  async deleteDatabase(): Promise<void> {
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        await FileSystem.deleteAsync(`${this.sqliteDir}${DB_NAME}${suffix}`, { idempotent: true });
      } catch { /* ignore */ }
    }
    this.db = null;
    console.log('[DatabaseService] Database files deleted');
  }

  /**
   * Initialize database and create tables
   */
  async initialize(onProgress?: (msg: string) => void): Promise<void> {
    // Use IndexedDB on web, SQLite on native
    if (this.isWeb) {
      console.log('[DatabaseService] Using IndexedDB for web platform');
      return WebDatabaseService.initialize();
    }

    console.log('[DatabaseService] Using SQLite for native platform');
    onProgress?.('Opening database…');

    if (!SQLite) {
      throw new Error('SQLite module not available on this platform');
    }

    // Attempt 1: normal open with a 5-second timeout
    try {
      this.db = await this.openWithTimeout(5000);
    } catch (e) {
      // Open timed out or failed — delete WAL/SHM and retry once
      console.warn('[DatabaseService] Initial open failed, attempting WAL recovery:', e);
      await this.deleteWalFiles();
      try {
        this.db = await this.openWithTimeout(8000);
        console.log('[DatabaseService] Opened database after WAL recovery');
      } catch (e2) {
        // Database is unrecoverable without wiping it
        throw new DatabaseOpenError(
          `Database could not be opened even after WAL recovery: ${e2}`
        );
      }
    }

    try {
      onProgress?.('Creating tables…');
      // Create user_games table
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS user_games (
          id TEXT PRIMARY KEY,
          white TEXT NOT NULL,
          black TEXT NOT NULL,
          result TEXT,
          date TEXT,
          event TEXT,
          site TEXT,
          eco TEXT,
          pgn TEXT NOT NULL,
          moves TEXT NOT NULL,
          imported_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_user_games_date ON user_games(date DESC);
        CREATE INDEX IF NOT EXISTS idx_user_games_eco ON user_games(eco);
        CREATE INDEX IF NOT EXISTS idx_user_games_imported ON user_games(imported_at DESC);
      `);

      // Create master_games table
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS master_games (
          id TEXT PRIMARY KEY,
          white TEXT NOT NULL,
          black TEXT NOT NULL,
          result TEXT,
          date TEXT,
          event TEXT,
          site TEXT,
          eco TEXT,
          pgn TEXT NOT NULL,
          moves TEXT NOT NULL,
          imported_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_master_games_date ON master_games(date DESC);
        CREATE INDEX IF NOT EXISTS idx_master_games_eco ON master_games(eco);
        CREATE INDEX IF NOT EXISTS idx_master_games_imported ON master_games(imported_at DESC);
      `);

      // Create repertoires table
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS repertoires (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          color TEXT NOT NULL,
          data TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_repertoires_color ON repertoires(color);
      `);

      // Create settings table
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);

      // Create training tables. Dates are epoch ms so "due" is an indexed comparison
      // rather than a string parse, and so this data needs no date reviver.
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS line_stats (
          line_id TEXT PRIMARY KEY,
          repertoire_id TEXT NOT NULL,
          chapter_id TEXT NOT NULL,
          ease_factor REAL NOT NULL,
          interval INTEGER NOT NULL,
          repetitions INTEGER NOT NULL,
          next_review_date INTEGER NOT NULL,
          last_review_date INTEGER,
          total_drills INTEGER NOT NULL,
          correct_count INTEGER NOT NULL,
          mistake_count INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_line_stats_due ON line_stats(repertoire_id, next_review_date);
        CREATE INDEX IF NOT EXISTS idx_line_stats_chapter ON line_stats(chapter_id);

        CREATE TABLE IF NOT EXISTS game_review_statuses (
          game_id TEXT PRIMARY KEY,
          reviewed INTEGER NOT NULL,
          last_review_date INTEGER,
          key_moves_count INTEGER NOT NULL,
          followed_repertoire INTEGER NOT NULL
        );

        -- Moves you have demonstrated at least once, for semi-learn guidance.
        -- Keyed on position + move rather than on a line, so learning a move in one line
        -- silences its teaching arrow everywhere that position comes up. Scoped per
        -- repertoire on purpose: knowing a move in your Sicilian should not silently stop
        -- the app teaching it inside a repertoire you are still learning.
        CREATE TABLE IF NOT EXISTS seen_moves (
          repertoire_id TEXT NOT NULL,
          normalized_fen TEXT NOT NULL,
          move TEXT NOT NULL,
          first_seen_at INTEGER NOT NULL,
          PRIMARY KEY (repertoire_id, normalized_fen, move)
        );

        -- Registry of imported opening books. The books themselves are separate SQLite
        -- files opened on their own connections (see BookService) — only the fact that
        -- one is installed lives here, so a 100MB book never enters the backup copy.
        CREATE TABLE IF NOT EXISTS master_books (
          id             TEXT PRIMARY KEY,
          name           TEXT NOT NULL,
          player         TEXT NOT NULL,
          source_file    TEXT NOT NULL,
          file_name      TEXT NOT NULL,
          game_count     INTEGER NOT NULL,
          position_count INTEGER NOT NULL,
          size_bytes     INTEGER NOT NULL,
          max_ply        INTEGER NOT NULL,
          has_games      INTEGER NOT NULL,
          imported_at    INTEGER NOT NULL
        );
      `);

      // Schema migration: FEN index table
      await this.migrateSchema(onProgress);

      console.log('[DatabaseService] Database initialized successfully');
    } catch (error) {
      console.error('[DatabaseService] Failed to initialize database schema:', error);
      throw error;
    }
  }

  /**
   * Run schema migrations based on PRAGMA user_version
   */
  private async migrateSchema(onProgress?: (msg: string) => void): Promise<void> {
    const versionRow = await this.db!.getFirstAsync('PRAGMA user_version') as any;
    const currentVersion = versionRow?.user_version ?? 0;

    if (currentVersion < SCHEMA_VERSION) {
      onProgress?.('Updating database schema…');
    }

    if (currentVersion < 1) {
      // V1: Add game_positions FEN index table
      await this.db!.execAsync(`
        CREATE TABLE IF NOT EXISTS game_positions (
          game_id TEXT NOT NULL,
          game_type TEXT NOT NULL,
          normalized_fen TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_positions_fen ON game_positions(normalized_fen, game_type);
        CREATE INDEX IF NOT EXISTS idx_positions_game ON game_positions(game_id, game_type);
      `);
      console.log('[DatabaseService] Migrated to schema v1 (game_positions table)');

      // Background-index all existing games
      this.buildFenIndexAsync();
    }

    if (currentVersion < 2) {
      // V2: Add start_fen column for games with custom starting positions
      await this.db!.execAsync(`
        ALTER TABLE user_games ADD COLUMN start_fen TEXT;
        ALTER TABLE master_games ADD COLUMN start_fen TEXT;
      `);
      console.log('[DatabaseService] Migrated to schema v2 (start_fen column)');
    }

    if (currentVersion < 4) {
      // V4: game_analyses table — caches Stockfish evaluations per (game, color, depth)
      await this.db!.execAsync(`
        CREATE TABLE IF NOT EXISTS game_analyses (
          game_id TEXT NOT NULL,
          user_color TEXT NOT NULL,
          analysis_depth INTEGER NOT NULL,
          evals_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (game_id, user_color, analysis_depth)
        );
      `);
      console.log('[DatabaseService] Migrated to schema v4 (game_analyses table)');
    }

    // V6: repertoire_moves replaces repertoire_positions (v3-v5), normalizing the JSON
    // next_moves blob into one row per (chapter, position, move) and adding var_depth.
    // Candidate-move arrows can then rank in SQL — GROUP BY over an index — instead of
    // fetching every matching row and JSON.parsing it in JS, which after 1. d4 Nf6 means
    // a row per chapter of a 1000+ chapter repertoire on every board move.
    //
    // Checks actual existence rather than trusting user_version: a dev run may have bumped
    // the version before this migration was stable.
    const repMovesExists = await this.db!.getFirstAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='repertoire_moves'"
    ) as any;
    if (!repMovesExists) {
      await this.db!.execAsync(`
        CREATE TABLE IF NOT EXISTS repertoire_moves (
          repertoire_id TEXT NOT NULL,
          chapter_id TEXT NOT NULL,
          color TEXT NOT NULL,
          move_count INTEGER NOT NULL,
          normalized_fen TEXT NOT NULL,
          move TEXT,
          var_depth INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_rep_moves_color_fen
          ON repertoire_moves(color, normalized_fen);
        CREATE INDEX IF NOT EXISTS idx_rep_moves_fen ON repertoire_moves(normalized_fen);
        CREATE INDEX IF NOT EXISTS idx_rep_moves_repertoire ON repertoire_moves(repertoire_id);

        DROP TABLE IF EXISTS repertoire_positions;
      `);
      // Old rows carry no var_depth and cannot be backfilled in place — clear the markers
      // so every repertoire re-indexes into the new table.
      await this.db!.runAsync('DELETE FROM settings WHERE key LIKE ?', [`${REP_INDEXED_KEY_PREFIX}%`]);
      console.log('[DatabaseService] Migrated to schema v6 (repertoire_moves table)');
    }

    // V6: which move was played from each indexed game position. Without it there is no way
    // to ask "what gets played from here, how often" short of reopening every matching game.
    // Deliberately not backfilled: existing rows keep next_move NULL and simply don't feed
    // the frequency query — re-import is the way to light them up.
    const gamePosCols = await this.db!.getAllAsync(
      'PRAGMA table_info(game_positions)'
    ) as Array<{ name: string }>;
    if (gamePosCols.length > 0 && !gamePosCols.some(c => c.name === 'next_move')) {
      await this.db!.execAsync('ALTER TABLE game_positions ADD COLUMN next_move TEXT');
      console.log('[DatabaseService] Migrated to schema v6 (game_positions.next_move)');
    }

    // V8: games are stored as their parts rather than as a raw PGN. `[%eval]` is the one
    // annotation the app reads (GameReviewService skips Stockfish where Lichess already
    // analysed), so it gets a column; `[%clk]` — ~1,862 of the ~2,800 movetext bytes — is
    // read by nothing and is simply not kept.
    //
    // Existing rows keep their `pgn` and are read from it unchanged. They are deliberately
    // NOT rewritten: a full-table migration of tens of thousands of games at startup is
    // exactly the kind of work the startup-performance rules above exist to prevent, and
    // the saving lands on import anyway.
    for (const table of ['user_games', 'master_games']) {
      const columns = await this.db!.getAllAsync(
        `PRAGMA table_info(${table})`
      ) as Array<{ name: string }>;
      if (columns.length > 0 && !columns.some(c => c.name === 'evals')) {
        await this.db!.execAsync(`ALTER TABLE ${table} ADD COLUMN evals TEXT`);
        console.log(`[DatabaseService] Migrated to schema v8 (${table}.evals)`);
      }
    }

    if (currentVersion < SCHEMA_VERSION) {
      await this.db!.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    }

  }

  /**
   * Index any repertoires that have no position rows yet.
   *
   * Deliberately NOT called from initialize(): it shares the single SQLite connection
   * with the startup data load, so running it during init makes `getAllRepertoires()`
   * queue behind hundreds of thousands of INSERTs and stalls the loading screen. The
   * store calls this after startup has finished instead.
   *
   * Progress is tracked per repertoire, written by indexRepertoirePositions once that
   * repertoire's rows are fully committed. Killing the app part-way therefore keeps
   * every repertoire already finished and redoes only the interrupted one — previously
   * a single end-of-loop flag meant an interrupted backfill re-did *all* the work on
   * the next launch, forever, on any repertoire set too large to finish in one sitting.
   */
  async backfillRepertoirePositionsIfNeeded(): Promise<void> {
    if (this.isWeb || !this.db) return;

    try {
      const markers = await this.db.getAllAsync(
        'SELECT key FROM settings WHERE key LIKE ?',
        [`${REP_INDEXED_KEY_PREFIX}%`]
      ) as Array<{ key: string }>;
      const indexed = new Set(markers.map(r => r.key.slice(REP_INDEXED_KEY_PREFIX.length)));

      const rows = await this.db.getAllAsync('SELECT id, data FROM repertoires') as any[];
      const pending = rows.filter(row => !indexed.has(row.id));
      if (pending.length === 0) return;

      console.log(`[DatabaseService] Backfilling position index for ${pending.length} of ${rows.length} repertoire(s)...`);
      for (const row of pending) {
        try {
          const rep = JSON.parse(row.data) as Repertoire;
          await this.indexRepertoirePositions(rep);
        } catch (e) {
          console.warn('[DatabaseService] Failed to backfill repertoire:', e);
        }
        // Yield to the JS event loop between repertoires so the rest of the app stays responsive
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      console.log('[DatabaseService] Repertoire position backfill complete');
    } catch (error) {
      console.error('[DatabaseService] Repertoire position backfill failed:', error);
    }
  }

  /** Build and persist the FEN index for a repertoire (replaces any existing index). */
  private async indexRepertoirePositions(repertoire: Repertoire): Promise<void> {
    // Clear the completion marker first: rows go in over several transactions, so if we
    // are interrupted the partial index must not read as done. This is the single funnel
    // for all repertoire indexing, so the marker means "fully indexed" wherever it's set.
    const marker = REP_INDEXED_KEY_PREFIX + repertoire.id;
    await this.db!.runAsync('DELETE FROM settings WHERE key = ?', [marker]);

    await this.db!.runAsync(
      'DELETE FROM repertoire_moves WHERE repertoire_id = ?',
      [repertoire.id]
    );

    // Rows are kept per chapter (not merged across the repertoire) so Find Position can
    // resolve which chapter a position came from without re-walking the move trees.
    const rows: [string, string, string, number, string, string | null, number][] = [];
    for (const chapter of repertoire.chapters) {
      let moves: PositionMove[];
      try {
        moves = extractChapterMoves(chapter);
      } catch {
        console.warn(`[DatabaseService] Skipping malformed chapter "${chapter.name}" during position indexing`);
        continue;
      }
      for (const m of moves) {
        rows.push([repertoire.id, chapter.id, repertoire.color, m.moveCount, m.fen, m.move, m.varDepth]);
      }
    }

    const BATCH_SIZE = 300;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      await this.db!.withTransactionAsync(async () => {
        for (const row of batch) {
          await this.db!.runAsync(
            `INSERT INTO repertoire_moves
               (repertoire_id, chapter_id, color, move_count, normalized_fen, move, var_depth)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            row
          );
        }
      });
      // Yield to the JS event loop between batches
      if (i + BATCH_SIZE < rows.length) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    await this.saveSetting(marker, true);
  }

  /**
   * Extract all unique normalized FENs from a PGN string
   */
  /**
   * Replay a PGN and return each position paired with the move played from it.
   *
   * The move is what makes "from this position, what gets played and how often" answerable
   * as one GROUP BY, instead of reopening every matching game. The final position of the
   * game is emitted with a null move so position search still finds it.
   *
   * SAN comes from chess.js rather than the raw token, so it matches the SAN the rest of
   * the app produces regardless of how the PGN was written.
   */
  private extractPositionMovesFromPgn(pgn: string): Array<{ fen: string; move: string | null }> {
    // Check for custom starting FEN in headers
    const fenMatch = pgn.match(/^\[FEN\s+"([^"]+)"\s*\]$/m);
    const startFen = fenMatch ? fenMatch[1] : undefined;

    const chess = startFen ? new Chess(startFen) : new Chess();

    const result: Array<{ fen: string; move: string | null }> = [];
    const seen = new Set<string>();
    const push = (fen: string, move: string | null) => {
      const key = `${fen}|${move ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      result.push({ fen, move });
    };

    // Strip headers, comments, result tokens
    let movesText = pgn.replace(/^\[.*?\]$/gm, '');
    movesText = movesText.replace(/\{[^}]*\}/g, '');
    movesText = movesText.replace(/;.*$/gm, '');
    movesText = movesText.replace(/\s+(1-0|0-1|1\/2-1\/2|\*)\s*$/g, '');

    let preFen = normalizeFen(chess.fen());
    let ply = 0;
    const sections = movesText.split(/\d+\.\s*/).filter(s => s.trim());
    outer:
    for (const section of sections) {
      const tokens = section.trim().split(/\s+/).filter(t => t.trim());
      for (const token of tokens) {
        const clean = token.replace(/[!?]+$/, '').replace(/[",]/g, '').trim();
        if (!clean) continue;
        try {
          const played = chess.move(clean);
          push(preFen, played.san);
          preFen = normalizeFen(chess.fen());
          if (++ply >= POSITION_INDEX_MAX_PLY) break outer;
        } catch {
          // Not a valid move token
        }
      }
    }

    // End of the game: the position is in the index, with no continuation
    push(preFen, null);

    return result;
  }

  /**
   * Insert FEN positions for a batch of games within a transaction
   */
  private async indexGamesInTransaction(
    games: Array<{ id: string; pgn: string }>,
    gameType: 'user' | 'master'
  ): Promise<void> {
    await this.db!.withTransactionAsync(async () => {
      for (const game of games) {
        for (const { fen, move } of this.extractPositionMovesFromPgn(game.pgn)) {
          await this.db!.runAsync(
            'INSERT INTO game_positions (game_id, game_type, normalized_fen, next_move) VALUES (?, ?, ?, ?)',
            [game.id, gameType, fen, move]
          );
        }
      }
    });
  }

  /**
   * Background-index all existing games in batches, yielding between batches
   */
  private async buildFenIndexAsync(): Promise<void> {
    this.isIndexing = true;
    console.log('[DatabaseService] Starting background FEN index build...');

    try {
      for (const gameType of ['user', 'master'] as const) {
        const table = gameType === 'user' ? 'user_games' : 'master_games';
        const countRow = await this.db!.getFirstAsync(
          `SELECT COUNT(*) as count FROM ${table}`
        ) as { count: number } | null;
        const total = countRow?.count || 0;

        for (let offset = 0; offset < total; offset += INDEX_BATCH_SIZE) {
          const rows = await this.db!.getAllAsync(
            `SELECT id, pgn FROM ${table} LIMIT ? OFFSET ?`,
            [INDEX_BATCH_SIZE, offset]
          ) as Array<{ id: string; pgn: string }>;

          if (rows.length === 0) break;
          await this.indexGamesInTransaction(rows, gameType);

          // Yield to the JS event loop between batches
          if (offset + INDEX_BATCH_SIZE < total) {
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
      }

      console.log('[DatabaseService] Background FEN index build complete');
    } catch (error) {
      console.error('[DatabaseService] FEN index build failed:', error);
    } finally {
      this.isIndexing = false;
      this.onIndexingComplete?.();
    }
  }

  /**
   * Helper to convert DB row to UserGame
   */
  private rowToUserGame(row: any): UserGame {
    return {
      id: row.id,
      white: row.white,
      black: row.black,
      result: row.result,
      date: row.date,
      event: row.event,
      site: row.site,
      eco: row.eco,
      ...this.gameContent(row),
      startFen: row.start_fen || undefined,
      importedAt: new Date(row.imported_at),
    };
  }

  /**
   * Moves and PGN for a row, whichever shape it was stored in.
   *
   * Rows written before v8 carry a raw PGN and a JSON moves array; newer ones carry
   * space-separated SAN and an optional evals column, and have their PGN rebuilt here so
   * every consumer — including GameReviewService's `[%eval]` parser — sees the same thing.
   */
  private gameContent(row: any): { pgn: string; moves: string[] } {
    const moves = decodeMoves(row.moves);
    if (row.pgn) return { pgn: row.pgn, moves };
    return {
      moves,
      pgn: buildPgn(
        {
          white: row.white, black: row.black, result: row.result, date: row.date,
          event: row.event, site: row.site, eco: row.eco,
          startFen: row.start_fen || undefined,
        },
        moves,
        decodeEvals(row.evals)
      ),
    };
  }

  /**
   * Helper to convert DB row to MasterGame
   */
  private rowToMasterGame(row: any): MasterGame {
    return {
      id: row.id,
      white: row.white,
      black: row.black,
      result: row.result,
      date: row.date,
      event: row.event,
      site: row.site,
      eco: row.eco,
      ...this.gameContent(row),
      startFen: row.start_fen || undefined,
      importedAt: new Date(row.imported_at),
    };
  }

  // ==================== USER GAMES ====================

  /**
   * Add multiple user games (bulk insert)
   */
  async addUserGames(games: UserGame[]): Promise<void> {
    if (this.isWeb) return WebDatabaseService.addUserGames(games);
    if (!this.db) throw new Error('Database not initialized');

    console.log(`[DatabaseService] Adding ${games.length} user games...`);

    try {
      await this.db.withTransactionAsync(async () => {
        for (const game of games) {
          await this.db!.runAsync(
            `INSERT OR REPLACE INTO user_games
             (id, white, black, result, date, event, site, eco, pgn, moves, evals, start_fen, imported_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?)`,
            [
              game.id,
              game.white,
              game.black,
              game.result || '',
              game.date || '',
              game.event || '',
              game.site || '',
              game.eco || '',
              // The raw PGN is not stored: it is ~2/3 clock comments nothing reads, and
              // the rest is the headers and SAN already in these columns. Written as ''
              // rather than NULL because the column is declared NOT NULL on installs that
              // predate this change; both read back as "rebuild it".
              encodeMoves(game.moves),
              encodeEvals(extractEvalsFromPgn(game.pgn || '')),
              game.startFen || null,
              game.importedAt.getTime(),
            ]
          );

          // Index FEN positions for this game
          const positionMoves = this.extractPositionMovesFromPgn(game.pgn);
          // Clear old positions first (handles re-import)
          await this.db!.runAsync(
            'DELETE FROM game_positions WHERE game_id = ? AND game_type = ?',
            [game.id, 'user']
          );
          for (const { fen, move } of positionMoves) {
            await this.db!.runAsync(
              'INSERT INTO game_positions (game_id, game_type, normalized_fen, next_move) VALUES (?, ?, ?, ?)',
              [game.id, 'user', fen, move]
            );
          }
        }
      });

      console.log(`[DatabaseService] Added ${games.length} user games successfully`);
    } catch (error) {
      console.error('[DatabaseService] Failed to add user games:', error);
      throw error;
    }
  }

  /**
   * Get user games with pagination
   */
  async getUserGames(page: number = 0, pageSize: number = PAGE_SIZE): Promise<PaginatedResult<UserGame>> {
    if (this.isWeb) return WebDatabaseService.getUserGames(page, pageSize);
    if (!this.db) throw new Error('Database not initialized');

    const offset = page * pageSize;

    // Get total count
    const countResult = await this.db.getFirstAsync(
      'SELECT COUNT(*) as count FROM user_games'
    ) as { count: number } | null;
    const totalCount = countResult?.count || 0;

    // Get paginated results
    const rows = await this.db.getAllAsync(
      'SELECT * FROM user_games ORDER BY imported_at DESC LIMIT ? OFFSET ?',
      [pageSize, offset]
    );

    const items = (rows as any[]).map((row: any) => this.rowToUserGame(row));
    const hasMore = offset + pageSize < totalCount;

    return { items, totalCount, hasMore, page };
  }

  /**
   * Get all user games (for backward compatibility - use with caution)
   */
  async getAllUserGames(): Promise<UserGame[]> {
    if (this.isWeb) return WebDatabaseService.getAllUserGames();
    if (!this.db) throw new Error('Database not initialized');

    const rows = await this.db.getAllAsync('SELECT * FROM user_games ORDER BY imported_at DESC');
    return (rows as any[]).map((row: any) => this.rowToUserGame(row));
  }

  /**
   * Get user game by ID
   */
  async getUserGameById(id: string): Promise<UserGame | null> {
    if (this.isWeb) return WebDatabaseService.getUserGameById(id);
    if (!this.db) throw new Error('Database not initialized');

    const row = await this.db.getFirstAsync('SELECT * FROM user_games WHERE id = ?', [id]);
    return row ? this.rowToUserGame(row) : null;
  }

  /**
   * Delete user game
   */
  async deleteUserGame(id: string): Promise<void> {
    if (this.isWeb) return WebDatabaseService.deleteUserGame(id);
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync('DELETE FROM user_games WHERE id = ?', [id]);
    await this.db.runAsync('DELETE FROM game_positions WHERE game_id = ? AND game_type = ?', [id, 'user']);
    try { await this.db.runAsync('DELETE FROM game_analyses WHERE game_id = ?', [id]); } catch { /* pre-v4 */ }
    console.log(`[DatabaseService] Deleted user game: ${id}`);
  }

  /**
   * Delete all user games
   */
  async deleteAllUserGames(): Promise<void> {
    if (this.isWeb) return WebDatabaseService.deleteAllUserGames();
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync('DELETE FROM user_games');
    await this.db.runAsync("DELETE FROM game_positions WHERE game_type = 'user'");
    console.log('[DatabaseService] Deleted all user games');
  }

  /**
   * Get user games count
   */
  async getUserGamesCount(): Promise<number> {
    if (this.isWeb) return WebDatabaseService.getUserGamesCount();
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getFirstAsync(
      'SELECT COUNT(*) as count FROM user_games'
    ) as { count: number } | null;
    return result?.count || 0;
  }

  // ==================== MASTER GAMES ====================

  /**
   * Add multiple master games (bulk insert)
   */
  async addMasterGames(games: MasterGame[]): Promise<void> {
    if (this.isWeb) return WebDatabaseService.addMasterGames(games);
    if (!this.db) throw new Error('Database not initialized');

    console.log(`[DatabaseService] Adding ${games.length} master games...`);

    try {
      await this.db.withTransactionAsync(async () => {
        for (const game of games) {
          await this.db!.runAsync(
            `INSERT OR REPLACE INTO master_games
             (id, white, black, result, date, event, site, eco, pgn, moves, evals, start_fen, imported_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?)`,
            [
              game.id,
              game.white,
              game.black,
              game.result || '',
              game.date || '',
              game.event || '',
              game.site || '',
              game.eco || '',
              // The raw PGN is not stored: it is ~2/3 clock comments nothing reads, and
              // the rest is the headers and SAN already in these columns. Written as ''
              // rather than NULL because the column is declared NOT NULL on installs that
              // predate this change; both read back as "rebuild it".
              encodeMoves(game.moves),
              encodeEvals(extractEvalsFromPgn(game.pgn || '')),
              game.startFen || null,
              game.importedAt.getTime(),
            ]
          );

          // Index FEN positions for this game
          const positionMoves = this.extractPositionMovesFromPgn(game.pgn);
          await this.db!.runAsync(
            'DELETE FROM game_positions WHERE game_id = ? AND game_type = ?',
            [game.id, 'master']
          );
          for (const { fen, move } of positionMoves) {
            await this.db!.runAsync(
              'INSERT INTO game_positions (game_id, game_type, normalized_fen, next_move) VALUES (?, ?, ?, ?)',
              [game.id, 'master', fen, move]
            );
          }
        }
      });

      console.log(`[DatabaseService] Added ${games.length} master games successfully`);
    } catch (error) {
      console.error('[DatabaseService] Failed to add master games:', error);
      throw error;
    }
  }

  /**
   * Get master games with pagination
   */
  async getMasterGames(page: number = 0, pageSize: number = PAGE_SIZE): Promise<PaginatedResult<MasterGame>> {
    if (this.isWeb) return WebDatabaseService.getMasterGames(page, pageSize);
    if (!this.db) throw new Error('Database not initialized');

    const offset = page * pageSize;

    // Get total count
    const countResult = await this.db.getFirstAsync(
      'SELECT COUNT(*) as count FROM master_games'
    ) as { count: number } | null;
    const totalCount = countResult?.count || 0;

    // Get paginated results
    const rows = await this.db.getAllAsync(
      'SELECT * FROM master_games ORDER BY imported_at DESC LIMIT ? OFFSET ?',
      [pageSize, offset]
    );

    const items = (rows as any[]).map((row: any) => this.rowToMasterGame(row));
    const hasMore = offset + pageSize < totalCount;

    return { items, totalCount, hasMore, page };
  }

  /**
   * Get all master games (for backward compatibility - use with caution for large datasets)
   */
  async getAllMasterGames(): Promise<MasterGame[]> {
    if (this.isWeb) return WebDatabaseService.getAllMasterGames();
    if (!this.db) throw new Error('Database not initialized');

    const rows = await this.db.getAllAsync('SELECT * FROM master_games ORDER BY imported_at DESC');
    return (rows as any[]).map((row: any) => this.rowToMasterGame(row));
  }

  /**
   * Get master game by ID
   */
  async getMasterGameById(id: string): Promise<MasterGame | null> {
    if (this.isWeb) return WebDatabaseService.getMasterGameById(id);
    if (!this.db) throw new Error('Database not initialized');

    const row = await this.db.getFirstAsync('SELECT * FROM master_games WHERE id = ?', [id]);
    return row ? this.rowToMasterGame(row) : null;
  }

  /**
   * Delete master game
   */
  async deleteMasterGame(id: string): Promise<void> {
    if (this.isWeb) return WebDatabaseService.deleteMasterGame(id);
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync('DELETE FROM master_games WHERE id = ?', [id]);
    await this.db.runAsync('DELETE FROM game_positions WHERE game_id = ? AND game_type = ?', [id, 'master']);
    console.log(`[DatabaseService] Deleted master game: ${id}`);
  }

  /**
   * Delete all master games
   */
  async deleteAllMasterGames(): Promise<void> {
    if (this.isWeb) return WebDatabaseService.deleteAllMasterGames();
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync('DELETE FROM master_games');
    await this.db.runAsync("DELETE FROM game_positions WHERE game_type = 'master'");
    console.log('[DatabaseService] Deleted all master games');
  }

  /**
   * Get master games count
   */
  async getMasterGamesCount(): Promise<number> {
    if (this.isWeb) return WebDatabaseService.getMasterGamesCount();
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getFirstAsync(
      'SELECT COUNT(*) as count FROM master_games'
    ) as { count: number } | null;
    return result?.count || 0;
  }

  // ==================== REPERTOIRES ====================

  private dateReviver(_key: string, value: any): any {
    if (typeof value === 'string' && ISO_DATE_PATTERN.test(value)) {
      return new Date(value);
    }
    return value;
  }

  /**
   * Revive the known Date fields on a parsed repertoire in place.
   *
   * Used instead of a JSON.parse reviver: a reviver fires once per key across the
   * *entire* blob, and a repertoire blob is dominated by move-tree nodes that contain
   * no dates at all. On a large repertoire that is hundreds of thousands of wasted
   * calls per parse — enough to stall startup for minutes on device.
   */
  private reviveRepertoireDates(rep: any): Repertoire {
    rep.createdAt = new Date(rep.createdAt);
    rep.updatedAt = new Date(rep.updatedAt);
    for (const chapter of rep.chapters ?? []) {
      chapter.createdAt = new Date(chapter.createdAt);
      chapter.updatedAt = new Date(chapter.updatedAt);
      if (chapter.lastStudiedAt) chapter.lastStudiedAt = new Date(chapter.lastStudiedAt);
    }
    return rep as Repertoire;
  }

  async addRepertoire(repertoire: Repertoire): Promise<void> {
    if (this.isWeb) return WebDatabaseService.addRepertoire(repertoire);
    if (!this.db) throw new Error('Database not initialized');

    const now = Date.now();
    await this.db.runAsync(
      `INSERT OR IGNORE INTO repertoires (id, name, color, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [repertoire.id, repertoire.name, repertoire.color, JSON.stringify(repertoire), now, now]
    );
    try { await this.indexRepertoirePositions(repertoire); } catch { /* table not ready yet */ }
  }

  async updateRepertoire(repertoire: Repertoire): Promise<void> {
    if (this.isWeb) return WebDatabaseService.updateRepertoire(repertoire);
    if (!this.db) throw new Error('Database not initialized');

    await this.writeRepertoireRow(repertoire);
    try { await this.indexRepertoirePositions(repertoire); } catch { /* table not ready yet */ }
  }

  /**
   * Persist a repertoire whose move trees are unchanged (renames, reordering, metadata).
   *
   * Skips position re-indexing, which depends only on chapter ids and move trees — a full
   * re-index of a large repertoire just to change its name is pure waste. Use
   * `updateRepertoire` for anything that touches a move tree.
   */
  async updateRepertoireMetadata(repertoire: Repertoire): Promise<void> {
    if (this.isWeb) return WebDatabaseService.updateRepertoire(repertoire);
    if (!this.db) throw new Error('Database not initialized');

    await this.writeRepertoireRow(repertoire);
  }

  private async writeRepertoireRow(repertoire: Repertoire): Promise<void> {
    await this.db!.runAsync(
      `UPDATE repertoires SET name = ?, color = ?, data = ?, updated_at = ? WHERE id = ?`,
      [repertoire.name, repertoire.color, JSON.stringify(repertoire), Date.now(), repertoire.id]
    );
  }

  /**
   * Delete a repertoire and everything keyed to it, in one transaction.
   *
   * Line stats live here rather than in AsyncStorage precisely so this cascade is atomic —
   * the old split across two stores could leave orphaned stats if the app died mid-delete.
   */
  async deleteRepertoire(id: string): Promise<void> {
    if (this.isWeb) return WebDatabaseService.deleteRepertoire(id);
    if (!this.db) throw new Error('Database not initialized');

    await this.db.withTransactionAsync(async () => {
      await this.db!.runAsync('DELETE FROM repertoires WHERE id = ?', [id]);
      await this.db!.runAsync('DELETE FROM settings WHERE key = ?', [REP_INDEXED_KEY_PREFIX + id]);
      await this.db!.runAsync('DELETE FROM line_stats WHERE repertoire_id = ?', [id]);
      await this.db!.runAsync('DELETE FROM seen_moves WHERE repertoire_id = ?', [id]);
      // repertoire_moves may not exist if the V6 migration hasn't run yet (e.g. Fast Refresh)
      try {
        await this.db!.runAsync('DELETE FROM repertoire_moves WHERE repertoire_id = ?', [id]);
      } catch { /* table doesn't exist yet — ignore */ }
    });
  }

  async getAllRepertoires(): Promise<Repertoire[]> {
    if (this.isWeb) return WebDatabaseService.getAllRepertoires();
    if (!this.db) throw new Error('Database not initialized');

    const rows = await this.db.getAllAsync('SELECT data FROM repertoires ORDER BY created_at ASC');
    return (rows as any[]).map((row: any) => this.reviveRepertoireDates(JSON.parse(row.data)));
  }

  async getRepertoireById(id: string): Promise<Repertoire | null> {
    if (this.isWeb) return WebDatabaseService.getRepertoireById(id);
    if (!this.db) throw new Error('Database not initialized');

    const row = await this.db.getFirstAsync('SELECT data FROM repertoires WHERE id = ?', [id]) as any;
    if (!row) return null;
    return this.reviveRepertoireDates(JSON.parse(row.data));
  }

  async getRepertoiresCount(): Promise<number> {
    if (this.isWeb) return WebDatabaseService.getRepertoiresCount();
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getFirstAsync(
      'SELECT COUNT(*) as count FROM repertoires'
    ) as { count: number } | null;
    return result?.count || 0;
  }

  // ==================== SETTINGS ====================

  async saveSetting(key: string, value: unknown): Promise<void> {
    if (this.isWeb) return WebDatabaseService.saveSetting(key, value);
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(
      `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
      [key, JSON.stringify(value)]
    );
  }

  async getSetting<T>(key: string): Promise<T | null> {
    if (this.isWeb) return WebDatabaseService.getSetting<T>(key);
    if (!this.db) throw new Error('Database not initialized');

    const row = await this.db.getFirstAsync('SELECT value FROM settings WHERE key = ?', [key]) as any;
    if (!row) return null;
    return JSON.parse(row.value, (k, v) => this.dateReviver(k, v)) as T;
  }

  // ==================== TRAINING ====================

  private rowToLineStats(row: any): LineStats {
    return {
      lineId: row.line_id,
      repertoireId: row.repertoire_id,
      chapterId: row.chapter_id,
      easeFactor: row.ease_factor,
      interval: row.interval,
      repetitions: row.repetitions,
      nextReviewDate: new Date(row.next_review_date),
      lastReviewDate: row.last_review_date != null ? new Date(row.last_review_date) : undefined,
      totalDrills: row.total_drills,
      correctCount: row.correct_count,
      mistakeCount: row.mistake_count,
    };
  }

  private lineStatsToParams(stat: LineStats): unknown[] {
    return [
      stat.lineId,
      stat.repertoireId,
      stat.chapterId,
      stat.easeFactor,
      stat.interval,
      stat.repetitions,
      new Date(stat.nextReviewDate).getTime(),
      stat.lastReviewDate != null ? new Date(stat.lastReviewDate).getTime() : null,
      stat.totalDrills,
      stat.correctCount,
      stat.mistakeCount,
    ];
  }

  async getAllLineStats(): Promise<LineStats[]> {
    if (this.isWeb) return WebDatabaseService.getAllLineStats();
    if (!this.db) throw new Error('Database not initialized');

    const rows = await this.db.getAllAsync('SELECT * FROM line_stats') as any[];
    return rows.map(row => this.rowToLineStats(row));
  }

  /** Write a single line's stats. One row per answer, not a rewrite of the whole history. */
  async upsertLineStats(stat: LineStats): Promise<void> {
    if (this.isWeb) return WebDatabaseService.upsertLineStats(stat);
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(
      `INSERT OR REPLACE INTO line_stats
         (line_id, repertoire_id, chapter_id, ease_factor, interval, repetitions,
          next_review_date, last_review_date, total_drills, correct_count, mistake_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      this.lineStatsToParams(stat)
    );
  }

  async deleteLineStats(lineId: string): Promise<void> {
    if (this.isWeb) return WebDatabaseService.deleteLineStats(lineId);
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync('DELETE FROM line_stats WHERE line_id = ?', [lineId]);
  }

  /** Replace the whole table. Used by the AsyncStorage migration and by bulk resets. */
  async replaceAllLineStats(stats: LineStats[]): Promise<void> {
    if (this.isWeb) return WebDatabaseService.replaceAllLineStats(stats);
    if (!this.db) throw new Error('Database not initialized');

    await this.db.withTransactionAsync(async () => {
      await this.db!.runAsync('DELETE FROM line_stats');
      for (const stat of stats) {
        await this.db!.runAsync(
          `INSERT OR REPLACE INTO line_stats
             (line_id, repertoire_id, chapter_id, ease_factor, interval, repetitions,
              next_review_date, last_review_date, total_drills, correct_count, mistake_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          this.lineStatsToParams(stat)
        );
      }
    });
  }

  // ==================== SEEN MOVES (semi-learn) ====================

  /** Every (position, move) you have answered correctly in this repertoire, as `fen|move`. */
  async getSeenMoves(repertoireId: string): Promise<Set<string>> {
    if (this.isWeb || !this.db) return new Set();

    try {
      const rows = await this.db.getAllAsync(
        'SELECT normalized_fen, move FROM seen_moves WHERE repertoire_id = ?',
        [repertoireId]
      ) as Array<{ normalized_fen: string; move: string }>;
      return new Set(rows.map(r => `${r.normalized_fen}|${r.move}`));
    } catch {
      return new Set();
    }
  }

  async markMoveSeen(repertoireId: string, fen: string, move: string): Promise<void> {
    if (this.isWeb || !this.db) return;

    await this.db.runAsync(
      `INSERT OR REPLACE INTO seen_moves (repertoire_id, normalized_fen, move, first_seen_at)
       VALUES (?, ?, ?, ?)`,
      [repertoireId, normalizeFen(fen), move, Date.now()]
    );
  }

  /** Forget a move, so semi-learn teaches it again. Called when you get it wrong. */
  async unmarkMoveSeen(repertoireId: string, fen: string, move: string): Promise<void> {
    if (this.isWeb || !this.db) return;

    await this.db.runAsync(
      'DELETE FROM seen_moves WHERE repertoire_id = ? AND normalized_fen = ? AND move = ?',
      [repertoireId, normalizeFen(fen), move]
    );
  }

  // ==================== GAME REVIEW STATUS ====================

  async getAllGameReviewStatuses(): Promise<GameReviewStatus[]> {
    if (this.isWeb) return WebDatabaseService.getAllGameReviewStatuses();
    if (!this.db) throw new Error('Database not initialized');

    const rows = await this.db.getAllAsync('SELECT * FROM game_review_statuses') as any[];
    return rows.map(row => ({
      gameId: row.game_id,
      reviewed: row.reviewed === 1,
      lastReviewDate: row.last_review_date != null ? new Date(row.last_review_date) : undefined,
      keyMovesCount: row.key_moves_count,
      followedRepertoire: row.followed_repertoire === 1,
    }));
  }

  async upsertGameReviewStatus(status: GameReviewStatus): Promise<void> {
    if (this.isWeb) return WebDatabaseService.upsertGameReviewStatus(status);
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(
      `INSERT OR REPLACE INTO game_review_statuses
         (game_id, reviewed, last_review_date, key_moves_count, followed_repertoire)
       VALUES (?, ?, ?, ?, ?)`,
      [
        status.gameId,
        status.reviewed ? 1 : 0,
        status.lastReviewDate != null ? new Date(status.lastReviewDate).getTime() : null,
        status.keyMovesCount,
        status.followedRepertoire ? 1 : 0,
      ]
    );
  }

  async replaceAllGameReviewStatuses(statuses: GameReviewStatus[]): Promise<void> {
    if (this.isWeb) return WebDatabaseService.replaceAllGameReviewStatuses(statuses);
    if (!this.db) throw new Error('Database not initialized');

    await this.db.withTransactionAsync(async () => {
      await this.db!.runAsync('DELETE FROM game_review_statuses');
      for (const status of statuses) {
        await this.db!.runAsync(
          `INSERT OR REPLACE INTO game_review_statuses
             (game_id, reviewed, last_review_date, key_moves_count, followed_repertoire)
           VALUES (?, ?, ?, ?, ?)`,
          [
            status.gameId,
            status.reviewed ? 1 : 0,
            status.lastReviewDate != null ? new Date(status.lastReviewDate).getTime() : null,
            status.keyMovesCount,
            status.followedRepertoire ? 1 : 0,
          ]
        );
      }
    });
  }

  // ==================== SEARCH / FILTER ====================

  /**
   * Search games by player name, event, or ECO
   */
  async searchUserGames(query: string, page: number = 0, pageSize: number = PAGE_SIZE): Promise<PaginatedResult<UserGame>> {
    if (this.isWeb) return WebDatabaseService.searchUserGames(query, page, pageSize);
    if (!this.db) throw new Error('Database not initialized');

    const searchPattern = `%${query}%`;
    const offset = page * pageSize;

    // Get total count
    const countResult = await this.db.getFirstAsync(
      `SELECT COUNT(*) as count FROM user_games
       WHERE white LIKE ? OR black LIKE ? OR event LIKE ? OR eco LIKE ?`,
      [searchPattern, searchPattern, searchPattern, searchPattern]
    ) as { count: number } | null;
    const totalCount = countResult?.count || 0;

    // Get paginated results
    const rows = await this.db.getAllAsync(
      `SELECT * FROM user_games
       WHERE white LIKE ? OR black LIKE ? OR event LIKE ? OR eco LIKE ?
       ORDER BY imported_at DESC LIMIT ? OFFSET ?`,
      [searchPattern, searchPattern, searchPattern, searchPattern, pageSize, offset]
    );

    const items = (rows as any[]).map((row: any) => this.rowToUserGame(row));
    const hasMore = offset + pageSize < totalCount;

    return { items, totalCount, hasMore, page };
  }

  /**
   * Search master games
   */
  async searchMasterGames(query: string, page: number = 0, pageSize: number = PAGE_SIZE): Promise<PaginatedResult<MasterGame>> {
    if (this.isWeb) return WebDatabaseService.searchMasterGames(query, page, pageSize);
    if (!this.db) throw new Error('Database not initialized');

    const searchPattern = `%${query}%`;
    const offset = page * pageSize;

    // Get total count
    const countResult = await this.db.getFirstAsync(
      `SELECT COUNT(*) as count FROM master_games
       WHERE white LIKE ? OR black LIKE ? OR event LIKE ? OR eco LIKE ?`,
      [searchPattern, searchPattern, searchPattern, searchPattern]
    ) as { count: number } | null;
    const totalCount = countResult?.count || 0;

    // Get paginated results
    const rows = await this.db.getAllAsync(
      `SELECT * FROM master_games
       WHERE white LIKE ? OR black LIKE ? OR event LIKE ? OR eco LIKE ?
       ORDER BY imported_at DESC LIMIT ? OFFSET ?`,
      [searchPattern, searchPattern, searchPattern, searchPattern, pageSize, offset]
    );

    const items = (rows as any[]).map((row: any) => this.rowToMasterGame(row));
    const hasMore = offset + pageSize < totalCount;

    return { items, totalCount, hasMore, page };
  }

  // ==================== GAME ANALYSIS CACHE ====================

  /**
   * Persist engine evaluations for a reviewed game so re-review skips Stockfish.
   * Keyed by (gameId, userColor, depth) — changing depth invalidates automatically.
   */
  async saveGameAnalysis(
    gameId: string,
    userColor: 'white' | 'black',
    depth: number,
    evals: Array<EngineEvaluation | null>
  ): Promise<void> {
    if (this.isWeb) return;
    if (!this.db) return;
    try {
      await this.db.runAsync(
        `INSERT OR REPLACE INTO game_analyses (game_id, user_color, analysis_depth, evals_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [gameId, userColor, depth, JSON.stringify(evals), Date.now()]
      );
    } catch { /* table may not exist yet — non-critical */ }
  }

  /** Load cached evaluations, or null if not cached for this (game, color, depth). */
  async loadGameAnalysis(
    gameId: string,
    userColor: 'white' | 'black',
    depth: number
  ): Promise<Array<EngineEvaluation | null> | null> {
    if (this.isWeb) return null;
    if (!this.db) return null;
    try {
      const row = await this.db.getFirstAsync(
        'SELECT evals_json FROM game_analyses WHERE game_id = ? AND user_color = ? AND analysis_depth = ?',
        [gameId, userColor, depth]
      ) as { evals_json: string } | null;
      if (!row) return null;
      const parsed: Array<any> = JSON.parse(row.evals_json);
      return parsed.map(e => e ? { ...e, timestamp: new Date(e.timestamp) } as EngineEvaluation : null);
    } catch { return null; }
  }

  // ==================== REPERTOIRE POSITION MAP ====================

  /**
   * Load the pre-built FEN index for a color as an in-memory PositionMap.
   * This is O(rows) instead of re-walking all chapter move trees.
   */
  async getRepertoirePositionMap(color: 'white' | 'black'): Promise<PositionMap> {
    if (this.isWeb) return WebDatabaseService.getRepertoirePositionMap(color);
    if (!this.db) throw new Error('Database not initialized');

    try {
      const rows = await this.db.getAllAsync(
        'SELECT move_count, normalized_fen, move FROM repertoire_moves WHERE color = ?',
        [color]
      ) as Array<{ move_count: number; normalized_fen: string; move: string | null }>;

      const map: PositionMap = new Map();
      for (const row of rows) {
        if (!map.has(row.move_count)) map.set(row.move_count, new Map());
        const atCount = map.get(row.move_count)!;
        if (!atCount.has(row.normalized_fen)) atCount.set(row.normalized_fen, new Set());
        if (row.move) atCount.get(row.normalized_fen)!.add(row.move);
      }
      return map;
    } catch {
      // Table not ready — build in-memory from stored repertoires as fallback
      console.warn('[DatabaseService] repertoire_moves unavailable, building position map in-memory');
      const repertoires = await this.getAllRepertoires();
      const combined: PositionMap = new Map();
      for (const rep of repertoires.filter(r => r.color === color)) {
        for (const chapter of rep.chapters) {
          try { mergePositionMaps(combined, extractChapterPositions(chapter)); } catch { /* skip malformed */ }
        }
      }
      return combined;
    }
  }

  /**
   * Which repertoire chapters contain this position, as (repertoireId, chapterId) pairs.
   *
   * Backs the "Find Position" tab. This is an indexed lookup on a single FEN — the UI
   * previously built an in-memory index of every position in every chapter on each mount,
   * which grew unusable on a large repertoire set.
   */
  async findChaptersByFen(normalizedFen: string): Promise<Array<{ repertoireId: string; chapterId: string }>> {
    if (this.isWeb || !this.db) return [];

    try {
      const rows = await this.db.getAllAsync(
        `SELECT DISTINCT repertoire_id, chapter_id FROM repertoire_moves
         WHERE normalized_fen = ?
         LIMIT ?`,
        [normalizedFen, POSITION_MATCH_LIMIT]
      ) as Array<{ repertoire_id: string; chapter_id: string }>;
      return rows.map(r => ({ repertoireId: r.repertoire_id, chapterId: r.chapter_id }));
    } catch {
      // Table or column not ready yet (e.g. Fast Refresh mid-migration)
      return [];
    }
  }

  // ==================== CANDIDATE MOVES ====================

  /**
   * Which moves your repertoire plays from this position, best first.
   *
   * Ranked by main-line-ness before popularity: `MIN(var_depth)` means "if any chapter
   * treats this as its main line, it ranks as a main line", and chapter count breaks ties.
   * Aggregating in SQL matters — an early position matches a row per chapter, and a large
   * repertoire has thousands.
   */
  async getRepertoireMoveCandidates(
    fen: string,
    limit: number = CANDIDATE_MOVE_LIMIT,
    color?: 'white' | 'black'
  ): Promise<MoveCandidate[]> {
    if (this.isWeb || !this.db) return [];

    try {
      // Unfiltered by color by default, to match Find Position: what matters is which
      // chapters contain the position, not which side's repertoire they belong to.
      const rows = await this.db.getAllAsync(
        `SELECT move, COUNT(DISTINCT chapter_id) AS n, MIN(var_depth) AS d
         FROM repertoire_moves
         WHERE normalized_fen = ? AND move IS NOT NULL${color ? ' AND color = ?' : ''}
         GROUP BY move
         ORDER BY d ASC, n DESC
         LIMIT ?`,
        color ? [normalizeFen(fen), color, limit] : [normalizeFen(fen), limit]
      ) as Array<{ move: string; n: number; d: number }>;
      return rows.map(r => ({ move: r.move, count: r.n, varDepth: r.d }));
    } catch {
      // Table not ready yet (e.g. Fast Refresh mid-migration)
      return [];
    }
  }

  /** Which moves get played from this position in the stored games, most frequent first. */
  async getGameMoveCandidates(
    gameType: 'user' | 'master',
    fen: string,
    limit: number = CANDIDATE_MOVE_LIMIT
  ): Promise<MoveCandidate[]> {
    if (this.isWeb || !this.db) return [];

    try {
      const rows = await this.db.getAllAsync(
        `SELECT next_move AS move, COUNT(*) AS n
         FROM game_positions
         WHERE game_type = ? AND normalized_fen = ? AND next_move IS NOT NULL
         GROUP BY next_move
         ORDER BY n DESC
         LIMIT ?`,
        [gameType, normalizeFen(fen), limit]
      ) as Array<{ move: string; n: number }>;
      return rows.map(r => ({ move: r.move, count: r.n }));
    } catch {
      return [];
    }
  }

  // ==================== OPENING BOOK REGISTRY ====================

  /** Every installed book, newest first. The book files themselves live outside this DB. */
  async getBookRecords(): Promise<BookRecord[]> {
    if (this.isWeb || !this.db) return [];
    try {
      const rows = await this.db.getAllAsync(
        'SELECT * FROM master_books ORDER BY imported_at DESC'
      ) as any[];
      return rows.map(toBookRecord);
    } catch {
      return [];
    }
  }

  async addBookRecord(book: BookRecord): Promise<void> {
    if (this.isWeb || !this.db) return;
    await this.db.runAsync(
      `INSERT OR REPLACE INTO master_books
       (id, name, player, source_file, file_name, game_count, position_count,
        size_bytes, max_ply, has_games, imported_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        book.id, book.name, book.player, book.sourceFile, book.fileName,
        book.gameCount, book.positionCount, book.sizeBytes, book.maxPly,
        book.hasGames ? 1 : 0, book.importedAt.getTime(),
      ]
    );
  }

  async deleteBookRecord(id: string): Promise<void> {
    if (this.isWeb || !this.db) return;
    await this.db.runAsync('DELETE FROM master_books WHERE id = ?', [id]);
  }

  // ==================== FEN-BASED SEARCH ====================

  /**
   * Replay a PGN's moves and check if any position matches the target FEN
   */
  private gameContainsFen(pgn: string, normalizedTarget: string): boolean {
    const chess = new Chess();

    // Check starting position
    if (normalizeFen(chess.fen()) === normalizedTarget) return true;

    // Strip headers and comments, extract moves
    let movesText = pgn.replace(/^\[.*?\]$/gm, '');
    movesText = movesText.replace(/\{[^}]*\}/g, '');
    movesText = movesText.replace(/;.*$/gm, '');
    movesText = movesText.replace(/\s+(1-0|0-1|1\/2-1\/2|\*)\s*$/g, '');

    const sections = movesText.split(/\d+\.\s*/).filter(s => s.trim());
    for (const section of sections) {
      const tokens = section.trim().split(/\s+/).filter(t => t.trim());
      for (const token of tokens) {
        const clean = token.replace(/[!?]+$/, '').replace(/[",]/g, '').trim();
        if (!clean) continue;
        try {
          chess.move(clean);
          if (normalizeFen(chess.fen()) === normalizedTarget) return true;
        } catch {
          // Not a valid move token, skip
        }
      }
    }

    return false;
  }

  /**
   * Search user games that contain a specific FEN position (SQL index lookup)
   */
  async searchUserGamesByFEN(fen: string): Promise<PositionGames<UserGame>> {
    if (this.isWeb) return WebDatabaseService.searchUserGamesByFEN(fen);
    if (!this.db) throw new Error('Database not initialized');

    const normalized = normalizeFen(fen);

    // If still indexing, fall back to brute-force
    if (this.isIndexing) {
      const allGames = await this.getAllUserGames();
      const matches = allGames
        .filter(game => this.gameContainsFen(game.pgn, normalized))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      return {
        games: matches.slice(0, POSITION_MATCH_LIMIT),
        hasMore: matches.length > POSITION_MATCH_LIMIT,
      };
    }

    // One row past the cap, so truncation is known without a second COUNT over the join —
    // which at an early position would scan most of the index to answer.
    const rows = await this.db.getAllAsync(
      `SELECT DISTINCT ug.* FROM user_games ug
       INNER JOIN game_positions gp ON ug.id = gp.game_id AND gp.game_type = 'user'
       WHERE gp.normalized_fen = ?
       ORDER BY ug.date DESC
       LIMIT ?`,
      [normalized, POSITION_MATCH_LIMIT + 1]
    ) as any[];
    return {
      games: rows.slice(0, POSITION_MATCH_LIMIT).map((row: any) => this.rowToUserGame(row)),
      hasMore: rows.length > POSITION_MATCH_LIMIT,
    };
  }

  /**
   * Search master games that contain a specific FEN position (SQL index lookup)
   */
  async searchMasterGamesByFEN(fen: string): Promise<PositionGames<MasterGame>> {
    if (this.isWeb) return WebDatabaseService.searchMasterGamesByFEN(fen);
    if (!this.db) throw new Error('Database not initialized');

    const normalized = normalizeFen(fen);

    if (this.isIndexing) {
      const allGames = await this.getAllMasterGames();
      const matches = allGames
        .filter(game => this.gameContainsFen(game.pgn, normalized))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      return {
        games: matches.slice(0, POSITION_MATCH_LIMIT),
        hasMore: matches.length > POSITION_MATCH_LIMIT,
      };
    }

    const rows = await this.db.getAllAsync(
      `SELECT DISTINCT mg.* FROM master_games mg
       INNER JOIN game_positions gp ON mg.id = gp.game_id AND gp.game_type = 'master'
       WHERE gp.normalized_fen = ?
       ORDER BY mg.date DESC
       LIMIT ?`,
      [normalized, POSITION_MATCH_LIMIT + 1]
    ) as any[];
    return {
      games: rows.slice(0, POSITION_MATCH_LIMIT).map((row: any) => this.rowToMasterGame(row)),
      hasMore: rows.length > POSITION_MATCH_LIMIT,
    };
  }
}

export const DatabaseService = new DatabaseServiceClass();
export type { PaginatedResult };
export { CANDIDATE_MOVE_LIMIT };
