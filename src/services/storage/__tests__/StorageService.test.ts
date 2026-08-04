import { StorageService } from '../StorageService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LineStats } from '@types';

const mockAsync = AsyncStorage as any;

beforeEach(() => {
  mockAsync._reset();
  jest.clearAllMocks();
});

function makeStats(): LineStats {
  return {
    lineId: 'l1',
    repertoireId: 'r1',
    chapterId: 'ch1',
    easeFactor: 2.5,
    interval: 1,
    repetitions: 1,
    nextReviewDate: new Date('2025-06-01T00:00:00.000Z'),
    lastReviewDate: new Date('2025-05-25T00:00:00.000Z'),
    totalDrills: 1,
    correctCount: 1,
    mistakeCount: 0,
  };
}

describe('StorageService', () => {
  describe('save/load round-trip', () => {
    it('saves and loads line stats', async () => {
      const stats = [makeStats()];
      await StorageService.saveLineStats(stats);
      const loaded = await StorageService.loadLineStats();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].lineId).toBe('l1');
    });

    it('returns empty array for missing key', async () => {
      const stats = await StorageService.loadLineStats();
      expect(stats).toEqual([]);
    });

    it('handles empty array', async () => {
      await StorageService.saveLineStats([]);
      const loaded = await StorageService.loadLineStats();
      expect(loaded).toEqual([]);
    });
  });

  describe('date serialization', () => {
    it('Date objects survive JSON round-trip via dateReviver', async () => {
      const stat = makeStats();
      await StorageService.saveLineStats([stat]);
      const loaded = await StorageService.loadLineStats();
      expect(loaded[0].nextReviewDate).toBeInstanceOf(Date);
      expect(loaded[0].nextReviewDate.toISOString()).toBe(stat.nextReviewDate.toISOString());
    });

    it('lastReviewDate is restored as Date', async () => {
      const stat = makeStats();
      await StorageService.saveLineStats([stat]);
      const loaded = await StorageService.loadLineStats();
      expect(loaded[0].lastReviewDate).toBeInstanceOf(Date);
    });

    it('non-date strings are not converted', async () => {
      await StorageService.saveSettings({ theme: 'dark', version: '1.0' });
      const loaded = await StorageService.loadSettings();
      expect(typeof loaded.theme).toBe('string');
    });
  });

  describe('generic save/load', () => {
    it('saves and loads arbitrary JSON via generic methods', async () => {
      await StorageService.save('test-key', { x: 1, y: [2, 3] });
      const loaded = await StorageService.load<{ x: number; y: number[] }>('test-key');
      expect(loaded).toEqual({ x: 1, y: [2, 3] });
    });

    it('load returns null for missing key', async () => {
      const result = await StorageService.load('missing-key');
      expect(result).toBeNull();
    });
  });

  describe('clearAll', () => {
    it('removes all stored data', async () => {
      await StorageService.saveLineStats([makeStats()]);
      await StorageService.clearAll();
      const stats = await StorageService.loadLineStats();
      expect(stats).toEqual([]);
    });
  });
});
