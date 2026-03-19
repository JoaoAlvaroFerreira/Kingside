/**
 * DatabaseService - Platform-aware database storage
 * Uses SQLite on native, IndexedDB on web
 */

import { Platform } from 'react-native';
import { UserGame, MasterGame, Repertoire, normalizeFen, EngineEvaluation } from '@types';
import { Chess } from 'chess.js';
import { WebDatabaseService } from './WebDatabaseService';
import { extractChapterPositions, mergePositionMaps, PositionMap } from '@utils/extractRepertoirePositions';
import * as FileSystem from 'expo-file-system';

/** Thrown when the database cannot be opened even after WAL recovery. */
export class DatabaseOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseOpenError';
  }
}

const DB_NAME = 'kingside.db';
const PAGE_SIZE = 25; // Games per page
const SCHEMA_VERSION = 4; // Bump when schema changes
const INDEX_BATCH_SIZE = 10; // Games per batch during background indexing

interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  hasMore: boolean;
  page: number;
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
  async initialize(): Promise<void> {
    // Use IndexedDB on web, SQLite on native
    if (this.isWeb) {
      console.log('[DatabaseService] Using IndexedDB for web platform');
      return WebDatabaseService.initialize();
    }

    console.log('[DatabaseService] Using SQLite for native platform');

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

      // Schema migration: FEN index table
      await this.migrateSchema();

      console.log('[DatabaseService] Database initialized successfully');
    } catch (error) {
      console.error('[DatabaseService] Failed to initialize database schema:', error);
      throw error;
    }
  }

  /**
   * Run schema migrations based on PRAGMA user_version
   */
  private async migrateSchema(): Promise<void> {
    const versionRow = await this.db!.getFirstAsync('PRAGMA user_version') as any;
    const currentVersion = versionRow?.user_version ?? 0;

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

    // V3: repertoire_positions table — check actual existence, not just user_version.
    // If the app ran during development before this migration was stable, user_version may
    // already be 3 but the table might not exist.
    const repPosExists = await this.db!.getFirstAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='repertoire_positions'"
    ) as any;
    if (currentVersion < 3 || !repPosExists) {
      await this.db!.execAsync(`
        CREATE TABLE IF NOT EXISTS repertoire_positions (
          repertoire_id TEXT NOT NULL,
          color TEXT NOT NULL,
          move_count INTEGER NOT NULL,
          normalized_fen TEXT NOT NULL,
          next_moves TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_rep_pos_color_fen
          ON repertoire_positions(color, normalized_fen);
        CREATE INDEX IF NOT EXISTS idx_rep_pos_repertoire
          ON repertoire_positions(repertoire_id);
      `);
      console.log('[DatabaseService] Migrated to schema v3 (repertoire_positions table)');

      // Backfill existing repertoires
      await this.backfillRepertoirePositions();
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

    if (currentVersion < SCHEMA_VERSION) {
      await this.db!.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    }
  }

  /** Index all already-stored repertoires (runs once on V3 migration). */
  private async backfillRepertoirePositions(): Promise<void> {
    const rows = await this.db!.getAllAsync('SELECT data FROM repertoires') as any[];
    console.log(`[DatabaseService] Backfilling position index for ${rows.length} repertoire(s)...`);
    for (const row of rows) {
      try {
        const rep = JSON.parse(row.data) as Repertoire;
        await this.indexRepertoirePositions(rep);
      } catch (e) {
        console.warn('[DatabaseService] Failed to backfill repertoire:', e);
      }
    }
    console.log('[DatabaseService] Repertoire position backfill complete');
  }

  /** Build and persist the FEN index for a repertoire (replaces any existing index). */
  private async indexRepertoirePositions(repertoire: Repertoire): Promise<void> {
    await this.db!.runAsync(
      'DELETE FROM repertoire_positions WHERE repertoire_id = ?',
      [repertoire.id]
    );

    const combined: PositionMap = new Map();
    for (const chapter of repertoire.chapters) {
      try {
        mergePositionMaps(combined, extractChapterPositions(chapter));
      } catch {
        console.warn(`[DatabaseService] Skipping malformed chapter "${chapter.name}" during position indexing`);
      }
    }

    // Collect all rows first, then insert in batches to avoid a single
    // long-running transaction that can time out on large repertoires.
    const rows: [string, string, number, string, string][] = [];
    for (const [moveCount, posAtCount] of combined) {
      for (const [fen, moves] of posAtCount) {
        rows.push([repertoire.id, repertoire.color, moveCount, fen, JSON.stringify([...moves])]);
      }
    }

    const BATCH_SIZE = 300;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      await this.db!.withTransactionAsync(async () => {
        for (const row of batch) {
          await this.db!.runAsync(
            `INSERT INTO repertoire_positions
               (repertoire_id, color, move_count, normalized_fen, next_moves)
             VALUES (?, ?, ?, ?, ?)`,
            row
          );
        }
      });
      // Yield to the JS event loop between batches
      if (i + BATCH_SIZE < rows.length) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  }

  /**
   * Extract all unique normalized FENs from a PGN string
   */
  private extractFensFromPgn(pgn: string): string[] {
    // Check for custom starting FEN in headers
    const fenMatch = pgn.match(/^\[FEN\s+"([^"]+)"\s*\]$/m);
    const startFen = fenMatch ? fenMatch[1] : undefined;

    const chess = startFen ? new Chess(startFen) : new Chess();
    const fens: string[] = [normalizeFen(chess.fen())];

    // Strip headers, comments, result tokens
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
          fens.push(normalizeFen(chess.fen()));
        } catch {
          // Not a valid move token
        }
      }
    }

    return [...new Set(fens)];
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
        const fens = this.extractFensFromPgn(game.pgn);
        for (const fen of fens) {
          await this.db!.runAsync(
            'INSERT INTO game_positions (game_id, game_type, normalized_fen) VALUES (?, ?, ?)',
            [game.id, gameType, fen]
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
      pgn: row.pgn,
      moves: JSON.parse(row.moves),
      startFen: row.start_fen || undefined,
      importedAt: new Date(row.imported_at),
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
      pgn: row.pgn,
      moves: JSON.parse(row.moves),
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
             (id, white, black, result, date, event, site, eco, pgn, moves, start_fen, imported_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              game.id,
              game.white,
              game.black,
              game.result || '',
              game.date || '',
              game.event || '',
              game.site || '',
              game.eco || '',
              game.pgn,
              JSON.stringify(game.moves),
              game.startFen || null,
              game.importedAt.getTime(),
            ]
          );

          // Index FEN positions for this game
          const fens = this.extractFensFromPgn(game.pgn);
          // Clear old positions first (handles re-import)
          await this.db!.runAsync(
            'DELETE FROM game_positions WHERE game_id = ? AND game_type = ?',
            [game.id, 'user']
          );
          for (const fen of fens) {
            await this.db!.runAsync(
              'INSERT INTO game_positions (game_id, game_type, normalized_fen) VALUES (?, ?, ?)',
              [game.id, 'user', fen]
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
             (id, white, black, result, date, event, site, eco, pgn, moves, start_fen, imported_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              game.id,
              game.white,
              game.black,
              game.result || '',
              game.date || '',
              game.event || '',
              game.site || '',
              game.eco || '',
              game.pgn,
              JSON.stringify(game.moves),
              game.startFen || null,
              game.importedAt.getTime(),
            ]
          );

          // Index FEN positions for this game
          const fens = this.extractFensFromPgn(game.pgn);
          await this.db!.runAsync(
            'DELETE FROM game_positions WHERE game_id = ? AND game_type = ?',
            [game.id, 'master']
          );
          for (const fen of fens) {
            await this.db!.runAsync(
              'INSERT INTO game_positions (game_id, game_type, normalized_fen) VALUES (?, ?, ?)',
              [game.id, 'master', fen]
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
    if (typeof value === 'string') {
      const datePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
      if (datePattern.test(value)) {
        return new Date(value);
      }
    }
    return value;
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

    await this.db.runAsync(
      `UPDATE repertoires SET name = ?, color = ?, data = ?, updated_at = ? WHERE id = ?`,
      [repertoire.name, repertoire.color, JSON.stringify(repertoire), Date.now(), repertoire.id]
    );
    try { await this.indexRepertoirePositions(repertoire); } catch { /* table not ready yet */ }
  }

  async deleteRepertoire(id: string): Promise<void> {
    if (this.isWeb) return WebDatabaseService.deleteRepertoire(id);
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync('DELETE FROM repertoires WHERE id = ?', [id]);
    // repertoire_positions may not exist if the V3 migration hasn't run yet (e.g. Fast Refresh)
    try {
      await this.db.runAsync('DELETE FROM repertoire_positions WHERE repertoire_id = ?', [id]);
    } catch { /* table doesn't exist yet — ignore */ }
  }

  async getAllRepertoires(): Promise<Repertoire[]> {
    if (this.isWeb) return WebDatabaseService.getAllRepertoires();
    if (!this.db) throw new Error('Database not initialized');

    const rows = await this.db.getAllAsync('SELECT data FROM repertoires ORDER BY created_at ASC');
    return (rows as any[]).map((row: any) =>
      JSON.parse(row.data, (key, value) => this.dateReviver(key, value)) as Repertoire
    );
  }

  async getRepertoireById(id: string): Promise<Repertoire | null> {
    if (this.isWeb) return WebDatabaseService.getRepertoireById(id);
    if (!this.db) throw new Error('Database not initialized');

    const row = await this.db.getFirstAsync('SELECT data FROM repertoires WHERE id = ?', [id]) as any;
    if (!row) return null;
    return JSON.parse(row.data, (key, value) => this.dateReviver(key, value)) as Repertoire;
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
        'SELECT move_count, normalized_fen, next_moves FROM repertoire_positions WHERE color = ?',
        [color]
      ) as Array<{ move_count: number; normalized_fen: string; next_moves: string }>;

      const map: PositionMap = new Map();
      for (const row of rows) {
        if (!map.has(row.move_count)) map.set(row.move_count, new Map());
        const atCount = map.get(row.move_count)!;
        const moves: string[] = JSON.parse(row.next_moves);
        if (!atCount.has(row.normalized_fen)) {
          atCount.set(row.normalized_fen, new Set(moves));
        } else {
          for (const m of moves) atCount.get(row.normalized_fen)!.add(m);
        }
      }
      return map;
    } catch {
      // Table not ready — build in-memory from stored repertoires as fallback
      console.warn('[DatabaseService] repertoire_positions unavailable, building position map in-memory');
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
  async searchUserGamesByFEN(fen: string): Promise<UserGame[]> {
    if (this.isWeb) return WebDatabaseService.searchUserGamesByFEN(fen);
    if (!this.db) throw new Error('Database not initialized');

    const normalized = normalizeFen(fen);

    // If still indexing, fall back to brute-force
    if (this.isIndexing) {
      const allGames = await this.getAllUserGames();
      return allGames.filter(game => this.gameContainsFen(game.pgn, normalized));
    }

    const rows = await this.db.getAllAsync(
      `SELECT DISTINCT ug.* FROM user_games ug
       INNER JOIN game_positions gp ON ug.id = gp.game_id AND gp.game_type = 'user'
       WHERE gp.normalized_fen = ?`,
      [normalized]
    );
    return (rows as any[]).map((row: any) => this.rowToUserGame(row));
  }

  /**
   * Search master games that contain a specific FEN position (SQL index lookup)
   */
  async searchMasterGamesByFEN(fen: string): Promise<MasterGame[]> {
    if (this.isWeb) return WebDatabaseService.searchMasterGamesByFEN(fen);
    if (!this.db) throw new Error('Database not initialized');

    const normalized = normalizeFen(fen);

    if (this.isIndexing) {
      const allGames = await this.getAllMasterGames();
      return allGames.filter(game => this.gameContainsFen(game.pgn, normalized));
    }

    const rows = await this.db.getAllAsync(
      `SELECT DISTINCT mg.* FROM master_games mg
       INNER JOIN game_positions gp ON mg.id = gp.game_id AND gp.game_type = 'master'
       WHERE gp.normalized_fen = ?`,
      [normalized]
    );
    return (rows as any[]).map((row: any) => this.rowToMasterGame(row));
  }
}

export const DatabaseService = new DatabaseServiceClass();
export type { PaginatedResult };
