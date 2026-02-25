/**
 * WebDatabaseService - IndexedDB storage for web platform
 * Provides same interface as SQLite DatabaseService but uses IndexedDB
 */

import { UserGame, MasterGame, Repertoire } from '@types';

const DB_NAME = 'kingside_db';
const DB_VERSION = 1;
const USER_GAMES_STORE = 'user_games';
const MASTER_GAMES_STORE = 'master_games';
const PAGE_SIZE = 50;

interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  hasMore: boolean;
  page: number;
}

class WebDatabaseServiceClass {
  private db: IDBDatabase | null = null;

  /**
   * Initialize IndexedDB database
   */
  async initialize(): Promise<void> {
    console.log('[WebDatabase] Initializing IndexedDB...');

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[WebDatabase] Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[WebDatabase] Database initialized successfully');
        resolve();
      };

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create user_games store
        if (!db.objectStoreNames.contains(USER_GAMES_STORE)) {
          const userGamesStore = db.createObjectStore(USER_GAMES_STORE, { keyPath: 'id' });
          userGamesStore.createIndex('imported_at', 'importedAt', { unique: false });
          userGamesStore.createIndex('date', 'date', { unique: false });
          userGamesStore.createIndex('eco', 'eco', { unique: false });
        }

        // Create master_games store
        if (!db.objectStoreNames.contains(MASTER_GAMES_STORE)) {
          const masterGamesStore = db.createObjectStore(MASTER_GAMES_STORE, { keyPath: 'id' });
          masterGamesStore.createIndex('imported_at', 'importedAt', { unique: false });
          masterGamesStore.createIndex('date', 'date', { unique: false });
          masterGamesStore.createIndex('eco', 'eco', { unique: false });
        }

