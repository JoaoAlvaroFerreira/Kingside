/**
 * MigrationService - Migrate existing AsyncStorage data to SQLite
 * Run once during app initialization
 */

import { DatabaseService } from './DatabaseService';
import { StorageService } from '@services/storage/StorageService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MIGRATION_KEY = '@kingside/migration-complete';
const MIGRATION_REPERTOIRES_KEY = 'migration_asyncstorage_v1';
const REVIEW_SETTINGS_KEY = '@kingside/review-settings';

export const MigrationService = {
  async migrateIfNeeded(): Promise<void> {
    try {
      // Check if migration already completed
      const migrationComplete = await AsyncStorage.getItem(MIGRATION_KEY);
      if (migrationComplete === 'true') {
        console.log('[Migration] Migration already completed');
      } else {
        await this.migrateGames();
      }

      // Migrate repertoires and settings to SQLite
      await this.migrateRepertoiresAndSettings();
    } catch (error) {
      console.error('[Migration] Migration failed:', error);
    }
  },

  async migrateGames(): Promise<void> {
    console.log('[Migration] Checking for games to migrate...');

    const [userGames, masterGames] = await Promise.all([
      StorageService.loadUserGames(),
      StorageService.loadMasterGames(),
    ]);

    const totalGames = userGames.length + masterGames.length;

    if (totalGames === 0) {
      console.log('[Migration] No games to migrate');
      await AsyncStorage.setItem(MIGRATION_KEY, 'true');
      return;
    }

    console.log(`[Migration] Migrating ${userGames.length} user games and ${masterGames.length} master games...`);

    if (userGames.length > 0) {
      await DatabaseService.addUserGames(userGames);
      console.log(`[Migration] Migrated ${userGames.length} user games`);
    }

    if (masterGames.length > 0) {
      await DatabaseService.addMasterGames(masterGames);
      console.log(`[Migration] Migrated ${masterGames.length} master games`);
    }

    await StorageService.saveUserGames([]);
    await StorageService.saveMasterGames([]);

    await AsyncStorage.setItem(MIGRATION_KEY, 'true');
    console.log('[Migration] Games migration completed successfully!');
  },

  async migrateRepertoiresAndSettings(): Promise<void> {
    const alreadyRun = await DatabaseService.getSetting<boolean>(MIGRATION_REPERTOIRES_KEY);
    if (alreadyRun) {
      console.log('[Migration] Repertoire/settings migration already completed');
      return;
    }

    console.log('[Migration] Checking for repertoires and settings to migrate...');

    // Migrate repertoires
    const repertoires = await StorageService.loadRepertoires();
    if (repertoires.length > 0) {
      for (const repertoire of repertoires) {
        await DatabaseService.addRepertoire(repertoire);
      }
      console.log(`[Migration] Migrated ${repertoires.length} repertoires`);
    }

    // Migrate review settings
    const settingsData = await AsyncStorage.getItem(REVIEW_SETTINGS_KEY);
    if (settingsData) {
      const dateReviver = (_key: string, value: any): any => {
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
          return new Date(value);
        }
        return value;
      };
      const settings = JSON.parse(settingsData, dateReviver);
      await DatabaseService.saveSetting('reviewSettings', settings);
      console.log('[Migration] Migrated review settings');
    }

    await DatabaseService.saveSetting(MIGRATION_REPERTOIRES_KEY, true);
    console.log('[Migration] Repertoire/settings migration completed successfully!');
  },

  async resetMigrationFlag(): Promise<void> {
    await AsyncStorage.removeItem(MIGRATION_KEY);
    console.log('[Migration] Migration flag reset');
  },
};
