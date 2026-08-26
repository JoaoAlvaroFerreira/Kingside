import { TrainingService } from '../TrainingService';
import { Line, LineStats } from '@types';

function makeLine(id: string): Line {
  return {
    id,
    repertoireId: 'rep1',
    chapterId: 'ch1',
    moves: [],
    depth: 2,
    isMainLine: true,
    branchPoint: null,
  } as Line;
}

function makeStats(lineId: string, over: Partial<LineStats> = {}): LineStats {
  return {
    lineId,
    repertoireId: 'rep1',
    chapterId: 'ch1',
    easeFactor: 2.5,
    interval: 1,
    repetitions: 1,
    nextReviewDate: new Date('2026-08-01T00:00:00.000Z'),
    totalDrills: 10,
    correctCount: 10,
    mistakeCount: 0,
    ...over,
  };
}

describe('recommendationScore', () => {
  it('ranks a line you keep failing above one you never miss', () => {
    const failing = TrainingService.recommendationScore(makeStats('a', { mistakeCount: 8 }));
    const solid = TrainingService.recommendationScore(makeStats('b', { mistakeCount: 0 }));
    expect(failing).toBeGreaterThan(solid);
  });

  it('puts never-drilled lines above solid ones but below actively failing ones', () => {
    const unseen = TrainingService.recommendationScore(undefined);
    const solid = TrainingService.recommendationScore(makeStats('b', { mistakeCount: 1 }));
    const failing = TrainingService.recommendationScore(makeStats('c', { mistakeCount: 9 }));

    expect(unseen).toBeGreaterThan(solid);
    expect(unseen).toBeLessThan(failing);
  });

  it('treats a stats row with no drills as unseen rather than dividing by zero', () => {
    const score = TrainingService.recommendationScore(
      makeStats('a', { totalDrills: 0, correctCount: 0, mistakeCount: 0 })
    );
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBe(TrainingService.recommendationScore(undefined));
  });
});

describe('sortByRecommendation', () => {
  it('orders weakest first, then unseen, then solid', () => {
    const lines = [makeLine('solid'), makeLine('unseen'), makeLine('weak')];
    const stats = [
      makeStats('solid', { mistakeCount: 0 }),
      makeStats('weak', { mistakeCount: 9 }),
      // 'unseen' deliberately has no stats row
    ];

    const sorted = TrainingService.sortByRecommendation(lines, stats);
    expect(sorted.map(l => l.id)).toEqual(['weak', 'unseen', 'solid']);
  });

  it('breaks ties on how overdue the line is', () => {
    const lines = [makeLine('recent'), makeLine('ancient')];
    const stats = [
      makeStats('recent', { mistakeCount: 5, nextReviewDate: new Date('2026-08-20T00:00:00.000Z') }),
      makeStats('ancient', { mistakeCount: 5, nextReviewDate: new Date('2020-01-01T00:00:00.000Z') }),
    ];

    const sorted = TrainingService.sortByRecommendation(lines, stats);
    expect(sorted.map(l => l.id)).toEqual(['ancient', 'recent']);
  });

  it('does not mutate the input', () => {
    const lines = [makeLine('solid'), makeLine('weak')];
    const original = lines.map(l => l.id);
    TrainingService.sortByRecommendation(lines, [makeStats('weak', { mistakeCount: 9 })]);
    expect(lines.map(l => l.id)).toEqual(original);
  });
});

describe('shuffle', () => {
  it('keeps every element exactly once', () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const shuffled = TrainingService.shuffle(items);
    expect(shuffled).toHaveLength(items.length);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
  });

  it('does not mutate the input', () => {
    const items = [1, 2, 3, 4, 5];
    TrainingService.shuffle(items);
    expect(items).toEqual([1, 2, 3, 4, 5]);
  });
});