        console.log('[WebDatabase] Database schema created');
      };
    });
  }

  /**
   * Helper to get object store
   */
  private getStore(storeName: string, mode: IDBTransactionMode): IDBObjectStore {
    if (!this.db) throw new Error('Database not initialized');
    const transaction = this.db.transaction([storeName], mode);
    return transaction.objectStore(storeName);
  }

  /**
   * Helper to convert timestamp to Date
   */
  private parseDate(value: any): Date {
    if (value instanceof Date) return value;
    if (typeof value === 'number') return new Date(value);
    if (typeof value === 'string') return new Date(value);
    return new Date();
  }

  // ==================== USER GAMES ====================

  /**
   * Add multiple user games (bulk insert)
   */
  async addUserGames(games: UserGame[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    console.log(`[WebDatabase] Adding ${games.length} user games...`);

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([USER_GAMES_STORE], 'readwrite');
      const store = transaction.objectStore(USER_GAMES_STORE);

      let completed = 0;
      let hasError = false;

      for (const game of games) {
        const request = store.put({
          ...game,
          importedAt: game.importedAt.getTime(), // Store as timestamp
        });

        request.onsuccess = () => {
          completed++;
          if (completed === games.length && !hasError) {
            console.log(`[WebDatabase] Added ${games.length} user games successfully`);
            resolve();
          }
        };

        request.onerror = () => {
          if (!hasError) {
            hasError = true;
            console.error('[WebDatabase] Failed to add user games:', request.error);
            reject(request.error);
          }
        };
      }
    });
  }

  /**
   * Get user games with pagination
   */
  async getUserGames(page: number = 0, pageSize: number = PAGE_SIZE): Promise<PaginatedResult<UserGame>> {
    if (!this.db) throw new Error('Database not initialized');

    const offset = page * pageSize;

    // Get all items sorted by imported_at (descending)
    const allItems = await this.getAllUserGames();

    // Sort by importedAt descending
    allItems.sort((a, b) => b.importedAt.getTime() - a.importedAt.getTime());

    const totalCount = allItems.length;
    const items = allItems.slice(offset, offset + pageSize);
    const hasMore = offset + pageSize < totalCount;

    return { items, totalCount, hasMore, page };
  }

  /**
   * Get all user games
   */
  async getAllUserGames(): Promise<UserGame[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const store = this.getStore(USER_GAMES_STORE, 'readonly');
      const request = store.getAll();

      request.onsuccess = () => {
        const games = request.result.map(item => ({
          ...item,
          importedAt: this.parseDate(item.importedAt),
        })) as UserGame[];
        resolve(games);
      };

      request.onerror = () => {
        console.error('[WebDatabase] Failed to get user games:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get user game by ID
   */
  async getUserGameById(id: string): Promise<UserGame | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const store = this.getStore(USER_GAMES_STORE, 'readonly');
      const request = store.get(id);

      request.onsuccess = () => {
        if (request.result) {
          const game = {
            ...request.result,
            importedAt: this.parseDate(request.result.importedAt),
          } as UserGame;
          resolve(game);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error('[WebDatabase] Failed to get user game:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Delete user game
   */
  async deleteUserGame(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const store = this.getStore(USER_GAMES_STORE, 'readwrite');
      const request = store.delete(id);

      request.onsuccess = () => {
        console.log(`[WebDatabase] Deleted user game: ${id}`);
        resolve();
      };

      request.onerror = () => {
        console.error('[WebDatabase] Failed to delete user game:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Delete all user games
   */
  async deleteAllUserGames(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const store = this.getStore(USER_GAMES_STORE, 'readwrite');
      const request = store.clear();

      request.onsuccess = () => {
        console.log('[WebDatabase] Deleted all user games');
        resolve();
      };

      request.onerror = () => {
        console.error('[WebDatabase] Failed to delete all user games:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get user games count
   */
  async getUserGamesCount(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const store = this.getStore(USER_GAMES_STORE, 'readonly');
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.error('[WebDatabase] Failed to count user games:', request.error);
        reject(request.error);
      };
    });
  }

  // ==================== MASTER GAMES ====================

  /**
   * Add multiple master games (bulk insert)
   */
  async addMasterGames(games: MasterGame[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    console.log(`[WebDatabase] Adding ${games.length} master games...`);

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([MASTER_GAMES_STORE], 'readwrite');
      const store = transaction.objectStore(MASTER_GAMES_STORE);

      let completed = 0;
      let hasError = false;

      for (const game of games) {
        const request = store.put({
          ...game,
          importedAt: game.importedAt.getTime(),
        });

        request.onsuccess = () => {
          completed++;
          if (completed === games.length && !hasError) {
            console.log(`[WebDatabase] Added ${games.length} master games successfully`);
            resolve();
          }
        };

        request.onerror = () => {
          if (!hasError) {
            hasError = true;
            console.error('[WebDatabase] Failed to add master games:', request.error);
            reject(request.error);
          }
        };
      }
    });
  }

  /**
   * Get master games with pagination
   */
  async getMasterGames(page: number = 0, pageSize: number = PAGE_SIZE): Promise<PaginatedResult<MasterGame>> {
    if (!this.db) throw new Error('Database not initialized');

    const offset = page * pageSize;

    // Get all items sorted by imported_at (descending)
    const allItems = await this.getAllMasterGames();

    // Sort by importedAt descending
    allItems.sort((a, b) => b.importedAt.getTime() - a.importedAt.getTime());

    const totalCount = allItems.length;
    const items = allItems.slice(offset, offset + pageSize);
    const hasMore = offset + pageSize < totalCount;

    return { items, totalCount, hasMore, page };
  }

  /**
   * Get all master games
   */
  async getAllMasterGames(): Promise<MasterGame[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const store = this.getStore(MASTER_GAMES_STORE, 'readonly');
      const request = store.getAll();

      request.onsuccess = () => {
        const games = request.result.map(item => ({
          ...item,
          importedAt: this.parseDate(item.importedAt),
        })) as MasterGame[];
        resolve(games);
      };

      request.onerror = () => {
        console.error('[WebDatabase] Failed to get master games:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get master game by ID
   */
  async getMasterGameById(id: string): Promise<MasterGame | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const store = this.getStore(MASTER_GAMES_STORE, 'readonly');
      const request = store.get(id);

      request.onsuccess = () => {
        if (request.result) {
          const game = {
            ...request.result,
            importedAt: this.parseDate(request.result.importedAt),
          } as MasterGame;
          resolve(game);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error('[WebDatabase] Failed to get master game:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Delete master game
   */
  async deleteMasterGame(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const store = this.getStore(MASTER_GAMES_STORE, 'readwrite');
      const request = store.delete(id);

      request.onsuccess = () => {
        console.log(`[WebDatabase] Deleted master game: ${id}`);
        resolve();
      };

      request.onerror = () => {
        console.error('[WebDatabase] Failed to delete master game:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Delete all master games
   */
  async deleteAllMasterGames(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const store = this.getStore(MASTER_GAMES_STORE, 'readwrite');
      const request = store.clear();

      request.onsuccess = () => {
        console.log('[WebDatabase] Deleted all master games');
        resolve();
      };

      request.onerror = () => {
        console.error('[WebDatabase] Failed to delete all master games:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get master games count
   */
  async getMasterGamesCount(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const store = this.getStore(MASTER_GAMES_STORE, 'readonly');
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.error('[WebDatabase] Failed to count master games:', request.error);
        reject(request.error);
      };
    });
  }

  // ==================== REPERTOIRES ====================

  async addRepertoire(_r: Repertoire): Promise<void> {
    throw new Error('Repertoire SQLite not supported on web platform');
  }

  async updateRepertoire(_r: Repertoire): Promise<void> {
    throw new Error('Repertoire SQLite not supported on web platform');
  }

  async deleteRepertoire(_id: string): Promise<void> {
    throw new Error('Repertoire SQLite not supported on web platform');
  }

  async getAllRepertoires(): Promise<Repertoire[]> {
    throw new Error('Repertoire SQLite not supported on web platform');
  }

  async getRepertoireById(_id: string): Promise<Repertoire | null> {
    throw new Error('Repertoire SQLite not supported on web platform');
  }

  async getRepertoiresCount(): Promise<number> {
    throw new Error('Repertoire SQLite not supported on web platform');
  }

  // ==================== SETTINGS ====================

  async saveSetting(_key: string, _value: unknown): Promise<void> {
    throw new Error('Settings SQLite not supported on web platform');
  }

  async getSetting<T>(_key: string): Promise<T | null> {
    throw new Error('Settings SQLite not supported on web platform');
  }

  // ==================== SEARCH / FILTER ====================

  /**
   * Search user games (simplified - loads all then filters in memory)
   */
  async searchUserGames(query: string, page: number = 0, pageSize: number = PAGE_SIZE): Promise<PaginatedResult<UserGame>> {
    const allGames = await this.getAllUserGames();
    const lowerQuery = query.toLowerCase();

    const filtered = allGames.filter(g =>
      g.white.toLowerCase().includes(lowerQuery) ||
      g.black.toLowerCase().includes(lowerQuery) ||
      g.event?.toLowerCase().includes(lowerQuery) ||
      g.eco?.toLowerCase().includes(lowerQuery)
    );

    const offset = page * pageSize;
    const items = filtered.slice(offset, offset + pageSize);
    const totalCount = filtered.length;
    const hasMore = offset + pageSize < totalCount;

    return { items, totalCount, hasMore, page };
  }

  /**
   * Search master games
   */
  async searchMasterGames(query: string, page: number = 0, pageSize: number = PAGE_SIZE): Promise<PaginatedResult<MasterGame>> {
    const allGames = await this.getAllMasterGames();
    const lowerQuery = query.toLowerCase();

    const filtered = allGames.filter(g =>
      g.white.toLowerCase().includes(lowerQuery) ||
      g.black.toLowerCase().includes(lowerQuery) ||
      g.event?.toLowerCase().includes(lowerQuery) ||
      g.eco?.toLowerCase().includes(lowerQuery)
    );

    const offset = page * pageSize;
    const items = filtered.slice(offset, offset + pageSize);
    const totalCount = filtered.length;
    const hasMore = offset + pageSize < totalCount;

    return { items, totalCount, hasMore, page };
  }

  // ==================== FEN-BASED SEARCH ====================

  async searchUserGamesByFEN(_fen: string): Promise<UserGame[]> {
    throw new Error('FEN search not supported on web platform');
  }

  async searchMasterGamesByFEN(_fen: string): Promise<MasterGame[]> {
    throw new Error('FEN search not supported on web platform');
  }
}

export const WebDatabaseService = new WebDatabaseServiceClass();
export type { PaginatedResult };
