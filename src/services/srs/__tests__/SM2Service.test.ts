import { SM2Service } from '../SM2Service';
import { ReviewCard } from '@types';

function makeCard(overrides: Partial<ReviewCard> = {}): ReviewCard {
  return {
    id: 'test-card',
    color: 'white',
    openingId: 'op1',
    subVariationId: 'sv1',
    chapterId: 'ch1',
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    correctMove: 'e5',
    contextMoves: ['e4'],
    isUserMove: true,
    isCritical: false,
    easeFactor: 2.5,
    interval: 0,
    repetitions: 0,
    nextReviewDate: new Date(),
    totalReviews: 0,
    correctCount: 0,
    ...overrides,
  };
}

describe('SM2Service', () => {
  describe('calculateNext', () => {
    it('quality 5 (perfect): increases interval and ease factor', () => {
      const card = makeCard({ repetitions: 2, interval: 6, easeFactor: 2.5 });
      const result = SM2Service.calculateNext(card, 5);
      expect(result.interval).toBe(Math.round(6 * 2.5));
      expect(result.easeFactor).toBeGreaterThan(2.5);
      expect(result.repetitions).toBe(3);
    });

    it('quality 4 (good): increases interval', () => {
      const card = makeCard({ repetitions: 2, interval: 6, easeFactor: 2.5 });
      const result = SM2Service.calculateNext(card, 4);
      expect(result.interval).toBe(Math.round(6 * 2.5));
      expect(result.repetitions).toBe(3);
    });

    it('quality 3 (hard): smallest passing interval', () => {
      const card = makeCard({ repetitions: 2, interval: 10, easeFactor: 2.5 });
      const result = SM2Service.calculateNext(card, 3);
      expect(result.interval).toBe(Math.round(10 * 2.5));
      expect(result.repetitions).toBe(3);
    });

    it('quality 2 (incorrect): resets repetitions and interval', () => {
      const card = makeCard({ repetitions: 5, interval: 30, easeFactor: 2.5 });
      const result = SM2Service.calculateNext(card, 2);
      expect(result.repetitions).toBe(0);
      expect(result.interval).toBe(1);
    });

    it('quality 1 (incorrect): resets and decreases ease factor', () => {
      const card = makeCard({ repetitions: 3, interval: 15, easeFactor: 2.5 });
      const result = SM2Service.calculateNext(card, 1);
      expect(result.repetitions).toBe(0);
      expect(result.interval).toBe(1);
      expect(result.easeFactor).toBeLessThan(2.5);
    });

    it('quality 0 (blackout): resets to minimum', () => {
      const card = makeCard({ repetitions: 5, interval: 30, easeFactor: 2.5 });
      const result = SM2Service.calculateNext(card, 0);
      expect(result.repetitions).toBe(0);
      expect(result.interval).toBe(1);
      expect(result.easeFactor).toBeLessThan(2.5);
    });

    it('ease factor never drops below 1.3', () => {
      // Apply worst quality repeatedly
      let card = makeCard();
      for (let i = 0; i < 10; i++) {
        const result = SM2Service.calculateNext(card, 0);
        card = { ...card, ...result };
      }
      expect(card.easeFactor).toBeGreaterThanOrEqual(1.3);
    });

    it('ease factor can increase above 2.5 with perfect ratings', () => {
      let card = makeCard({ repetitions: 2, interval: 6, easeFactor: 2.5 });
      for (let i = 0; i < 5; i++) {
        const result = SM2Service.calculateNext(card, 5);
        card = { ...card, ...result };
      }
      expect(card.easeFactor).toBeGreaterThan(2.5);
    });

    describe('interval progression', () => {
      it('first successful review: interval = 1', () => {
        const card = makeCard({ repetitions: 0, interval: 0, easeFactor: 2.5 });
        const result = SM2Service.calculateNext(card, 4);
        expect(result.interval).toBe(1);
        expect(result.repetitions).toBe(1);
      });

      it('second successful review: interval = 6', () => {
        const card = makeCard({ repetitions: 1, interval: 1, easeFactor: 2.5 });
        const result = SM2Service.calculateNext(card, 4);
        expect(result.interval).toBe(6);
        expect(result.repetitions).toBe(2);
      });

      it('third review: interval = previous * easeFactor', () => {
        const card = makeCard({ repetitions: 2, interval: 6, easeFactor: 2.5 });
        const result = SM2Service.calculateNext(card, 4);
        expect(result.interval).toBe(Math.round(6 * 2.5));
      });
    });

    it('nextReviewDate is in the future', () => {
      const before = new Date();
      const card = makeCard({ repetitions: 0 });
      const result = SM2Service.calculateNext(card, 4);
      expect(result.nextReviewDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('createCard', () => {
    it('creates card with default SM2 values', () => {
      const card = SM2Service.createCard('white', 'op1', 'sv1', 'ch1', 'fen', 'e4', [], true);
      expect(card.easeFactor).toBe(2.5);
      expect(card.interval).toBe(0);
      expect(card.repetitions).toBe(0);
      expect(card.totalReviews).toBe(0);
      expect(card.correctCount).toBe(0);
    });

    it('generates unique IDs', () => {
      const c1 = SM2Service.createCard('white', 'op1', 'sv1', 'ch1', 'fen', 'e4', [], true);
      const c2 = SM2Service.createCard('white', 'op1', 'sv1', 'ch1', 'fen', 'e4', [], true);
      expect(c1.id).not.toBe(c2.id);
    });
  });
});
