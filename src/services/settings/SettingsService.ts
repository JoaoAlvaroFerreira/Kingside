/**
 * SettingsService - Global settings persistence for game review
 */

import { ReviewSettings } from '@types';
import { StorageService } from '@services/storage/StorageService';

const SETTINGS_KEY = '@kingside/review-settings';

export const SettingsService = {
  /**
   * Get default settings
   */
  getDefaults(): ReviewSettings {
    return {
      engine: {
        moveTime: 1000,
        depth: 10,
        threads: 1,
        multiPV: 3,
      },
      showEvalBar: true,
      showBestMove: false,
      autoAdvanceDelay: 0,
      training: {
        correctDelayMs: 150,
        incorrectDelayMs: 500,
        lineCompleteDelayMs: 150,
        opponentAnimation: false,
      },
      books: {
        playerMovesOnly: false,
      },
    };
  },

  /**
   * Load settings from storage, falling back to defaults if not found
   */
  async loadSettings(): Promise<ReviewSettings> {
    try {
      const stored = await StorageService.load<ReviewSettings>(SETTINGS_KEY);
      if (stored) {
        return {
          ...this.getDefaults(),
          ...stored,
          engine: { ...this.getDefaults().engine, ...stored.engine },
          training: { ...this.getDefaults().training, ...stored.training },
          books: { ...this.getDefaults().books, ...stored.books },
        };
      }
    } catch (error) {
      console.warn('Failed to load review settings:', error);
    }
    return this.getDefaults();
  },

  /**
   * Save settings to storage
   */
  async saveSettings(settings: ReviewSettings): Promise<void> {
    try {
      await StorageService.save(SETTINGS_KEY, settings);
    } catch (error) {
      console.error('Failed to save review settings:', error);
      throw error;
    }
  },

  /**
   * Update partial settings
   */
  async updateSettings(updates: Partial<ReviewSettings>): Promise<ReviewSettings> {
    const current = await this.loadSettings();
    const updated: ReviewSettings = {
      ...current,
      ...updates,
      engine: updates.engine ? { ...current.engine, ...updates.engine } : current.engine,
      training: updates.training ? { ...current.training, ...updates.training } : current.training,
    };
    await this.saveSettings(updated);
    return updated;
  },

  /**
   * Reset settings to defaults
   */
  async resetSettings(): Promise<ReviewSettings> {
    const defaults = this.getDefaults();
    await this.saveSettings(defaults);
    return defaults;
  },
};
