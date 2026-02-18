/**
 * MigrationService - Migrate existing AsyncStorage data to SQLite
 * Run once during app initialization
 */

import { DatabaseService } from './DatabaseService';
import { StorageService } from '@services/storage/StorageService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MIGRATION_KEY = '@kingside/migration-complete';

export const MigrationService = {
  /**
   * Check if migration is needed and perform it
   */
  async migrateIfNeeded(): Promise<void> {
    try {
      // Check if migration already completed
      const migrationComplete = await AsyncStorage.getItem(MIGRATION_KEY);
      if (migrationComplete === 'true') {
        console.log('[Migration] Migration already completed');
        return;
      }

      console.log('[Migration] Checking for data to migrate...');

      // Load old data from AsyncStorage
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

      // Migrate to database
      if (userGames.length > 0) {
        await DatabaseService.addUserGames(userGames);
        console.log(`[Migration] Migrated ${userGames.length} user games`);
      }

      if (masterGames.length > 0) {
        await DatabaseService.addMasterGames(masterGames);
        console.log(`[Migration] Migrated ${masterGames.length} master games`);
      }

      // Clean up old AsyncStorage data
      await StorageService.saveUserGames([]);
      await StorageService.saveMasterGames([]);

      // Mark migration as complete
      await AsyncStorage.setItem(MIGRATION_KEY, 'true');
      console.log('[Migration] Migration completed successfully!');
    } catch (error) {
      console.error('[Migration] Migration failed:', error);
      // Don't throw - let app continue even if migration fails
    }
  },

  /**
   * Reset migration flag (for testing)
   */
  async resetMigrationFlag(): Promise<void> {
    await AsyncStorage.removeItem(MIGRATION_KEY);
    console.log('[Migration] Migration flag reset');
  },
};
