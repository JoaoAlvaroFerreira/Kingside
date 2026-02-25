/**
 * DatabaseService - Platform-aware database storage
 * Uses SQLite on native, IndexedDB on web
 */

import { Platform } from 'react-native';
import { UserGame, MasterGame, Repertoire, normalizeFen } from '@types';
import { Chess } from 'chess.js';
import { WebDatabaseService } from './WebDatabaseService';

const DB_NAME = 'kingside.db';
const PAGE_SIZE = 50; // Games per page

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
  private fenSearchCache = new Map<string, UserGame[]>();
  private masterFenSearchCache = new Map<string, MasterGame[]>();

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

    try {
      this.db = await SQLite.openDatabaseAsync(DB_NAME);

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

      console.log('[DatabaseService] Database initialized successfully');
    } catch (error) {
      console.error('[DatabaseService] Failed to initialize database:', error);
      throw error;
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
      // Use transaction for bulk insert
      await this.db.withTransactionAsync(async () => {
        for (const game of games) {
          await this.db!.runAsync(
            `INSERT OR REPLACE INTO user_games
             (id, white, black, result, date, event, site, eco, pgn, moves, imported_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
              game.importedAt.getTime(),
            ]
          );
        }
      });

      this.fenSearchCache.clear();
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
    this.fenSearchCache.clear();
    console.log(`[DatabaseService] Deleted user game: ${id}`);
  }

  /**
   * Delete all user games
   */
  async deleteAllUserGames(): Promise<void> {
    if (this.isWeb) return WebDatabaseService.deleteAllUserGames();
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync('DELETE FROM user_games');
    this.fenSearchCache.clear();
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
      // Use transaction for bulk insert
      await this.db.withTransactionAsync(async () => {
        for (const game of games) {
          await this.db!.runAsync(
            `INSERT OR REPLACE INTO master_games
             (id, white, black, result, date, event, site, eco, pgn, moves, imported_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
              game.importedAt.getTime(),
            ]
          );
        }
      });

      this.masterFenSearchCache.clear();
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
    this.masterFenSearchCache.clear();
    console.log(`[DatabaseService] Deleted master game: ${id}`);
  }

  /**
   * Delete all master games
   */
  async deleteAllMasterGames(): Promise<void> {
    if (this.isWeb) return WebDatabaseService.deleteAllMasterGames();
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync('DELETE FROM master_games');
    this.masterFenSearchCache.clear();
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
  }

  async updateRepertoire(repertoire: Repertoire): Promise<void> {
    if (this.isWeb) return WebDatabaseService.updateRepertoire(repertoire);
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(
      `UPDATE repertoires SET name = ?, color = ?, data = ?, updated_at = ? WHERE id = ?`,
      [repertoire.name, repertoire.color, JSON.stringify(repertoire), Date.now(), repertoire.id]
    );
  }

  async deleteRepertoire(id: string): Promise<void> {
    if (this.isWeb) return WebDatabaseService.deleteRepertoire(id);
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync('DELETE FROM repertoires WHERE id = ?', [id]);
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
   * Search user games that contain a specific FEN position
   */
  async searchUserGamesByFEN(fen: string): Promise<UserGame[]> {
    if (this.isWeb) return WebDatabaseService.searchUserGamesByFEN(fen);

    const cached = this.fenSearchCache.get(fen);
    if (cached) return cached;

    const allGames = await this.getAllUserGames();
    const normalizedTarget = normalizeFen(fen);

    const matches = allGames.filter(game => this.gameContainsFen(game.pgn, normalizedTarget));

    this.fenSearchCache.set(fen, matches);
    return matches;
  }

  /**
   * Search master games that contain a specific FEN position
   */
  async searchMasterGamesByFEN(fen: string): Promise<MasterGame[]> {
    if (this.isWeb) return WebDatabaseService.searchMasterGamesByFEN(fen);

    const cached = this.masterFenSearchCache.get(fen);
    if (cached) return cached;

    const allGames = await this.getAllMasterGames();
    const normalizedTarget = normalizeFen(fen);

    const matches = allGames.filter(game => this.gameContainsFen(game.pgn, normalizedTarget));

    this.masterFenSearchCache.set(fen, matches);
    return matches;
  }
}

export const DatabaseService = new DatabaseServiceClass();
export type { PaginatedResult };
