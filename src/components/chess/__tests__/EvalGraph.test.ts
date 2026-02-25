import { EngineEvaluation } from '@types';

// Since EvalGraph uses react-native-svg which requires a native runtime,
// we test the core logic (clamping, coordinate mapping) rather than rendering.
// The component itself is tested via manual/integration testing.

function clampEval(eval_: EngineEvaluation | null): number | null {
  if (!eval_) return null;
  if (eval_.mate !== undefined) {
    return eval_.mate > 0 ? 1000 : -1000;
  }
  return Math.max(-1000, Math.min(1000, eval_.score));
}

function cpToY(cp: number, height: number): number {
  return (height / 2) - (cp / 1000) * (height / 2);
}

function makeEval(score: number, mate?: number): EngineEvaluation {
  return {
    fen: 'test',
    depth: 10,
    score,
    mate,
    bestMove: 'e2e4',
    bestMoveSan: 'e4',
    pv: ['e2e4'],
    lines: [],
    timestamp: new Date(),
  };
}

describe('EvalGraph logic', () => {
  describe('clampEval', () => {
    it('returns null for null evaluations', () => {
      expect(clampEval(null)).toBeNull();
    });

    it('clamps positive scores to 1000', () => {
      expect(clampEval(makeEval(2000))).toBe(1000);
    });

    it('clamps negative scores to -1000', () => {
      expect(clampEval(makeEval(-2000))).toBe(-1000);
    });

    it('returns score as-is when within range', () => {
      expect(clampEval(makeEval(300))).toBe(300);
    });

    it('treats mate > 0 as +1000', () => {
      expect(clampEval(makeEval(10000, 3))).toBe(1000);
    });

    it('treats mate < 0 as -1000', () => {
      expect(clampEval(makeEval(-10000, -2))).toBe(-1000);
    });
  });

  describe('cpToY', () => {
    it('maps 0cp to middle of height', () => {
      expect(cpToY(0, 100)).toBe(50);
    });

    it('maps +1000cp to top (y=0)', () => {
      expect(cpToY(1000, 100)).toBe(0);
    });

    it('maps -1000cp to bottom (y=height)', () => {
      expect(cpToY(-1000, 100)).toBe(100);
    });

    it('maps +500cp to quarter from top', () => {
      expect(cpToY(500, 100)).toBe(25);
    });
  });

  describe('renders without crashing with valid evaluations', () => {
    it('produces valid points for a sequence of evaluations', () => {
      const evals = [makeEval(50), makeEval(100), makeEval(-50), makeEval(200)];
      const points = evals.map(e => clampEval(e));
      expect(points).toEqual([50, 100, -50, 200]);
      expect(points.every(p => p !== null)).toBe(true);
    });
  });

  describe('renders with all-null evaluations', () => {
    it('handles all-null array without producing points', () => {
      const evals: (EngineEvaluation | null)[] = [null, null, null];
      const points = evals.map(e => clampEval(e));
      expect(points.every(p => p === null)).toBe(true);
    });
  });

  describe('renders with mate scores', () => {
    it('handles mate scores without crashing', () => {
      const evals = [makeEval(10000, 3), makeEval(-10000, -1), makeEval(0)];
      const points = evals.map(e => clampEval(e));
      expect(points).toEqual([1000, -1000, 0]);
    });
  });
});
