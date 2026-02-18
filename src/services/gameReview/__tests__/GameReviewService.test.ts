import { GameReviewService } from '../GameReviewService';
import { EvalThresholds, EngineEvaluation, RepertoireMatchResult } from '@types';
import { createTestRepertoire } from './testHelpers';

const DEFAULT_THRESHOLDS: EvalThresholds = {
  blunder: 300,
  mistake: 100,
  inaccuracy: 50,
};

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
  describe('calculateEvalDelta', () => {
    it('returns difference in centipawns', () => {
      const before = makeEval(50);
      const after = makeEval(-20);
      expect(GameReviewService.calculateEvalDelta(before, after)).toBe(-70);
    });

    it('handles mate before (white is winning — already mated)', () => {
      const before = makeEval(10000, 3);
      const after = makeEval(100);
      // before has mate > 0 → returns -10000
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

  describe('identifyKeyMove', () => {
    const inRepertoire = matchResult(true, true);
    const userDeviation = matchResult(false, true, 'user-misplay');
    const opponentNovelty = matchResult(false, false, 'opponent-novelty');
    const coverageGap = matchResult(false, true, 'coverage-gap');

    it('classifies blunder when eval drops > blunder threshold', () => {
      const { isKeyMove, keyMoveReason } = GameReviewService.identifyKeyMove(
        -350, inRepertoire, DEFAULT_THRESHOLDS
      );
      expect(isKeyMove).toBe(true);
      expect(keyMoveReason).toBe('blunder');
    });

    it('classifies mistake when eval drops > mistake threshold', () => {
      const { isKeyMove, keyMoveReason } = GameReviewService.identifyKeyMove(
        -150, inRepertoire, DEFAULT_THRESHOLDS
      );
      expect(isKeyMove).toBe(true);
      expect(keyMoveReason).toBe('mistake');
    });

    it('classifies inaccuracy when eval drops > inaccuracy threshold', () => {
      const { isKeyMove, keyMoveReason } = GameReviewService.identifyKeyMove(
        -60, inRepertoire, DEFAULT_THRESHOLDS
      );
      expect(isKeyMove).toBe(true);
      expect(keyMoveReason).toBe('inaccuracy');
    });

    it('does not classify small eval changes', () => {
      const { isKeyMove } = GameReviewService.identifyKeyMove(
        -20, inRepertoire, DEFAULT_THRESHOLDS
      );
      expect(isKeyMove).toBe(false);
    });

    it('marks first repertoire deviation as key move', () => {
      const { isKeyMove, keyMoveReason } = GameReviewService.identifyKeyMove(
        undefined, userDeviation, DEFAULT_THRESHOLDS, false, true, false
      );
      expect(isKeyMove).toBe(true);
      expect(keyMoveReason).toBe('repertoire-deviation');
    });

    it('does not mark second deviation (hasAlreadyDeviated=true)', () => {
      const { isKeyMove } = GameReviewService.identifyKeyMove(
        undefined, userDeviation, DEFAULT_THRESHOLDS, true, false, false
      );
      expect(isKeyMove).toBe(false);
    });

    it('marks opponent novelty as key move on first occurrence', () => {
      const { isKeyMove, keyMoveReason } = GameReviewService.identifyKeyMove(
        undefined, opponentNovelty, DEFAULT_THRESHOLDS, false, true, false
      );
      expect(isKeyMove).toBe(true);
      expect(keyMoveReason).toBe('opponent-novelty');
    });

    it('marks transposition back into repertoire', () => {
      const { isKeyMove, keyMoveReason } = GameReviewService.identifyKeyMove(
        undefined, inRepertoire, DEFAULT_THRESHOLDS, true, false, true
      );
      expect(isKeyMove).toBe(true);
      expect(keyMoveReason).toBe('transposition');
    });

    it('no key move when coverage gap (no engine, already deviated)', () => {
      const { isKeyMove } = GameReviewService.identifyKeyMove(
        undefined, coverageGap, DEFAULT_THRESHOLDS, true, false, false
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
