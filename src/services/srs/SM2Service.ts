/**
 * SM2 Spaced Repetition Algorithm
 * Used for scheduling review cards based on user performance
 */

import { ReviewCard } from '@types';

export interface SM2Result {
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewDate: Date;
}

export const SM2Service = {
  /**
   * Calculate next review schedule based on quality rating (0-5)
   * Quality scale:
   * 0-2: Failed - reset interval
   * 3: Hard - short interval
   * 4: Good - normal interval
   * 5: Easy - longer interval
   */
  calculateNext(card: ReviewCard, quality: number): SM2Result {
    let { easeFactor, interval, repetitions } = card;

    if (quality < 3) {
      // Failed - reset progress
      repetitions = 0;
      interval = 1;
    } else {
      // Passed - calculate next interval
      if (repetitions === 0) {
        interval = 1;
      } else if (repetitions === 1) {
        interval = 6;
      } else {
        interval = Math.round(interval * easeFactor);
      }
      repetitions += 1;
    }

    // Update ease factor (min 1.3)
    easeFactor = Math.max(
      1.3,
      easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    );

    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + interval);

    return { easeFactor, interval, repetitions, nextReviewDate };
  },

  /**
   * Create a new review card with default SM2 values
   */
  createCard(
    color: 'white' | 'black',
    openingId: string,
    subVariationId: string,
    chapterId: string,
    fen: string,
    correctMove: string,
    contextMoves: string[],
    isUserMove: boolean,
    isCritical: boolean = false
  ): ReviewCard {
    return {
      id: this.generateId(),
      color,
      openingId,
      subVariationId,
      chapterId,
      fen,
      correctMove,
      contextMoves,
      isUserMove,
      isCritical,
      easeFactor: 2.5,
      interval: 0,
      repetitions: 0,
      nextReviewDate: new Date(),
      totalReviews: 0,
      correctCount: 0,
    };
  },

  generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  },
};
