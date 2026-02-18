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
      thresholds: {
        blunder: 200,
        mistake: 100,
        inaccuracy: 50,
      },
      showEvalBar: true,
      showBestMove: false,
      autoAdvanceDelay: 0,
      lichess: {
        username: '',
        importDaysBack: 1,
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
        // Merge with defaults to handle new fields
        return {
          ...this.getDefaults(),
          ...stored,
          engine: { ...this.getDefaults().engine, ...stored.engine },
          thresholds: { ...this.getDefaults().thresholds, ...stored.thresholds },
          lichess: { ...this.getDefaults().lichess, ...stored.lichess },
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
      thresholds: updates.thresholds ? { ...current.thresholds, ...updates.thresholds } : current.thresholds,
      lichess: updates.lichess ? { ...current.lichess, ...updates.lichess } : current.lichess,
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
