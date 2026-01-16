/**
 * DatabaseService - Platform-aware database storage
 * Uses SQLite on native, IndexedDB on web
 */

import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { UserGame, MasterGame } from '@types';
import { WebDatabaseService } from './WebDatabaseService';

const DB_NAME = 'kingside.db';
const PAGE_SIZE = 50; // Games per page

interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  hasMore: boolean;
  page: number;
}

class DatabaseServiceClass {
  private db: SQLite.SQLiteDatabase | null = null;
  private isWeb = Platform.OS === 'web';

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
    const countResult = await this.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM user_games'
    );
    const totalCount = countResult?.count || 0;

    // Get paginated results
    const rows = await this.db.getAllAsync(
      'SELECT * FROM user_games ORDER BY imported_at DESC LIMIT ? OFFSET ?',
      [pageSize, offset]
    );

    const items = rows.map(row => this.rowToUserGame(row));
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
    return rows.map(row => this.rowToUserGame(row));
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
    console.log(`[DatabaseService] Deleted user game: ${id}`);
  }

  /**
   * Delete all user games
   */
  async deleteAllUserGames(): Promise<void> {
    if (this.isWeb) return WebDatabaseService.deleteAllUserGames();
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync('DELETE FROM user_games');
    console.log('[DatabaseService] Deleted all user games');
  }

  /**
   * Get user games count
   */
  async getUserGamesCount(): Promise<number> {
    if (this.isWeb) return WebDatabaseService.getUserGamesCount();
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM user_games'
    );
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
    const countResult = await this.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM master_games'
    );
    const totalCount = countResult?.count || 0;

    // Get paginated results
    const rows = await this.db.getAllAsync(
      'SELECT * FROM master_games ORDER BY imported_at DESC LIMIT ? OFFSET ?',
      [pageSize, offset]
    );

    const items = rows.map(row => this.rowToMasterGame(row));
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
    return rows.map(row => this.rowToMasterGame(row));
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
    console.log(`[DatabaseService] Deleted master game: ${id}`);
  }

  /**
   * Delete all master games
   */
  async deleteAllMasterGames(): Promise<void> {
    if (this.isWeb) return WebDatabaseService.deleteAllMasterGames();
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync('DELETE FROM master_games');
    console.log('[DatabaseService] Deleted all master games');
  }

  /**
   * Get master games count
   */
  async getMasterGamesCount(): Promise<number> {
    if (this.isWeb) return WebDatabaseService.getMasterGamesCount();
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM master_games'
    );
    return result?.count || 0;
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
    const countResult = await this.db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM user_games
       WHERE white LIKE ? OR black LIKE ? OR event LIKE ? OR eco LIKE ?`,
      [searchPattern, searchPattern, searchPattern, searchPattern]
    );
    const totalCount = countResult?.count || 0;

    // Get paginated results
    const rows = await this.db.getAllAsync(
      `SELECT * FROM user_games
       WHERE white LIKE ? OR black LIKE ? OR event LIKE ? OR eco LIKE ?
       ORDER BY imported_at DESC LIMIT ? OFFSET ?`,
      [searchPattern, searchPattern, searchPattern, searchPattern, pageSize, offset]
    );

    const items = rows.map(row => this.rowToUserGame(row));
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
    const countResult = await this.db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM master_games
       WHERE white LIKE ? OR black LIKE ? OR event LIKE ? OR eco LIKE ?`,
      [searchPattern, searchPattern, searchPattern, searchPattern]
    );
    const totalCount = countResult?.count || 0;

    // Get paginated results
    const rows = await this.db.getAllAsync(
      `SELECT * FROM master_games
       WHERE white LIKE ? OR black LIKE ? OR event LIKE ? OR eco LIKE ?
       ORDER BY imported_at DESC LIMIT ? OFFSET ?`,
      [searchPattern, searchPattern, searchPattern, searchPattern, pageSize, offset]
    );

    const items = rows.map(row => this.rowToMasterGame(row));
    const hasMore = offset + pageSize < totalCount;

    return { items, totalCount, hasMore, page };
  }
}

export const DatabaseService = new DatabaseServiceClass();
export type { PaginatedResult };
