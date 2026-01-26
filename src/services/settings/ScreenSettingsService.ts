/**
 * ScreenSettingsService - Per-screen UI preferences
 */

import { AllScreenSettings, ScreenSettings, ScreenKey } from '@types';
import { StorageService } from '@services/storage/StorageService';

const SETTINGS_KEY = '@kingside/screen-settings';

export const ScreenSettingsService = {
  /**
   * Get default settings for all screens
   */
  getDefaults(): AllScreenSettings {
    return {
      analysis: {
        orientation: 'white',
        engineEnabled: false,
        evalBarVisible: false,
        coordinatesVisible: true,
        moveHistoryVisible: true,
      },
      repertoire: {
        orientation: 'white', // Will be overridden by repertoire.color
        engineEnabled: false,
        evalBarVisible: false,
        coordinatesVisible: true,
        moveHistoryVisible: true,
      },
      gameReview: {
        orientation: 'white', // Will be overridden by session.userColor
        engineEnabled: true,
        evalBarVisible: true,
        coordinatesVisible: true,
        moveHistoryVisible: false,
      },
      training: {
        orientation: 'white', // Will be overridden by card.color
        engineEnabled: false,
        evalBarVisible: false,
        coordinatesVisible: true,
        moveHistoryVisible: false,
      },
    };
  },

  /**
   * Load settings from storage, falling back to defaults if not found
   */
  async loadSettings(): Promise<AllScreenSettings> {
    try {
      const stored = await StorageService.load<AllScreenSettings>(SETTINGS_KEY);
      if (stored) {
        // Merge with defaults to handle new fields
        const defaults = this.getDefaults();
        return {
          analysis: { ...defaults.analysis, ...stored.analysis },
          repertoire: { ...defaults.repertoire, ...stored.repertoire },
          gameReview: { ...defaults.gameReview, ...stored.gameReview },
          training: { ...defaults.training, ...stored.training },
        };
      }
    } catch (error) {
      console.warn('Failed to load screen settings:', error);
    }
    return this.getDefaults();
  },

  /**
   * Save all settings to storage
   */
  async saveSettings(settings: AllScreenSettings): Promise<void> {
    try {
      await StorageService.save(SETTINGS_KEY, settings);
    } catch (error) {
      console.error('Failed to save screen settings:', error);
      throw error;
    }
  },

  /**
   * Update settings for a specific screen
   */
  async updateScreenSettings(
    screenKey: ScreenKey,
    updates: Partial<ScreenSettings>
  ): Promise<AllScreenSettings> {
    const current = await this.loadSettings();
    const updated: AllScreenSettings = {
      ...current,
      [screenKey]: {
        ...current[screenKey],
        ...updates,
      },
    };
    await this.saveSettings(updated);
    return updated;
  },

  /**
   * Reset all settings to defaults
   */
  async resetSettings(): Promise<AllScreenSettings> {
    const defaults = this.getDefaults();
    await this.saveSettings(defaults);
    return defaults;
  },

  /**
   * Reset settings for a specific screen
   */
  async resetScreenSettings(screenKey: ScreenKey): Promise<AllScreenSettings> {
    const current = await this.loadSettings();
    const defaults = this.getDefaults();
    const updated: AllScreenSettings = {
      ...current,
      [screenKey]: defaults[screenKey],
    };
    await this.saveSettings(updated);
    return updated;
  },
};
