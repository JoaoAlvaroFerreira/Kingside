import { TrainingService } from '../TrainingService';
import { Line, LineStats, LineMove, normalizeFen } from '@types';

function makeLine(id: string, moves: LineMove[] = []): Line {
  return {
    id,
    repertoireId: 'rep1',
    chapterId: 'ch1',
    moves,
    depth: moves.length,
    isMainLine: true,
    branchPoint: null,
  } as Line;
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
const AFTER_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';

function makeMove(san: string, preFen: string, isUserMove = true): LineMove {
  return { san, preFen, isUserMove, nodeId: san } as LineMove;
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


describe('trimLineToPosition', () => {
  const line = makeLine('l1', [
    makeMove('e4', START),
    makeMove('e5', AFTER_E4, false),
    makeMove('Nf3', AFTER_E5),
  ]);

  it('drops the moves before the position so the drill starts there', () => {
    const trimmed = TrainingService.trimLineToPosition(line, normalizeFen(AFTER_E5));
    expect(trimmed).not.toBeNull();
    expect(trimmed!.moves.map(m => m.san)).toEqual(['Nf3']);
    expect(trimmed!.depth).toBe(1);
  });

  it('returns the line untouched when the position is its start', () => {
    const trimmed = TrainingService.trimLineToPosition(line, normalizeFen(START));
    expect(trimmed).toBe(line);
  });

  it('returns null when the line never reaches the position', () => {
    const other = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1';
    expect(TrainingService.trimLineToPosition(line, normalizeFen(other))).toBeNull();
  });

  it('keeps the line id, so the scheduler still sees the same line', () => {
    const trimmed = TrainingService.trimLineToPosition(line, normalizeFen(AFTER_E5));
    expect(trimmed!.id).toBe('l1');
  });

  it('does not mutate the original line', () => {
    TrainingService.trimLineToPosition(line, normalizeFen(AFTER_E5));
    expect(line.moves).toHaveLength(3);
  });
});
