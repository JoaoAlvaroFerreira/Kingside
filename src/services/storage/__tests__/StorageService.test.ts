import { StorageService } from '../StorageService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReviewCard } from '@types';

const mockAsync = AsyncStorage as any;

beforeEach(() => {
  mockAsync._reset();
  jest.clearAllMocks();
});

function makeCard(): ReviewCard {
  return {
    id: 'c1',
    color: 'white',
    openingId: 'op1',
    subVariationId: 'sv1',
    chapterId: 'ch1',
    fen: 'start',
    correctMove: 'e4',
    contextMoves: [],
    isUserMove: true,
    isCritical: false,
    easeFactor: 2.5,
    interval: 1,
    repetitions: 1,
    nextReviewDate: new Date('2025-06-01T00:00:00.000Z'),
    lastReviewDate: new Date('2025-05-25T00:00:00.000Z'),
    totalReviews: 1,
    correctCount: 1,
  };
}

describe('StorageService', () => {
  describe('save/load round-trip', () => {
    it('saves and loads review cards', async () => {
      const cards = [makeCard()];
      await StorageService.saveCards(cards);
      const loaded = await StorageService.loadCards();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe('c1');
    });

    it('returns empty array for missing key', async () => {
      const cards = await StorageService.loadCards();
      expect(cards).toEqual([]);
    });

    it('handles empty array', async () => {
      await StorageService.saveCards([]);
      const loaded = await StorageService.loadCards();
      expect(loaded).toEqual([]);
    });
  });

  describe('date serialization', () => {
    it('Date objects survive JSON round-trip via dateReviver', async () => {
      const card = makeCard();
      await StorageService.saveCards([card]);
      const loaded = await StorageService.loadCards();
      expect(loaded[0].nextReviewDate).toBeInstanceOf(Date);
      expect(loaded[0].nextReviewDate.toISOString()).toBe(card.nextReviewDate.toISOString());
    });

    it('lastReviewDate is restored as Date', async () => {
      const card = makeCard();
      await StorageService.saveCards([card]);
      const loaded = await StorageService.loadCards();
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
      await StorageService.saveCards([makeCard()]);
      await StorageService.clearAll();
      const cards = await StorageService.loadCards();
      expect(cards).toEqual([]);
    });
  });
});
