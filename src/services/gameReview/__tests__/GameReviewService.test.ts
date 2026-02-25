import { GameReviewService, centipawnsToWinProbability } from '../GameReviewService';
import { EngineEvaluation, RepertoireMatchResult } from '@types';
import { createTestRepertoire } from './testHelpers';

function makeEval(score: number, mate?: number): EngineEvaluation {
  return {
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
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

function matchResult(matched: boolean, isUserMove: boolean, deviationType?: string): RepertoireMatchResult {
  return { matched, isUserMove, deviationType: deviationType as any, expectedMoves: [] };
}

describe('GameReviewService', () => {
  describe('centipawnsToWinProbability', () => {
    it('returns 50 for 0 centipawns (equal position)', () => {
      const result = centipawnsToWinProbability(0);
      expect(result).toBeCloseTo(50, 1);
    });

    it('approaches 100 for large positive values', () => {
      const result = centipawnsToWinProbability(1000);
      expect(result).toBeGreaterThan(95);
      expect(result).toBeLessThanOrEqual(100);
    });

    it('approaches 0 for large negative values', () => {
      const result = centipawnsToWinProbability(-1000);
      expect(result).toBeLessThan(5);
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('is monotonically increasing', () => {
      const values = [-500, -100, 0, 100, 500];
      const probs = values.map(centipawnsToWinProbability);
      for (let i = 1; i < probs.length; i++) {
        expect(probs[i]).toBeGreaterThan(probs[i - 1]);
      }
    });
  });

  describe('calculateEvalDelta', () => {
    it('returns difference in centipawns', () => {
      const before = makeEval(50);
      const after = makeEval(-20);
      expect(GameReviewService.calculateEvalDelta(before, after)).toBe(-70);
    });

    it('handles mate before (white is winning)', () => {
      const before = makeEval(10000, 3);
      const after = makeEval(100);
      expect(GameReviewService.calculateEvalDelta(before, after)).toBe(-10000);
    });

    it('handles mate after (white mates)', () => {
      const before = makeEval(200);
      const after = makeEval(10000, 2);
      expect(GameReviewService.calculateEvalDelta(before, after)).toBe(10000);
    });

    it('handles negative mate (black mates)', () => {
      const before = makeEval(-100);
      const after = makeEval(-10000, -1);
      expect(GameReviewService.calculateEvalDelta(before, after)).toBe(-10000);
    });
  });

  describe('identifyKeyMove (win-probability)', () => {
    const inRepertoire = matchResult(true, true);
    const userDeviation = matchResult(false, true, 'user-misplay');
    const opponentNovelty = matchResult(false, false, 'opponent-novelty');
    const coverageGap = matchResult(false, true, 'coverage-gap');

    it('classifies blunder: +300cp to -100cp (white moves, large win% drop)', () => {
      const evalBefore = makeEval(300);
      const evalAfter = makeEval(-100);
      const { isKeyMove, keyMoveReason } = GameReviewService.identifyKeyMove(
        evalBefore, evalAfter, false, inRepertoire
      );
      expect(isKeyMove).toBe(true);
      expect(keyMoveReason).toBe('blunder');
    });

    it('does NOT classify as blunder when already winning big (+1000cp to +600cp)', () => {
      // Win% at +1000cp is ~97%, at +600cp is ~90% => loss ~7%, not a blunder
      const evalBefore = makeEval(1000);
      const evalAfter = makeEval(600);
      const { isKeyMove, keyMoveReason } = GameReviewService.identifyKeyMove(
        evalBefore, evalAfter, false, inRepertoire
      );
      // Win% drop is small at high evals, should not be blunder
      if (isKeyMove) {
        expect(keyMoveReason).not.toBe('blunder');
      }
    });

    it('does NOT classify blunder/mistake when already losing (win% <= 30)', () => {
      // -800cp: win% for white is ~2%, so from white's perspective, winProbBefore ~2%
      // -1000cp: win% even lower
      const evalBefore = makeEval(-800);
      const evalAfter = makeEval(-1000);
      const { isKeyMove, keyMoveReason } = GameReviewService.identifyKeyMove(
        evalBefore, evalAfter, false, inRepertoire
      );
      // When already losing (winProbBefore <= 30 for white), at most inaccuracy
      if (isKeyMove) {
        expect(keyMoveReason).toBe('inaccuracy');
      }
    });

    it('classifies mate loss as blunder regardless of gate', () => {
      // White had mate in 3, now lost it
      const evalBefore = makeEval(10000, 3);
      const evalAfter = makeEval(200);
      const { isKeyMove, keyMoveReason } = GameReviewService.identifyKeyMove(
        evalBefore, evalAfter, false, inRepertoire
      );
      expect(isKeyMove).toBe(true);
      expect(keyMoveReason).toBe('blunder');
    });

    it('classifies mate loss for black as blunder', () => {
      // Black had mate in 5 (mate = -5 from white's view), now eval is -200
      const evalBefore = makeEval(-10000, -5);
      const evalAfter = makeEval(-200);
      const { isKeyMove, keyMoveReason } = GameReviewService.identifyKeyMove(
        evalBefore, evalAfter, true, inRepertoire
      );
      expect(isKeyMove).toBe(true);
      expect(keyMoveReason).toBe('blunder');
    });

    it('classifies mistake for moderate win% loss', () => {
      // +400cp to +50cp: win% ~81% to ~55%, loss ~26% => mistake
      const evalBefore = makeEval(400);
      const evalAfter = makeEval(50);
      const { isKeyMove, keyMoveReason } = GameReviewService.identifyKeyMove(
        evalBefore, evalAfter, false, inRepertoire
      );
      expect(isKeyMove).toBe(true);
      expect(keyMoveReason).toBe('mistake');
    });

    it('classifies inaccuracy for small win% loss', () => {
      // +200cp to +50cp: win% ~73% to ~55%, loss ~18% => would be mistake
      // +150cp to -20cp: win% ~63% to ~46%, loss ~17% => mistake
      // +100cp to 0cp: win% ~59% to 50%, loss ~9% => just under 10
      // Use +120cp to -10cp: win% ~62% to ~48%, loss ~14% => inaccuracy
      const evalBefore = makeEval(120);
      const evalAfter = makeEval(-10);
      const { isKeyMove, keyMoveReason } = GameReviewService.identifyKeyMove(
        evalBefore, evalAfter, false, inRepertoire
      );
      expect(isKeyMove).toBe(true);
      expect(keyMoveReason).toBe('inaccuracy');
    });

    it('does not classify small eval changes as key move', () => {
      // +50cp to +30cp: win% ~57% to ~55%, loss ~2% => no key move
      const evalBefore = makeEval(50);
      const evalAfter = makeEval(30);
      const { isKeyMove } = GameReviewService.identifyKeyMove(
        evalBefore, evalAfter, false, inRepertoire
      );
      expect(isKeyMove).toBe(false);
    });

    it('marks first repertoire deviation as key move', () => {
      const { isKeyMove, keyMoveReason } = GameReviewService.identifyKeyMove(
        undefined, undefined, false, userDeviation, false, true, false
      );
      expect(isKeyMove).toBe(true);
      expect(keyMoveReason).toBe('repertoire-deviation');
    });

    it('does not mark second deviation (hasAlreadyDeviated=true)', () => {
      const { isKeyMove } = GameReviewService.identifyKeyMove(
        undefined, undefined, false, userDeviation, true, false, false
      );
      expect(isKeyMove).toBe(false);
    });

    it('marks opponent novelty as key move on first occurrence', () => {
      const { isKeyMove, keyMoveReason } = GameReviewService.identifyKeyMove(
        undefined, undefined, true, opponentNovelty, false, true, false
      );
      expect(isKeyMove).toBe(true);
      expect(keyMoveReason).toBe('opponent-novelty');
    });

    it('marks transposition back into repertoire', () => {
      const { isKeyMove, keyMoveReason } = GameReviewService.identifyKeyMove(
        undefined, undefined, false, inRepertoire, true, false, true
      );
      expect(isKeyMove).toBe(true);
      expect(keyMoveReason).toBe('transposition');
    });

    it('no key move when coverage gap (no engine, already deviated)', () => {
      const { isKeyMove } = GameReviewService.identifyKeyMove(
        undefined, undefined, false, coverageGap, true, false, false
      );
      expect(isKeyMove).toBe(false);
    });
  });

  describe('checkRepertoireMatchFEN', () => {
    it('matches when resulting position is in repertoire', () => {
      const rep = createTestRepertoire('Italian', 'white', [['e4', 'e5', 'Nf3']]);
      const positionMap = GameReviewService.buildRepertoirePositionMap([rep], 'white');

      const { Chess } = require('chess.js');
      const chess = new Chess();
      const result = GameReviewService.checkRepertoireMatchFEN(
        chess.fen(), 'e4', 0, false, 'white', positionMap
      );
      expect(result.matched).toBe(true);
    });

    it('detects deviation when position not in repertoire', () => {
      const rep = createTestRepertoire('Italian', 'white', [['e4', 'e5', 'Nf3']]);
      const positionMap = GameReviewService.buildRepertoirePositionMap([rep], 'white');

      const { Chess } = require('chess.js');
      const chess = new Chess();
      chess.move('e4');
      const result = GameReviewService.checkRepertoireMatchFEN(
        chess.fen(), 'e6', 1, true, 'white', positionMap
      );
      expect(result.matched).toBe(false);
      expect(result.deviationType).toBe('opponent-novelty');
    });
  });

  describe('createReviewStatus', () => {
    it('creates status from completed session', () => {
      const session = {
        id: 'rev1',
        gameId: 'game1',
        userColor: 'white' as const,
        moves: [],
        currentMoveIndex: 0,
        keyMoveIndices: [2, 5, 8],
        isComplete: true,
        followedRepertoire: false,
        startedAt: new Date(),
        completedAt: new Date(),
      };
      const status = GameReviewService.createReviewStatus(session);
      expect(status.gameId).toBe('game1');
      expect(status.reviewed).toBe(true);
      expect(status.keyMovesCount).toBe(3);
      expect(status.followedRepertoire).toBe(false);
    });
  });
});
