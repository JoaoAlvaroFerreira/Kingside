/**
 * SM2 Spaced Repetition Algorithm
 * Schedules training lines based on user performance
 */

export interface SM2Result {
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewDate: Date;
}

/** The scheduling state SM2 reads — satisfied by LineStats. */
export interface SM2Progress {
  easeFactor: number;
  interval: number;
  repetitions: number;
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
  calculateNext(progress: SM2Progress, quality: number): SM2Result {
    let { easeFactor, interval, repetitions } = progress;

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
};
