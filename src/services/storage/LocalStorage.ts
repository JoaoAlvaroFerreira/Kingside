/**
 * Local Storage Service - Handle persistence of repertoires to AsyncStorage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Repertoire } from '@types';

const REPERTOIRES_KEY = 'kingside_repertoires';

export class LocalStorageService {
  /**
   * Save a single repertoire
   */
  static async saveRepertoire(repertoire: Repertoire): Promise<void> {
    try {
      const existing = await this.loadAllRepertoires();
      const filtered = existing.filter((rep) => rep.id !== repertoire.id);
      const updated = [...filtered, {
        ...repertoire,
        createdAt: repertoire.createdAt instanceof Date ? repertoire.createdAt.toISOString() : repertoire.createdAt,
        updatedAt: repertoire.updatedAt instanceof Date ? repertoire.updatedAt.toISOString() : repertoire.updatedAt,
      }];
      await AsyncStorage.setItem(REPERTOIRES_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Error saving repertoire:', error);
      throw error;
    }
  }

  /**
   * Load all saved repertoires
   */
  static async loadAllRepertoires(): Promise<Repertoire[]> {
    try {
      const data = await AsyncStorage.getItem(REPERTOIRES_KEY);
      if (!data) {
        return [];
      }
      const parsed = JSON.parse(data) as any[];
      return parsed.map((rep) => ({
        ...rep,
        createdAt: new Date(rep.createdAt),
        updatedAt: new Date(rep.updatedAt),
      }));
    } catch (error) {
      console.error('Error loading repertoires:', error);
      return [];
    }
  }

  /**
   * Get a single repertoire by ID
   */
  static async getRepertoire(id: string): Promise<Repertoire | null> {
    try {
      const repertoires = await this.loadAllRepertoires();
      return repertoires.find((rep) => rep.id === id) || null;
    } catch (error) {
      console.error('Error getting repertoire:', error);
      return null;
    }
  }

  /**
   * Delete a repertoire by ID
   */
  static async deleteRepertoire(id: string): Promise<void> {
    try {
      const existing = await this.loadAllRepertoires();
      const filtered = existing.filter((rep) => rep.id !== id);
      await AsyncStorage.setItem(REPERTOIRES_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('Error deleting repertoire:', error);
      throw error;
    }
  }

  /**
   * Clear all repertoires
   */
  static async clearAll(): Promise<void> {
    try {
      await AsyncStorage.removeItem(REPERTOIRES_KEY);
    } catch (error) {
      console.error('Error clearing all repertoires:', error);
      throw error;
    }
  }
}
