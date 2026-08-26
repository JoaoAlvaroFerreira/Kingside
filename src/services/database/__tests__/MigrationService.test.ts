jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../DatabaseService', () => ({
  DatabaseService: {
    getSetting: jest.fn().mockResolvedValue(null),
    saveSetting: jest.fn().mockResolvedValue(undefined),
    addRepertoire: jest.fn().mockResolvedValue(undefined),
    addUserGames: jest.fn().mockResolvedValue(undefined),
    addMasterGames: jest.fn().mockResolvedValue(undefined),
    replaceAllLineStats: jest.fn().mockResolvedValue(undefined),
    replaceAllGameReviewStatuses: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@services/storage/StorageService', () => ({
  StorageService: {
    loadRepertoires: jest.fn().mockResolvedValue([]),
    loadUserGames: jest.fn().mockResolvedValue([]),
    loadMasterGames: jest.fn().mockResolvedValue([]),
    saveUserGames: jest.fn().mockResolvedValue(undefined),
    saveMasterGames: jest.fn().mockResolvedValue(undefined),
    loadLineStats: jest.fn().mockResolvedValue([]),
    loadGameReviewStatuses: jest.fn().mockResolvedValue([]),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { MigrationService } from '../MigrationService';
import { DatabaseService } from '../DatabaseService';
import { StorageService } from '@services/storage/StorageService';
import { LineStats, GameReviewStatus } from '@types';

const TRAINING_KEY = 'migration_training_v1';
const REPERTOIRES_KEY = 'migration_asyncstorage_v1';

function makeStats(): LineStats {
  return {
    lineId: 'line-1',
    repertoireId: 'rep-1',
    chapterId: 'ch-1',
    easeFactor: 2.5,
    interval: 6,
    repetitions: 2,
    nextReviewDate: new Date('2026-09-01T00:00:00.000Z'),
    totalDrills: 4,
    correctCount: 3,
    mistakeCount: 1,
  };
}

function makeStatus(): GameReviewStatus {
  return { gameId: 'game-1', reviewed: true, keyMovesCount: 2, followedRepertoire: false };
}

beforeEach(() => {
  jest.clearAllMocks();
  (DatabaseService.getSetting as jest.Mock).mockResolvedValue(null);
  (StorageService.loadLineStats as jest.Mock).mockResolvedValue([]);
  (StorageService.loadGameReviewStatuses as jest.Mock).mockResolvedValue([]);
});

describe('MigrationService.migrateTrainingData', () => {
  it('moves line stats and review statuses into SQLite', async () => {
    const stats = [makeStats()];
    const statuses = [makeStatus()];
    (StorageService.loadLineStats as jest.Mock).mockResolvedValue(stats);
    (StorageService.loadGameReviewStatuses as jest.Mock).mockResolvedValue(statuses);

    await MigrationService.migrateTrainingData();

    expect(DatabaseService.replaceAllLineStats).toHaveBeenCalledWith(stats);
    expect(DatabaseService.replaceAllGameReviewStatuses).toHaveBeenCalledWith(statuses);
    expect(DatabaseService.saveSetting).toHaveBeenCalledWith(TRAINING_KEY, true);
  });

  it('skips once its own flag is set', async () => {
    (DatabaseService.getSetting as jest.Mock).mockImplementation(async (key: string) =>
      key === TRAINING_KEY ? true : null
    );

    await MigrationService.migrateTrainingData();

    expect(StorageService.loadLineStats).not.toHaveBeenCalled();
    expect(DatabaseService.replaceAllLineStats).not.toHaveBeenCalled();
  });

  it('leaves the AsyncStorage copy in place — this is the only copy of the history', async () => {
    (StorageService.loadLineStats as jest.Mock).mockResolvedValue([makeStats()]);

    await MigrationService.migrateTrainingData();

    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  });

  it('still runs when the older migration flags are already set', async () => {
    // The trap this key exists to avoid: every existing install already has the games and
    // repertoire flags set, so reusing either would skip training data forever.
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('true');
    (DatabaseService.getSetting as jest.Mock).mockImplementation(async (key: string) =>
      key === REPERTOIRES_KEY ? true : null
    );
    (StorageService.loadLineStats as jest.Mock).mockResolvedValue([makeStats()]);

    await MigrationService.migrateIfNeeded();

    expect(DatabaseService.replaceAllLineStats).toHaveBeenCalled();
    expect(DatabaseService.saveSetting).toHaveBeenCalledWith(TRAINING_KEY, true);
  });
});
